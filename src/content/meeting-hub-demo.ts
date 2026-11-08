import type { DriveDocumentRecord } from "@/lib/meeting-hub/types";

/** Demo index when Google Drive API credentials are not configured. */
export const demoDriveDocuments: DriveDocumentRecord[] = [
  {
    driveFileId: "demo-10-1-agenda",
    name: "10_1_26 Notes and Agenda.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    webViewLink: undefined,
    modifiedTime: "2026-10-01T17:06:00.000Z",
    folderPath: "Fall 2026/Meeting Notes-Agenda",
    kind: "agenda",
    meetingId: "2026-10-01-thu",
    lastSyncedAt: new Date().toISOString(),
    extractedText: "[Demo] Fall kickoff agenda — connect Drive to load full text.",
  },
  {
    driveFileId: "demo-10-5-notes",
    name: "10_5_26 Notes.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    modifiedTime: "2026-10-05T13:25:00.000Z",
    folderPath: "Fall 2026/Meeting Notes-Agenda",
    kind: "notes",
    meetingId: "2026-10-06-mon",
    lastSyncedAt: new Date().toISOString(),
  },
  {
    driveFileId: "demo-10-12-notes",
    name: "10_12_2026.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    modifiedTime: "2026-10-12T13:37:00.000Z",
    folderPath: "Fall 2026/Meeting Notes-Agenda",
    kind: "notes",
    meetingId: "2026-10-12-mon",
    lastSyncedAt: new Date().toISOString(),
  },
];
