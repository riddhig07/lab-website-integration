import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api, ApiError } from './api';
import { Dialog } from './Dialog';
import { connectUrl, UploadList, useDriveAccount, useUploader } from './DriveUploads';
import type { DriveFolder, DriveItem } from './types';

const GOOGLE_RESULTS: Record<string, { text: string; error?: boolean }> = {
  connected: { text: 'Google account connected. You can upload to Lab Drive now.' },
  cancelled: { text: 'Google connection cancelled.', error: true },
  failed: { text: "Couldn't connect your Google account. Try again, and allow Google Drive access.", error: true },
  unavailable: { text: 'Uploads are not set up on this site yet.', error: true },
};

// Google types the backend can export for download (google/drive.ts EXPORTS).
const EXPORTABLE = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
]);

const canDownload = (item: DriveItem) =>
  !item.isFolder && !item.targetId && (EXPORTABLE.has(item.mimeType) || !item.mimeType.startsWith('application/vnd.google-apps.'));

const driveUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

type Folders = Record<string, DriveFolder>;

/**
 * /drive and /drive/:folderId: an explorer for the lab's Google Drive folder.
 * Everyone can browse and download; members who connect their Google account
 * can upload files and add folders. Folder listings are kept for the life of
 * the page, so the tree and the main pane share them.
 */
export function DrivePage() {
  const { folderId = 'root' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [folders, setFolders] = useState<Folders>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [newFolder, setNewFolder] = useState<{ open: boolean; name: string; busy: boolean; error: string | null }>({ open: false, name: '', busy: false, error: null });
  const fileInput = useRef<HTMLInputElement>(null);
  const { account, reload: reloadAccount } = useDriveAccount();

  const load = useCallback((id: string) => {
    api<DriveFolder>(`/internal/drive/folders/${encodeURIComponent(id)}`)
      .then((folder) => {
        // Store under the real id too, so "root" and the lab folder's id share a listing.
        const realId = folder.path[folder.path.length - 1].id;
        setFolders((f) => ({ ...f, [id]: folder, [realId]: folder }));
      })
      .catch((e: Error) => setErrors((errs) => ({ ...errs, [id]: e.message })));
  }, []);

  const current = folders[folderId];
  const root = folders.root;

  useEffect(() => {
    if (!folders.root && !errors.root) load('root');
    if (!folders[folderId] && !errors[folderId]) load(folderId);
  }, [folderId, folders, errors, load]);

  // Keep the tree open down to the folder being viewed.
  useEffect(() => {
    if (current) setExpanded((e) => new Set([...e, ...current.path.map((p) => p.id)]));
    setFilter('');
  }, [current]);

  const toggle = (id: string) =>
    setExpanded((e) => {
      const next = new Set(e);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Back from Google's consent screen: say how it went, then tidy the URL.
  useEffect(() => {
    const result = searchParams.get('google');
    if (!result) return;
    setNotice(GOOGLE_RESULTS[result] ?? null);
    reloadAccount();
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, reloadAccount]);

  const { uploads, add, clearFinished } = useUploader(load, reloadAccount);

  const error = errors[folderId] ?? errors.root;
  const currentId = current?.path[current.path.length - 1].id;
  const items = current?.items.filter((i) => i.name.toLowerCase().includes(filter.trim().toLowerCase())) ?? [];
  const canUpload = Boolean(account?.uploads_enabled && account.email && currentId);
  const here = `/drive${folderId === 'root' ? '' : `/${folderId}`}`;

  const upload = (files: FileList | File[]) => {
    if (currentId && files.length) add([...files], currentId);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!canUpload) {
      setNotice({ text: 'Connect your Google account to upload.', error: true });
      return;
    }
    // Folders can't be uploaded from a drop; only files are taken.
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.());
    const files = [...e.dataTransfer.files].filter((_, i) => !entries[i]?.isDirectory);
    if (files.length < e.dataTransfer.files.length) setNotice({ text: 'Folders were skipped: create the folder with “New folder”, then drop its files in.', error: true });
    upload(files);
  };

  const createFolder = async () => {
    if (!currentId) return;
    setNewFolder((f) => ({ ...f, busy: true, error: null }));
    try {
      await api(`/internal/drive/folders/${encodeURIComponent(currentId)}/folders`, { method: 'POST', body: { name: newFolder.name } });
      setNewFolder({ open: false, name: '', busy: false, error: null });
      load(currentId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) reloadAccount();
      setNewFolder((f) => ({ ...f, busy: false, error: err instanceof Error ? err.message : String(err) }));
    }
  };

  const disconnect = async () => {
    await api('/internal/drive/account', { method: 'DELETE' }).catch(() => undefined);
    reloadAccount();
    setNotice({ text: 'Google account disconnected.' });
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Lab Drive</h1>
          <p className="muted">
            The {root ? `“${root.path[0].name}”` : 'lab'} Google Drive folder. Downloads work for every portal member;
            uploading and “Open in Drive” need your Google account to have access to the folder.
          </p>
          {account?.email && (
            <p className="muted small drive-account">
              Uploading as <strong>{account.email}</strong> ·{' '}
              <button type="button" className="link small" onClick={() => void disconnect()}>
                Disconnect
              </button>
            </p>
          )}
        </div>
        <div className="button-row drive-actions">
          {currentId && (
            <a className="button secondary" href={driveUrl(currentId)} target="_blank" rel="noreferrer">
              Open in Drive
            </a>
          )}
          {account?.uploads_enabled && !account.email && (
            <a className="button" href={connectUrl(here)} title="Upload as your own Google account">
              Connect Google to upload
            </a>
          )}
          {canUpload && (
            <>
              <button type="button" className="secondary" onClick={() => setNewFolder({ open: true, name: '', busy: false, error: null })}>
                New folder
              </button>
              <button type="button" onClick={() => fileInput.current?.click()}>
                Upload files
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) upload(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          )}
        </div>
      </div>

      {notice && (
        <p className={`notice ${notice.error ? 'bad' : 'ok'}`} role="status">
          {notice.text}{' '}
          <button type="button" className="link small" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <UploadList uploads={uploads} onClear={clearFinished} />

      <Dialog
        open={newFolder.open}
        onClose={() => setNewFolder((f) => ({ ...f, open: false }))}
        title="New folder"
        subtitle={current ? `In ${current.path.map((p) => p.name).join(' / ')}` : undefined}
        footer={
          <div className="button-row">
            <button type="submit" form="new-folder" disabled={newFolder.busy || !newFolder.name.trim()}>
              {newFolder.busy ? 'Creating…' : 'Create'}
            </button>
            <button type="button" className="secondary" onClick={() => setNewFolder((f) => ({ ...f, open: false }))}>
              Cancel
            </button>
          </div>
        }
      >
        <form
          id="new-folder"
          onSubmit={(e) => {
            e.preventDefault();
            void createFolder();
          }}
        >
          <div className="field">
            <label htmlFor="new-folder-name">Name</label>
            <input id="new-folder-name" autoFocus value={newFolder.name} maxLength={255} onChange={(e) => setNewFolder((f) => ({ ...f, name: e.target.value }))} />
          </div>
          {newFolder.error && <p className="error small">{newFolder.error}</p>}
        </form>
      </Dialog>

      <div className="drive">
        <nav className="drive-tree" aria-label="Folders">
          {root ? (
            <TreeNode
              id={root.path[0].id}
              name={root.path[0].name}
              folders={folders}
              expanded={expanded}
              currentId={currentId}
              onToggle={toggle}
              onLoad={load}
            />
          ) : (
            !errors.root && <p className="muted small">Loading…</p>
          )}
        </nav>

        <section
          className={`drive-main${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = canUpload ? 'copy' : 'none';
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={onDrop}
        >
          {dragging && (
            <div className="drop-hint" aria-hidden="true">
              {canUpload ? `Drop to upload to “${current?.path.at(-1)?.name ?? 'this folder'}”` : 'Connect your Google account to upload'}
            </div>
          )}
          {current && (
            <>
              <div className="drive-toolbar">
                <nav className="breadcrumbs" aria-label="Folder path">
                  {current.path.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && <span className="muted"> / </span>}
                      {i === current.path.length - 1 ? <strong>{p.name}</strong> : <Link to={i === 0 ? '/drive' : `/drive/${p.id}`}>{p.name}</Link>}
                    </span>
                  ))}
                </nav>
                <input
                  type="search"
                  placeholder="Filter this folder"
                  aria-label="Filter this folder"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>

              {current.items.length === 0 ? (
                <p className="muted">This folder is empty.{canUpload && ' Drop files here to upload them.'}</p>
              ) : items.length === 0 ? (
                <p className="muted">Nothing matches “{filter}”.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Owner</th>
                        <th>Created</th>
                        <th>Modified</th>
                        <th>Size</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <ItemRow key={item.id} item={item} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {!current && !error && <p className="muted">Loading…</p>}
        </section>
      </div>
    </>
  );
}

function ItemRow({ item }: { item: DriveItem }) {
  const icon = item.iconLink ? <img src={item.iconLink} alt="" width={16} height={16} /> : null;
  return (
    <tr>
      <td className="drive-name">
        {icon}
        {item.isFolder ? (
          <Link to={`/drive/${item.id}`}>{item.name}</Link>
        ) : item.webViewLink ? (
          <a href={item.webViewLink} target="_blank" rel="noreferrer">
            {item.name}
          </a>
        ) : (
          item.name
        )}
        {item.targetId && <span className="muted small"> (shortcut)</span>}
      </td>
      <td className="muted" title={item.owner?.email ?? undefined}>
        {item.owner?.name ?? '—'}
      </td>
      <td className="muted">{item.createdTime ? new Date(item.createdTime).toLocaleDateString() : '—'}</td>
      <td className="muted" title={item.lastModifiedBy ? `Last edited by ${item.lastModifiedBy.name}` : undefined}>
        {new Date(item.modifiedTime).toLocaleDateString()}
      </td>
      <td className="muted">{item.size === null ? '—' : formatSize(item.size)}</td>
      <td className="row-actions">
        {canDownload(item) && (
          <a className="link" href={`/api/internal/drive/files/${item.id}/download`}>
            Download
          </a>
        )}
        {!item.isFolder && item.webViewLink && (
          <a className="link" href={item.webViewLink} target="_blank" rel="noreferrer">
            Open in Drive
          </a>
        )}
      </td>
    </tr>
  );
}

interface TreeNodeProps {
  id: string;
  name: string;
  folders: Folders;
  expanded: Set<string>;
  currentId: string | undefined;
  onToggle: (id: string) => void;
  onLoad: (id: string) => void;
}

/** A folder in the sidebar tree. Its subfolders load the first time it is opened. */
function TreeNode({ id, name, folders, expanded, currentId, onToggle, onLoad }: TreeNodeProps) {
  const open = expanded.has(id);
  const listing = folders[id];
  const subfolders = listing?.items.filter((i) => i.isFolder);

  useEffect(() => {
    if (open && !listing) onLoad(id);
  }, [open, listing, id, onLoad]);

  return (
    <div className="tree-node">
      <div className={`tree-row${id === currentId ? ' active' : ''}`}>
        <button
          type="button"
          className="tree-toggle"
          aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
          aria-expanded={open}
          onClick={() => onToggle(id)}
          disabled={subfolders?.length === 0}
        >
          {subfolders?.length === 0 ? '' : open ? '▾' : '▸'}
        </button>
        <Link to={`/drive/${id}`} title={name}>
          {name}
        </Link>
      </div>
      {open && subfolders && subfolders.length > 0 && (
        <div className="tree-children">
          {subfolders.map((f) => (
            <TreeNode key={f.id} {...{ folders, expanded, currentId, onToggle, onLoad }} id={f.id} name={f.name} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
