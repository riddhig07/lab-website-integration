import type { ActionItem, LabMeeting, MeetingSummary } from "@/lib/meeting-hub/types";
import { getDocuments } from "@/lib/meeting-hub/store";

function openaiKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}

export async function transcribeAudio(buffer: Buffer, fileName: string): Promise<string> {
  const key = openaiKey();
  if (!key) {
    return "[Demo] Transcription requires OPENAI_API_KEY. Upload saved; connect API to transcribe.";
  }
  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from(buffer)]), fileName);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

export async function generateSummary(
  meeting: LabMeeting,
  transcript: string,
): Promise<MeetingSummary> {
  const key = openaiKey();
  const base: MeetingSummary = {
    overview: "",
    researchUpdates: [],
    keyDecisions: [],
    actionItems: [],
    nextSteps: [],
    approved: false,
    needsReview: true,
    generatedAt: new Date().toISOString(),
  };

  if (!key || !transcript.trim()) {
    base.overview =
      transcript.trim().length > 0
        ? "Draft summary unavailable without OPENAI_API_KEY. Review transcript manually."
        : "Add a transcript or notes to generate a summary.";
    base.needsReview = true;
    return base;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You summarize lab meetings. Never invent decisions, assignments, deadlines, or experimental results. Mark uncertainty. Return JSON with keys: overview, researchUpdates (array), keyDecisions (array), suggestedActions (array of {description, assignee?, dueDate?}), nextSteps (array).",
        },
        {
          role: "user",
          content: `Meeting: ${meeting.title} on ${meeting.dateKey}\n\nTranscript/notes:\n${transcript.slice(0, 12000)}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Summary generation failed (${res.status})`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    overview?: string;
    researchUpdates?: string[];
    keyDecisions?: string[];
    suggestedActions?: { description: string; assignee?: string; dueDate?: string }[];
    nextSteps?: string[];
  };

  base.overview = parsed.overview ?? "";
  base.researchUpdates = parsed.researchUpdates ?? [];
  base.keyDecisions = parsed.keyDecisions ?? [];
  base.nextSteps = parsed.nextSteps ?? [];
  base.actionItems = (parsed.suggestedActions ?? []).map((a, i) => ({
    id: `${meeting.id}-ai-${i}`,
    meetingId: meeting.id,
    description: a.description,
    assignee: a.assignee,
    dueDate: a.dueDate,
    status: "suggested" as const,
    source: "ai" as const,
    createdAt: new Date().toISOString(),
  }));
  base.needsReview = true;
  return base;
}

export async function assistantAnswer(
  question: string,
  meetings: LabMeeting[],
): Promise<{ answer: string; sources: { title: string; meetingId?: string; driveFileId?: string }[] }> {
  const docs = await getDocuments();
  const q = question.toLowerCase();
  const hits = docs.filter(
    (d) =>
      d.extractedText?.toLowerCase().includes(q) ||
      d.name.toLowerCase().includes(q) ||
      d.folderPath.toLowerCase().includes(q),
  );
  const meetingHits = meetings.filter(
    (m) =>
      m.summary?.overview.toLowerCase().includes(q) ||
      m.transcript?.text.toLowerCase().includes(q) ||
      m.title.toLowerCase().includes(q),
  );

  const sources = [
    ...meetingHits.slice(0, 3).map((m) => ({ title: m.title, meetingId: m.id })),
    ...hits.slice(0, 5).map((d) => ({ title: d.name, driveFileId: d.driveFileId })),
  ];

  if (sources.length === 0) {
    return {
      answer:
        "I could not find relevant meeting notes or Drive documents for that question. Try syncing Drive or rephrasing.",
      sources: [],
    };
  }

  const context = [
    ...meetingHits.map(
      (m) =>
        `Meeting ${m.dateKey} ${m.title}\nSummary: ${m.summary?.overview ?? "—"}\nTranscript excerpt: ${(m.transcript?.text ?? "").slice(0, 1500)}`,
    ),
    ...hits.map((d) => `Doc: ${d.name} (${d.folderPath})\n${(d.extractedText ?? "").slice(0, 1500)}`),
  ].join("\n\n---\n\n");

  const key = openaiKey();
  if (!key) {
    return {
      answer: `[Retrieval only — set OPENAI_API_KEY for natural-language answers]\n\nTop matches:\n${context.slice(0, 2000)}`,
      sources,
    };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Answer using ONLY the provided meeting/document excerpts. Cite meeting dates or document names. If insufficient evidence, say so.",
        },
        { role: "user", content: `Question: ${question}\n\nSources:\n${context.slice(0, 14000)}` },
      ],
    }),
  });
  if (!res.ok) {
    return { answer: "Assistant request failed.", sources };
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { answer: data.choices?.[0]?.message?.content ?? "", sources };
}
