export type MeetingType = "monday" | "thursday";

export type DocumentKind =
  | "agenda"
  | "notes"
  | "summary"
  | "transcript"
  | "recording"
  | "research"
  | "other";

export type DriveDocumentRecord = {
  driveFileId: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime: string;
  folderPath: string;
  kind: DocumentKind;
  extractedText?: string;
  meetingId?: string | null;
  manuallyLinked?: boolean;
  lastSyncedAt: string;
};

export type ActionItemStatus = "suggested" | "confirmed" | "done";

export type ActionItem = {
  id: string;
  meetingId: string;
  description: string;
  assignee?: string;
  dueDate?: string;
  status: ActionItemStatus;
  source: "ai" | "manual";
  createdAt: string;
};

export type MeetingSummary = {
  overview: string;
  researchUpdates: string[];
  keyDecisions: string[];
  actionItems: ActionItem[];
  nextSteps: string[];
  approved: boolean;
  approvedAt?: string;
  needsReview: boolean;
  generatedAt?: string;
};

export type MeetingTranscript = {
  text: string;
  segments?: { start: number; end: number; speaker?: string; text: string }[];
  updatedAt: string;
};

export type MeetingRecording = {
  storagePath?: string;
  uploadedFileName?: string;
  durationSec?: number;
  createdAt: string;
};

export type LabMeeting = {
  id: string;
  dateKey: string;
  type: MeetingType;
  title: string;
  startIso: string;
  endIso: string;
  agendaPreview?: string;
  linkedDriveFileIds: string[];
  summary?: MeetingSummary;
  transcript?: MeetingTranscript;
  recording?: MeetingRecording;
  relatedProjects: string[];
  followUpFromMeetingId?: string;
  updatedAt: string;
};

export type SyncState = {
  lastSyncAt?: string;
  lastSyncError?: string;
  driveStartPageToken?: string;
  documentCount: number;
  status: "idle" | "syncing" | "error" | "demo";
};

export type HubConfig = {
  driveRootId?: string;
  exportFolderPath?: string;
  oauthConnected: boolean;
  serviceAccountConfigured: boolean;
};
