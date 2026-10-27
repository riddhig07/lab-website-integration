import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from './api';
import type { DriveFolder, DriveItem } from './types';

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
 * /drive and /drive/:folderId: a read-only explorer for the lab's Google
 * Drive folder. Folder listings are kept for the life of the page, so the
 * tree and the main pane share them.
 */
export function DrivePage() {
  const { folderId = 'root' } = useParams();
  const [folders, setFolders] = useState<Folders>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

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

  const error = errors[folderId] ?? errors.root;
  const currentId = current?.path[current.path.length - 1].id;
  const items = current?.items.filter((i) => i.name.toLowerCase().includes(filter.trim().toLowerCase())) ?? [];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Lab Drive</h1>
          <p className="muted">
            The {root ? `“${root.path[0].name}”` : 'lab'} Google Drive folder. Downloads work for every portal member;
            “Open in Drive” needs access to the folder in Google Drive.
          </p>
        </div>
        {currentId && (
          <a className="button secondary" href={driveUrl(currentId)} target="_blank" rel="noreferrer">
            Open folder in Drive
          </a>
        )}
      </div>

      {error && <p className="error">{error}</p>}

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

        <section className="drive-main">
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
                <p className="muted">This folder is empty.</p>
              ) : items.length === 0 ? (
                <p className="muted">Nothing matches “{filter}”.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
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
      <td className="muted">{new Date(item.modifiedTime).toLocaleDateString()}</td>
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
