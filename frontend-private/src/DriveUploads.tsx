import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { DriveAccount } from './types';

// Uploads to Lab Drive go through the member's own Google account: the
// backend starts a resumable upload as them and the browser sends the file
// straight to Google, so large files don't pass through the portal.

/** Files sent at once; the rest wait their turn. */
const PARALLEL = 3;

export interface Upload {
  id: number;
  name: string;
  size: number;
  loaded: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
  folderId: string;
  /** The Drive link once uploaded. */
  url?: string;
}

/** The member's connected Google account (null until loaded). */
export function useDriveAccount() {
  const [account, setAccount] = useState<DriveAccount | null>(null);
  const reload = useCallback(() => {
    api<DriveAccount>('/internal/drive/account')
      .then(setAccount)
      .catch(() => setAccount({ uploads_enabled: false, email: null }));
  }, []);
  useEffect(reload, [reload]);
  return { account, reload };
}

export const connectUrl = (from: string) => `/api/auth/google?${new URLSearchParams({ from })}`;

/** Sends a file to a resumable upload session, reporting progress. Resolves with Google's file resource. */
export function put(url: string, file: File, onProgress: (loaded: number) => void): Promise<{ id: string; webViewLink?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as { id: string; webViewLink?: string });
        } catch {
          resolve({ id: '' });
        }
      } else reject(new Error(`Google Drive refused the upload (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('The upload was interrupted'));
    xhr.send(file);
  });
}

/**
 * A queue of uploads. `onUploaded(folderId)` runs after each finished file,
 * so the open folder can refresh; `onReconnect` when Google needs consent again.
 */
export function useUploader(onUploaded: (folderId: string) => void, onReconnect: () => void) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const files = useRef(new Map<number, File>());
  const nextId = useRef(1);
  const active = useRef(0);

  const patch = (id: number, fields: Partial<Upload>) => setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...fields } : u)));

  const run = useCallback(
    async (u: Upload) => {
      const file = files.current.get(u.id)!;
      active.current++;
      patch(u.id, { status: 'uploading', loaded: 0 });
      try {
        const { upload_url } = await api<{ upload_url: string }>(`/internal/drive/folders/${encodeURIComponent(u.folderId)}/uploads`, {
          method: 'POST',
          body: { name: file.name, mime_type: file.type, size: file.size },
        });
        const result = await put(upload_url, file, (loaded) => patch(u.id, { loaded }));
        patch(u.id, { status: 'done', loaded: file.size, url: result.webViewLink });
        onUploaded(u.folderId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) onReconnect();
        patch(u.id, { status: 'error', error: err instanceof Error ? err.message : String(err) });
      } finally {
        files.current.delete(u.id);
        active.current--;
      }
    },
    [onUploaded, onReconnect],
  );

  // Start queued uploads while there's room.
  useEffect(() => {
    const queued = uploads.filter((u) => u.status === 'queued');
    for (const u of queued.slice(0, Math.max(0, PARALLEL - active.current))) void run(u);
  }, [uploads, run]);

  const add = useCallback((list: File[], folderId: string) => {
    const added = list.map((f) => {
      const id = nextId.current++;
      files.current.set(id, f);
      return { id, name: f.name, size: f.size, loaded: 0, status: 'queued' as const, folderId };
    });
    setUploads((current) => [...current, ...added]);
  }, []);

  const clearFinished = () => setUploads((list) => list.filter((u) => u.status === 'queued' || u.status === 'uploading'));

  return { uploads, add, clearFinished };
}

export function UploadList({ uploads, onClear }: { uploads: Upload[]; onClear: () => void }) {
  if (uploads.length === 0) return null;
  const busy = uploads.some((u) => u.status === 'queued' || u.status === 'uploading');
  const done = uploads.filter((u) => u.status === 'done').length;
  return (
    <section className="upload-list" aria-label="Uploads">
      <div className="upload-list-head">
        <strong>{busy ? `Uploading ${done + 1} of ${uploads.length}…` : `${done} of ${uploads.length} uploaded`}</strong>
        {!busy && (
          <button type="button" className="link small" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      <ul>
        {uploads.map((u) => {
          const pct = u.size ? Math.round((u.loaded / u.size) * 100) : u.status === 'done' ? 100 : 0;
          return (
            <li key={u.id} className={`upload-${u.status}`}>
              <span className="upload-name" title={u.name}>
                {u.url ? (
                  <a href={u.url} target="_blank" rel="noreferrer">
                    {u.name}
                  </a>
                ) : (
                  u.name
                )}
              </span>
              <span className="upload-status small">
                {u.status === 'queued' ? 'Waiting' : u.status === 'uploading' ? `${pct}%` : u.status === 'done' ? '✓ Uploaded' : '✕ Failed'}
              </span>
              {(u.status === 'uploading' || u.status === 'queued') && (
                <span className="upload-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Uploading ${u.name}`}>
                  <span style={{ width: `${pct}%` }} />
                </span>
              )}
              {u.error && <span className="error small upload-message">{u.error}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
