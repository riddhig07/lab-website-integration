# Transcriber

Speech-to-text with speaker labels for the portal's Meetings page: [WhisperX](https://github.com/m-bain/whisperX) (faster-whisper + word alignment) and [pyannote](https://github.com/pyannote/pyannote-audio) speaker diarization. A small FastAPI job queue; see the docstring in `app.py` for the API (`POST /jobs`, `GET /jobs/{id}`).

## One-time setup: HuggingFace token

Speaker separation uses a gated pyannote model. With a HuggingFace account:

1. Open https://huggingface.co/pyannote/speaker-diarization-3.1 and https://huggingface.co/pyannote/segmentation-3.0 and accept the terms on each (they ask to share your name and email with the authors).
2. Create a **read** token at https://huggingface.co/settings/tokens.
3. Put it where the service runs: `HF_TOKEN=hf_...` in `transcriber/.env` locally (gitignored), or the `HF_TOKEN` variable on the Railway `transcriber` service.

Without it the service still transcribes, but every job fails at the speaker step with a message saying so.

WhisperX 3.7 (this pin) uses pyannote 3 and `speaker-diarization-3.1`. WhisperX 3.8 is moving to pyannote 4 and `speaker-diarization-community-1`; when it is released, update `requirements.txt` and `DIARIZATION_MODEL` together and accept that model's terms instead.

## Run locally

Needs Python 3.12 and ffmpeg on PATH.

```sh
cd transcriber
uv venv --python 3.12 .venv
# NVIDIA GPU (RTX 50-series needs cu128):
uv pip install --python .venv/Scripts/python.exe --torch-backend=cu128 -r requirements.txt
# CPU only: add  --torch-backend=cpu
.venv/Scripts/python.exe -m uvicorn app:app --port 8000 --env-file .env
```

Then in `backend/.env`: `MEETINGS_TRANSCRIBER_URL=http://localhost:8000`. (On macOS/Linux the venv python is `.venv/bin/python`.)

## Settings (environment)

| Variable | Default | |
| --- | --- | --- |
| `HF_TOKEN` | | HuggingFace read token (see above) |
| `TRANSCRIBER_TOKEN` | | If set, requests need `Authorization: Bearer <it>`; the API sends `MEETINGS_TRANSCRIBER_TOKEN` |
| `WHISPER_MODEL` | `small` | `tiny`/`base` are faster and less accurate; `medium`/`large-v3` the reverse (use a GPU) |
| `DIARIZATION_MODEL` | `pyannote/speaker-diarization-3.1` | |
| `DEVICE`, `COMPUTE_TYPE`, `BATCH_SIZE` | auto | `cuda`/`float16`/16 with a GPU, else `cpu`/`int8`/4 |
| `MAX_UPLOAD_MB` | `500` | |

## Deploy (Railway)

The `transcriber` service is declared in `.railway/railway.ts` (Dockerfile build, CPU torch, no public domain). Set its `HF_TOKEN` and `TRANSCRIBER_TOKEN` secrets and the API's matching `MEETINGS_TRANSCRIBER_TOKEN`, then `npm run deploy:transcriber`. Models download on first use (about 1 GB); mount a volume at `/models` to keep them across deploys.

## Security note

`app.py` sets `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=1`: WhisperX 3.7's bundled voice-activity model and the pyannote 3 pipelines are pickles that PyTorch 2.6+ refuses to load otherwise. They come from the whisperx package and the `pyannote` organization on HuggingFace. Keep the service off the public internet (it is on Railway's private network) and don't point `DIARIZATION_MODEL` at models you don't trust.
