"use client";

import { useEffect, useRef, useState } from "react";

type MeetingOption = { id: string; title: string; dateKey: string };

export function AINoteTaker() {
  const [meetings, setMeetings] = useState<MeetingOption[]>([]);
  const [meetingId, setMeetingId] = useState("");
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/meeting-hub/meetings")
      .then((r) => r.json())
      .then((d: { meetings: MeetingOption[] }) => {
        setMeetings(d.meetings ?? []);
        if (d.meetings?.[0]) setMeetingId(d.meetings[0].id);
      });
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  function drawWaveform() {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      ctx.fillStyle = "#0a101a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#2dd4bf";
      ctx.beginPath();
      const sliceWidth = canvas.width / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();
      animRef.current = requestAnimationFrame(loop);
    };
    loop();
  }

  async function startRecording() {
    if (!consent) {
      setStatus("Confirm participant consent before recording.");
      return;
    }
    if (!meetingId) {
      setStatus("Select a meeting.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      source.connect(analyser);
      analyserRef.current = analyser;
      drawWaveform();

      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await transcribeBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      mediaRef.current = rec;
      setRecording(true);
      setPaused(false);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
      setStatus("Recording…");
    } catch {
      setStatus("Microphone permission denied or unavailable.");
    }
  }

  function pauseRecording() {
    mediaRef.current?.pause();
    setPaused(true);
    setStatus("Paused");
  }

  function resumeRecording() {
    mediaRef.current?.resume();
    setPaused(false);
    setStatus("Recording…");
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
    setPaused(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setStatus("Processing audio…");
  }

  async function transcribeBlob(blob: Blob) {
    const form = new FormData();
    form.append("file", blob, "meeting.webm");
    const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
    const data = await res.json();
    if (data.error) {
      setStatus(data.error);
      return;
    }
    setTranscript(data.text ?? "");
    setStatus("Transcript ready — generate summary.");
    await fetch(`/api/meeting-hub/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: { text: data.text, updatedAt: new Date().toISOString() },
      }),
    });
  }

  async function uploadFile(file: File) {
    if (!consent) {
      setStatus("Confirm consent before upload.");
      return;
    }
    setStatus("Uploading…");
    await transcribeBlob(file);
  }

  async function generateSummary() {
    setStatus("Generating summary…");
    const res = await fetch("/api/ai/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, transcript }),
    });
    const data = await res.json();
    if (data.error) {
      setStatus(data.error);
      return;
    }
    setSummary(JSON.stringify(data.summary, null, 2));
    setStatus("Draft summary ready for review (not published).");
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
        <h2 className="font-display text-lg font-semibold text-white">Recording</h2>
        <label className="mt-4 block text-sm text-zinc-500">
          Meeting
          <select
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          >
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.dateKey} — {m.title}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 flex items-start gap-2 text-sm text-zinc-400">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          All participants have consented to recording.
        </label>
        <canvas ref={canvasRef} width={600} height={80} className="mt-4 w-full rounded-xl bg-black/40" />
        <p className="mt-2 text-center font-mono text-2xl text-teal-300">
          {mm}:{ss}
        </p>
        <p className="text-center text-xs text-zinc-500">{recording ? (paused ? "Paused" : "Recording") : "Idle"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={startRecording} disabled={recording} className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-[#042f2e]">
            Start
          </button>
          <button type="button" onClick={pauseRecording} disabled={!recording || paused} className="rounded-xl border border-white/15 px-4 py-2 text-sm">
            Pause
          </button>
          <button type="button" onClick={resumeRecording} disabled={!paused} className="rounded-xl border border-white/15 px-4 py-2 text-sm">
            Resume
          </button>
          <button type="button" onClick={stopRecording} disabled={!recording && !paused} className="rounded-xl border border-red-400/30 px-4 py-2 text-sm text-red-300">
            Stop
          </button>
        </div>
        <label className="mt-4 block text-sm text-zinc-500">
          Or upload audio
          <input
            type="file"
            accept="audio/*,video/webm"
            className="mt-1 block w-full text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
            }}
          />
        </label>
        {status ? <p className="mt-4 text-sm text-amber-200/90">{status}</p> : null}
      </section>

      <div className="space-y-6">
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <h3 className="font-display font-semibold text-white">Transcript</h3>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={12}
            className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-300"
            placeholder="Transcript appears here…"
          />
          <button type="button" onClick={generateSummary} className="mt-3 rounded-xl bg-teal-500/90 px-4 py-2 text-sm font-semibold text-[#042f2e]">
            Generate AI summary (draft)
          </button>
        </section>
        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <h3 className="font-display font-semibold text-white">Summary draft</h3>
          <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-black/30 p-3 text-xs text-zinc-400 whitespace-pre-wrap">
            {summary || "Approve after review before publishing to dashboard or Drive."}
          </pre>
        </section>
      </div>
    </div>
  );
}
