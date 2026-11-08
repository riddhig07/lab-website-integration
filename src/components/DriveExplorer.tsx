"use client";

import { useCallback, useEffect, useState } from "react";

type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string | null;
  webViewLink?: string | null;
  iconLink?: string | null;
  size?: string | null;
  isFolder: boolean;
};

type FolderNode = {
  id: string;
  name: string;
  children?: FolderNode[];
  loaded?: boolean;
};

function formatSize(size?: string | null) {
  if (!size) return "";
  const n = Number(size);
  if (Number.isNaN(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DriveExplorer() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rootId, setRootId] = useState<string | null>(null);
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState("Lab Drive");
  const [folders, setFolders] = useState<DriveItem[]>([]);
  const [files, setFiles] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const fetchFolder = useCallback(async (folderId: string) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/drive/children?folderId=${encodeURIComponent(folderId)}`);
    const data = await res.json();
    setLoading(false);

    if (res.status === 503) {
      setConfigured(false);
      setError(data.error ?? "Drive not configured");
      return null;
    }
    if (!res.ok) {
      setError(data.error ?? "Failed to load folder");
      return null;
    }

    setConfigured(true);
    setRootId((prev) => prev ?? data.folderId);
    return data as {
      folderId: string;
      folders: DriveItem[];
      files: DriveItem[];
    };
  }, []);

  useEffect(() => {
    (async () => {
      const data = await fetchFolder("root");
      if (!data) return;
      setSelectedId(data.folderId);
      setFolders(data.folders);
      setFiles(data.files);
      setTree(
        data.folders.map((f) => ({
          id: f.id,
          name: f.name,
          loaded: false,
        })),
      );
    })();
  }, [fetchFolder]);

  async function selectFolder(id: string, name: string) {
    setSelectedId(id);
    setSelectedName(name);
    const data = await fetchFolder(id);
    if (data) {
      setFolders(data.folders);
      setFiles(data.files);
    }
  }

  async function toggleExpand(node: FolderNode) {
    const next = new Set(expanded);
    if (next.has(node.id)) {
      next.delete(node.id);
      setExpanded(next);
      return;
    }
    next.add(node.id);
    setExpanded(next);

    if (!node.loaded) {
      const data = await fetchFolder(node.id);
      if (data) {
        setTree((prev) =>
          patchTree(prev, node.id, {
            loaded: true,
            children: data.folders.map((f) => ({
              id: f.id,
              name: f.name,
              loaded: false,
            })),
          }),
        );
      }
    }
  }

  function renderTree(nodes: FolderNode[], depth = 0) {
    return nodes.map((node) => (
      <div key={node.id}>
        <div
          className="flex items-center gap-1 rounded-lg py-1 pr-2 hover:bg-white/5"
          style={{ paddingLeft: depth * 12 + 4 }}
        >
          <button
            type="button"
            aria-label={expanded.has(node.id) ? "Collapse" : "Expand"}
            className="flex h-6 w-6 shrink-0 items-center justify-center text-xs text-zinc-500"
            onClick={() => toggleExpand(node)}
          >
            {expanded.has(node.id) ? "▾" : "▸"}
          </button>
          <button
            type="button"
            className={`min-w-0 flex-1 truncate text-left text-sm ${
              selectedId === node.id ? "font-medium text-teal-200" : "text-zinc-400"
            }`}
            onClick={() => selectFolder(node.id, node.name)}
          >
            📁 {node.name}
          </button>
        </div>
        {expanded.has(node.id) && node.children?.length ? (
          <div>{renderTree(node.children, depth + 1)}</div>
        ) : null}
      </div>
    ));
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
      {configured === false ? (
        <div className="p-6 text-sm text-zinc-400">
          <p className="font-medium text-amber-200/90">Connect Google Drive</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>Enable Google Drive API in GCP and create a service account.</li>
            <li>
              Share your Nath Lab Drive root folder with the service account email (Viewer).
            </li>
            <li>
              Set <code className="text-teal-200">GOOGLE_SERVICE_ACCOUNT_JSON</code> (full JSON) and{" "}
              <code className="text-teal-200">GOOGLE_DRIVE_ROOT_FOLDER_ID</code> in{" "}
              <code className="text-teal-200">.env.local</code>.
            </li>
            <li>Restart <code className="text-teal-200">npm run dev</code>.</li>
          </ol>
          {error ? <p className="mt-4 text-xs text-red-400/90">{error}</p> : null}
        </div>
      ) : (
        <div className="grid min-h-[420px] lg:grid-cols-[minmax(220px,0.35fr)_1fr]">
          <aside className="border-b border-white/8 p-3 lg:border-b-0 lg:border-r">
            <button
              type="button"
              className={`mb-2 w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                selectedId === rootId ? "bg-teal-500/15 text-teal-200" : "text-zinc-400 hover:bg-white/5"
              }`}
              onClick={() => rootId && selectFolder(rootId, "Lab Drive")}
            >
              🏠 Lab Drive root
            </button>
            <div className="max-h-[360px] overflow-y-auto">{renderTree(tree)}</div>
          </aside>
          <section className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display truncate text-lg font-semibold text-white">
                {selectedName}
              </h2>
              {loading ? <span className="text-xs text-zinc-500">Loading…</span> : null}
            </div>
            {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}

            {folders.length > 0 ? (
              <div className="mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                  Subfolders
                </p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {folders.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => selectFolder(f.id, f.name)}
                        className="flex w-full items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-left text-sm text-zinc-300 hover:border-teal-500/30"
                      >
                        <span>📁</span>
                        <span className="truncate">{f.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-6">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                Files
              </p>
              {files.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600">No files in this folder.</p>
              ) : (
                <ul className="mt-2 divide-y divide-white/6 rounded-xl border border-white/8">
                  {files.map((file) => (
                    <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        {file.iconLink ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={file.iconLink} alt="" className="h-4 w-4" />
                        ) : (
                          <span className="text-sm">📄</span>
                        )}
                        <span className="truncate text-sm text-zinc-200">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        {file.modifiedTime ? (
                          <time dateTime={file.modifiedTime}>
                            {new Date(file.modifiedTime).toLocaleDateString()}
                          </time>
                        ) : null}
                        <span>{formatSize(file.size)}</span>
                        {file.webViewLink ? (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-teal-300 hover:underline"
                          >
                            Open
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function patchTree(
  nodes: FolderNode[],
  id: string,
  patch: Partial<FolderNode>,
): FolderNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch };
    if (n.children) return { ...n, children: patchTree(n.children, id, patch) };
    return n;
  });
}
