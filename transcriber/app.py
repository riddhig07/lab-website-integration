"""Transcriber service: WhisperX speech-to-text + pyannote speaker diarization.

A small job queue over HTTP, because a long meeting takes much longer than a
request should stay open:

    POST   /jobs        multipart: audio (file), num_speakers (optional int) -> {"id"}
    GET    /jobs/{id}   -> {"status": queued|running|done|failed, "stage", "result", "error"}
    DELETE /jobs/{id}
    GET    /health

result = {"language", "duration", "segments": [{"speaker", "start", "end", "text"}]}

Jobs run one at a time on a single worker thread (the models are big). Results
are held in memory and dropped after JOB_TTL_S.
"""

from __future__ import annotations

import inspect
import logging
import os
import queue
import secrets
import shutil
import tempfile
import threading
import time
import traceback
import uuid
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile

# WhisperX 3.7's bundled VAD checkpoint and the pyannote 3 pipelines are
# pickles with omegaconf objects, which torch >= 2.6 refuses to load by default.
# They come from the whisperx package and the pyannote org on HuggingFace, so
# allow it for this service only. Must be set before torch loads anything.
os.environ.setdefault("TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD", "1")

log = logging.getLogger("transcriber")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

TOKEN = os.environ.get("TRANSCRIBER_TOKEN", "")
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or None
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
# WhisperX 3.7.x pins pyannote.audio 3, whose best pipeline is speaker-diarization-3.1.
# WhisperX 3.8+ moves to pyannote 4 and speaker-diarization-community-1: switch
# this (and the whisperx pin in requirements.txt) together.
DIARIZATION_MODEL = os.environ.get("DIARIZATION_MODEL", "pyannote/speaker-diarization-3.1")
JOB_TTL_S = int(os.environ.get("JOB_TTL_S", "7200"))
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "500")) * 1024 * 1024

app = FastAPI(title="Lab transcriber")


def require_token(authorization: str | None = Header(default=None)) -> None:
    if not TOKEN:
        return
    supplied = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    if not secrets.compare_digest(supplied, TOKEN):
        raise HTTPException(status_code=401, detail="Bad or missing bearer token")


# --------------------------------------------------------------------------
# Models, loaded on the first job so the service starts (and answers /health) fast.


class Engine:
    def __init__(self) -> None:
        import torch

        self.torch = torch
        self.device = os.environ.get("DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")
        self.compute_type = os.environ.get("COMPUTE_TYPE") or ("float16" if self.device == "cuda" else "int8")
        self.batch_size = int(os.environ.get("BATCH_SIZE", "16" if self.device == "cuda" else "4"))
        self.asr = None
        self.align_models: dict[str, tuple[Any, Any]] = {}
        self.diarizer = None

    def load_asr(self):
        import whisperx

        if self.asr is None:
            log.info("Loading Whisper %s on %s (%s)", WHISPER_MODEL, self.device, self.compute_type)
            self.asr = whisperx.load_model(WHISPER_MODEL, self.device, compute_type=self.compute_type)
        return self.asr

    def load_aligner(self, language: str):
        import whisperx

        if language not in self.align_models:
            log.info("Loading alignment model for %s", language)
            self.align_models[language] = whisperx.load_align_model(language_code=language, device=self.device)
        return self.align_models[language]

    def load_diarizer(self):
        if self.diarizer is None:
            if not HF_TOKEN:
                raise RuntimeError(
                    "HF_TOKEN is not set. Speaker diarization needs a HuggingFace token whose account has accepted "
                    f"the terms of {DIARIZATION_MODEL}."
                )
            try:
                from whisperx.diarize import DiarizationPipeline
            except ImportError:  # older whisperx
                from whisperx import DiarizationPipeline  # type: ignore[attr-defined]

            params = inspect.signature(DiarizationPipeline.__init__).parameters
            kwargs: dict[str, Any] = {"device": self.device}
            kwargs["token" if "token" in params else "use_auth_token"] = HF_TOKEN
            if "model_name" in params:
                kwargs["model_name"] = DIARIZATION_MODEL
            log.info("Loading diarization model %s", DIARIZATION_MODEL)
            self.diarizer = DiarizationPipeline(**kwargs)
        return self.diarizer


engine: Engine | None = None


def get_engine() -> Engine:
    global engine
    if engine is None:
        engine = Engine()
    return engine


# --------------------------------------------------------------------------
# Jobs


class Job:
    def __init__(self, path: Path, num_speakers: int | None) -> None:
        self.id = uuid.uuid4().hex
        self.path = path
        self.num_speakers = num_speakers
        self.status = "queued"
        self.stage = "queued"
        self.result: dict[str, Any] | None = None
        self.error: str | None = None
        self.created = time.time()
        self.timings: dict[str, float] = {}


jobs: dict[str, Job] = {}
pending: "queue.Queue[Job]" = queue.Queue()


def run(job: Job) -> None:
    import whisperx

    eng = get_engine()
    started = time.time()

    def stage(name: str) -> float:
        job.stage = name
        log.info("[%s] %s", job.id[:8], name)
        return time.time()

    t = stage("loading audio")
    audio = whisperx.load_audio(str(job.path))
    duration = len(audio) / 16000
    job.timings["load_s"] = time.time() - t

    t = stage("transcribing")
    result = eng.load_asr().transcribe(audio, batch_size=eng.batch_size)
    language = result.get("language") or "en"
    job.timings["transcribe_s"] = time.time() - t

    t = stage("aligning words")
    try:
        model_a, metadata = eng.load_aligner(language)
        result = whisperx.align(result["segments"], model_a, metadata, audio, eng.device, return_char_alignments=False)
    except Exception as err:  # no alignment model for this language: segment-level timing is enough
        log.warning("Alignment skipped: %s", err)
    job.timings["align_s"] = time.time() - t

    t = stage("identifying speakers")
    diarizer = eng.load_diarizer()
    options: dict[str, Any] = {}
    if job.num_speakers:
        options["num_speakers"] = job.num_speakers
    diarization = diarizer(audio, **options)
    result = whisperx.assign_word_speakers(diarization, result)
    job.timings["diarize_s"] = time.time() - t

    segments = [
        {
            "speaker": seg.get("speaker") or "UNKNOWN",
            "start": round(float(seg["start"]), 2),
            "end": round(float(seg["end"]), 2),
            "text": seg["text"].strip(),
        }
        for seg in result["segments"]
        if seg.get("text", "").strip()
    ]
    job.timings["total_s"] = time.time() - started
    job.result = {
        "language": language,
        "duration": round(duration, 2),
        "segments": segments,
        "timings": {k: round(v, 1) for k, v in job.timings.items()},
        "device": eng.device,
        "whisper_model": WHISPER_MODEL,
    }


def worker() -> None:
    while True:
        job = pending.get()
        job.status = "running"
        try:
            run(job)
            job.status = "done"
            job.stage = "done"
        except Exception as err:  # reported to the caller, not fatal to the worker
            log.error("[%s] failed:\n%s", job.id[:8], traceback.format_exc())
            job.status = "failed"
            job.error = f"{type(err).__name__}: {err}"
        finally:
            shutil.rmtree(job.path.parent, ignore_errors=True)


def sweeper() -> None:
    while True:
        time.sleep(300)
        cutoff = time.time() - JOB_TTL_S
        for job_id in [j.id for j in jobs.values() if j.created < cutoff and j.status in ("done", "failed")]:
            jobs.pop(job_id, None)


threading.Thread(target=worker, daemon=True, name="worker").start()
threading.Thread(target=sweeper, daemon=True, name="sweeper").start()


# --------------------------------------------------------------------------
# HTTP


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "whisper_model": WHISPER_MODEL,
        "diarization_model": DIARIZATION_MODEL,
        "hf_token": bool(HF_TOKEN),
        "device": engine.device if engine else None,
        "queued": pending.qsize(),
    }


@app.post("/jobs", status_code=202, dependencies=[Depends(require_token)])
async def create_job(audio: UploadFile = File(...), num_speakers: int | None = Form(default=None)) -> dict[str, str]:
    if num_speakers is not None and not 1 <= num_speakers <= 20:
        raise HTTPException(status_code=400, detail="num_speakers must be between 1 and 20")
    folder = Path(tempfile.mkdtemp(prefix="job-"))
    suffix = Path(audio.filename or "").suffix[:10] or ".audio"
    path = folder / f"audio{suffix}"
    size = 0
    with path.open("wb") as out:
        while chunk := await audio.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                shutil.rmtree(folder, ignore_errors=True)
                raise HTTPException(status_code=413, detail="Recording is too large")
            out.write(chunk)
    if size == 0:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Empty upload")
    job = Job(path, num_speakers)
    jobs[job.id] = job
    pending.put(job)
    return {"id": job.id}


@app.get("/jobs/{job_id}", dependencies=[Depends(require_token)])
def get_job(job_id: str) -> dict[str, Any]:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No such job (the service may have restarted)")
    return {"status": job.status, "stage": job.stage, "error": job.error, "result": job.result}


@app.delete("/jobs/{job_id}", status_code=204, dependencies=[Depends(require_token)])
def delete_job(job_id: str) -> None:
    jobs.pop(job_id, None)
