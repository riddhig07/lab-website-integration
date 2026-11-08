import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type {
  ActionItem,
  DriveDocumentRecord,
  LabMeeting,
  SyncState,
} from "@/lib/meeting-hub/types";

const DEFAULT_DIR = path.join(process.cwd(), "data", "meeting-hub");

function dataDir(): string {
  return process.env.MEETING_HUB_DATA_DIR ?? DEFAULT_DIR;
}

async function ensureDir() {
  await mkdir(dataDir(), { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path.join(dataDir(), file), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown) {
  await ensureDir();
  await writeFile(path.join(dataDir(), file), JSON.stringify(value, null, 2), "utf8");
}

export async function getSyncState(): Promise<SyncState> {
  return readJson<SyncState>("sync-state.json", {
    documentCount: 0,
    status: "idle",
  });
}

export async function setSyncState(state: SyncState) {
  await writeJson("sync-state.json", state);
}

export async function getDocuments(): Promise<DriveDocumentRecord[]> {
  return readJson<DriveDocumentRecord[]>("documents.json", []);
}

export async function saveDocuments(docs: DriveDocumentRecord[]) {
  await writeJson("documents.json", docs);
}

export async function getMeetings(): Promise<LabMeeting[]> {
  return readJson<LabMeeting[]>("meetings.json", []);
}

export async function saveMeetings(meetings: LabMeeting[]) {
  await writeJson("meetings.json", meetings);
}

export async function getMeeting(id: string): Promise<LabMeeting | null> {
  const meetings = await getMeetings();
  return meetings.find((m) => m.id === id) ?? null;
}

export async function upsertMeeting(meeting: LabMeeting) {
  const meetings = await getMeetings();
  const idx = meetings.findIndex((m) => m.id === meeting.id);
  if (idx >= 0) meetings[idx] = meeting;
  else meetings.push(meeting);
  meetings.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  await saveMeetings(meetings);
}

export async function getActionItems(): Promise<ActionItem[]> {
  return readJson<ActionItem[]>("action-items.json", []);
}

export async function saveActionItems(items: ActionItem[]) {
  await writeJson("action-items.json", items);
}

export async function getApprovedSummaries(limit = 5): Promise<LabMeeting[]> {
  const meetings = await getMeetings();
  return meetings
    .filter((m) => m.summary?.approved)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
    .slice(0, limit);
}
