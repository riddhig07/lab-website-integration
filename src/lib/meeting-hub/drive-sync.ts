import {
  driveConfigured,
  driveRootId,
  exportDriveFileText,
  getDriveStartPageToken,
  listDriveChanges,
  listDriveChildren,
} from "@/lib/google-drive";
import { classifyDocument, suggestMeetingLink } from "@/lib/meeting-hub/doc-classify";
import { generateMeetingInstances } from "@/lib/meeting-hub/calendar-meetings";
import { meetingIdFrom } from "@/lib/meeting-hub/meeting-id";
import {
  getDocuments,
  getMeetings,
  getSyncState,
  saveDocuments,
  saveMeetings,
  setSyncState,
} from "@/lib/meeting-hub/store";
import type { DriveDocumentRecord, LabMeeting } from "@/lib/meeting-hub/types";
import { demoDriveDocuments } from "@/content/meeting-hub-demo";

async function walkFolder(
  folderId: string,
  folderPath: string,
  out: DriveDocumentRecord[],
  depth = 0,
): Promise<void> {
  if (depth > 8) return;
  const children = await listDriveChildren(folderId);
  for (const item of children) {
    if (item.isFolder) {
      await walkFolder(item.id, `${folderPath}/${item.name}`, out, depth + 1);
      continue;
    }
    const kind = classifyDocument(item.name, folderPath);
    const suggest = suggestMeetingLink(item.name, folderPath);
    const meetingId = suggest ? meetingIdFrom(suggest.dateKey, suggest.type) : null;
    let extractedText = "";
    try {
      extractedText = await exportDriveFileText(item.id, item.mimeType);
    } catch {
      extractedText = "";
    }
    out.push({
      driveFileId: item.id,
      name: item.name,
      mimeType: item.mimeType,
      webViewLink: item.webViewLink ?? undefined,
      modifiedTime: item.modifiedTime ?? new Date().toISOString(),
      folderPath,
      kind,
      meetingId,
      extractedText: extractedText.slice(0, 50_000),
      lastSyncedAt: new Date().toISOString(),
    });
  }
}

function mergeMeetingsWithDocs(meetings: LabMeeting[], docs: DriveDocumentRecord[]): LabMeeting[] {
  const byId = new Map(meetings.map((m) => [m.id, { ...m }]));
  for (const doc of docs) {
    if (!doc.meetingId) continue;
    const m = byId.get(doc.meetingId);
    if (!m) continue;
    if (!m.linkedDriveFileIds.includes(doc.driveFileId)) {
      m.linkedDriveFileIds.push(doc.driveFileId);
    }
    if (doc.kind === "agenda" && doc.extractedText) {
      m.agendaPreview = doc.extractedText.slice(0, 280);
    }
    m.updatedAt = new Date().toISOString();
  }
  return [...byId.values()];
}

export async function runFullDriveSync(): Promise<{ ok: boolean; message: string; demo?: boolean }> {
  if (!driveConfigured()) {
    await saveDocuments(demoDriveDocuments);
    const meetings = mergeMeetingsWithDocs(generateMeetingInstances(), demoDriveDocuments);
    await saveMeetings(meetings);
    await setSyncState({
      status: "demo",
      documentCount: demoDriveDocuments.length,
      lastSyncAt: new Date().toISOString(),
      lastSyncError: undefined,
    });
    return {
      ok: true,
      demo: true,
      message: "Demo index loaded from Fall 2026 structure. Configure Drive API for live sync.",
    };
  }

  await setSyncState({
    ...(await getSyncState()),
    status: "syncing",
    lastSyncError: undefined,
  });

  try {
    const root = driveRootId();
    if (!root) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID is not set");

    const existing = await getDocuments();
    const existingMap = new Map(existing.map((d) => [d.driveFileId, d]));

    const state = await getSyncState();
    let docs: DriveDocumentRecord[];

    if (state.driveStartPageToken) {
      const { changes, newPageToken } = await listDriveChanges(state.driveStartPageToken);
      docs = [...existing];
      for (const ch of changes) {
        if (ch.removed || !ch.file?.id) {
          docs = docs.filter((d) => d.driveFileId !== ch.fileId);
          continue;
        }
        const f = ch.file;
        if (!f.name || !f.mimeType) continue;
        const folderPath = existingMap.get(f.id!)?.folderPath ?? "Fall 2026";
        const kind = classifyDocument(f.name, folderPath);
        const suggest = suggestMeetingLink(f.name, folderPath);
        let extractedText = existingMap.get(f.id!)?.extractedText ?? "";
        try {
          extractedText = await exportDriveFileText(f.id!, f.mimeType);
        } catch {
          /* keep prior */
        }
        const rec: DriveDocumentRecord = {
          driveFileId: f.id!,
          name: f.name,
          mimeType: f.mimeType,
          webViewLink: f.webViewLink ?? undefined,
          modifiedTime: f.modifiedTime ?? new Date().toISOString(),
          folderPath,
          kind,
          meetingId: suggest ? meetingIdFrom(suggest.dateKey, suggest.type) : existingMap.get(f.id!)?.meetingId,
          manuallyLinked: existingMap.get(f.id!)?.manuallyLinked,
          extractedText: extractedText.slice(0, 50_000),
          lastSyncedAt: new Date().toISOString(),
        };
        const idx = docs.findIndex((d) => d.driveFileId === rec.driveFileId);
        if (idx >= 0) docs[idx] = rec;
        else docs.push(rec);
      }
      await setSyncState({
        status: "idle",
        documentCount: docs.length,
        lastSyncAt: new Date().toISOString(),
        driveStartPageToken: newPageToken,
      });
    } else {
      docs = [];
      await walkFolder(root, "Lab Drive", docs);
      const pageToken = await getDriveStartPageToken();
      await setSyncState({
        status: "idle",
        documentCount: docs.length,
        lastSyncAt: new Date().toISOString(),
        driveStartPageToken: pageToken,
      });
    }

    await saveDocuments(docs);
    const calendarMeetings = generateMeetingInstances();
    const stored = await getMeetings();
    const mergedCalendar = calendarMeetings.map((gen) => {
      const prev = stored.find((s) => s.id === gen.id);
      return prev ? { ...gen, ...prev, startIso: gen.startIso, endIso: gen.endIso, title: gen.title } : gen;
    });
    await saveMeetings(mergeMeetingsWithDocs(mergedCalendar, docs));
    return { ok: true, message: `Synced ${docs.length} documents.` };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    await setSyncState({
      ...(await getSyncState()),
      status: "error",
      lastSyncError: message,
    });
    return { ok: false, message };
  }
}

export async function searchDocuments(query: string): Promise<DriveDocumentRecord[]> {
  const q = query.toLowerCase().trim();
  const docs = await getDocuments();
  if (!q) return docs.slice(0, 50);
  return docs.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.folderPath.toLowerCase().includes(q) ||
      (d.extractedText?.toLowerCase().includes(q) ?? false),
  );
}
