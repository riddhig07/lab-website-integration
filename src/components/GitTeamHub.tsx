"use client";

import { useEffect, useState } from "react";
import { gitMembers, parseRepoSlug } from "@/content/team-github";

type MemberRepoStatus = {
  github: string;
  name: string;
  commits14d: number;
  lastPush: string | null;
  lastCommitMessage: string | null;
  status: "active" | "quiet" | "behind" | "no-activity" | "unconfigured";
  openIssuesAssigned: number;
  branchBehindMain: boolean | null;
  branchName: string | null;
};

type RepoTeamStatus = {
  slug: string;
  defaultBranch: string;
  repoUpdatedAt: string | null;
  members: MemberRepoStatus[];
  error?: string;
};

const REPO_KEY = "sherp-git-repos";

const statusStyle: Record<MemberRepoStatus["status"], string> = {
  active: "bg-teal-500/20 text-teal-200",
  quiet: "bg-amber-500/15 text-amber-200",
  behind: "bg-red-500/15 text-red-300",
  "no-activity": "bg-zinc-500/15 text-zinc-400",
  unconfigured: "bg-zinc-700/30 text-zinc-500",
};

const statusLabel: Record<MemberRepoStatus["status"], string> = {
  active: "Pushing",
  quiet: "Quiet",
  behind: "Behind / stale",
  "no-activity": "No recent pushes",
  unconfigured: "Add GitHub username",
};

export function GitTeamHub() {
  const [repos, setRepos] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [data, setData] = useState<RepoTeamStatus[] | null>(null);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REPO_KEY);
      if (raw) setRepos(JSON.parse(raw) as string[]);
    } catch {
      /* empty */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(REPO_KEY, JSON.stringify(repos));
  }, [repos]);

  async function refresh() {
    if (repos.length === 0) {
      setError("Add at least one repository link.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/github/team-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repos }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Could not load GitHub status.");
      return;
    }
    const json = (await res.json()) as {
      repos: RepoTeamStatus[];
      tokenConfigured: boolean;
    };
    setData(json.repos);
    setTokenConfigured(json.tokenConfigured);
  }

  function addRepo() {
    const slug = parseRepoSlug(draft);
    if (!slug) {
      setError("Use org/repo or a full github.com URL.");
      return;
    }
    if (!repos.includes(slug)) setRepos((r) => [...r, slug]);
    setDraft("");
    setError(null);
  }

  function removeRepo(slug: string) {
    setRepos((r) => r.filter((x) => x !== slug));
    setData((d) => d?.filter((x) => x.slug !== slug) ?? null);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-semibold text-white">Tracked repositories</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Add Git links for lab repos. Set member GitHub usernames in{" "}
          <code className="text-teal-200">src/content/team-github.ts</code>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://github.com/org/repo or org/repo"
            className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/30"
          />
          <button
            type="button"
            onClick={addRepo}
            className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-[#042f2e]"
          >
            Add repo
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-zinc-200 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh status"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        {!tokenConfigured ? (
          <p className="mt-3 text-xs text-amber-200/80">
            Tip: set <code className="text-teal-200">GITHUB_TOKEN</code> for higher rate limits and
            private repos.
          </p>
        ) : null}
        <ul className="mt-4 flex flex-wrap gap-2">
          {repos.map((slug) => (
            <li
              key={slug}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 pl-3 pr-1 py-1 text-sm text-zinc-300"
            >
              <a
                href={`https://github.com/${slug}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-teal-300"
              >
                {slug}
              </a>
              <button
                type="button"
                aria-label={`Remove ${slug}`}
                className="rounded-full px-2 text-zinc-500 hover:bg-white/10 hover:text-red-300"
                onClick={() => removeRepo(slug)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>

      {data?.map((repo) => (
        <section
          key={repo.slug}
          className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-5 py-4">
            <div>
              <a
                href={`https://github.com/${repo.slug}`}
                target="_blank"
                rel="noreferrer"
                className="font-display text-lg font-semibold text-teal-200 hover:underline"
              >
                {repo.slug}
              </a>
              <p className="text-xs text-zinc-500">
                Default branch: {repo.defaultBranch}
                {repo.repoUpdatedAt
                  ? ` · Last push ${new Date(repo.repoUpdatedAt).toLocaleString()}`
                  : ""}
              </p>
            </div>
            {repo.error ? <span className="text-xs text-red-400">{repo.error}</span> : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-3 py-3 font-medium">GitHub</th>
                  <th className="px-3 py-3 font-medium">14d commits</th>
                  <th className="px-3 py-3 font-medium">Last push</th>
                  <th className="px-3 py-3 font-medium">Branch vs main</th>
                  <th className="px-3 py-3 font-medium">Open issues</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {repo.members.map((m) => (
                  <tr key={m.name} className="text-zinc-400">
                    <td className="px-5 py-3 font-medium text-zinc-200">{m.name}</td>
                    <td className="px-3 py-3">
                      {m.github ? (
                        <a
                          href={`https://github.com/${m.github}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-teal-300 hover:underline"
                        >
                          @{m.github}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3">{m.commits14d}</td>
                    <td className="px-3 py-3">
                      {m.lastPush ? (
                        <span title={m.lastCommitMessage ?? undefined}>
                          {new Date(m.lastPush).toLocaleDateString()}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {m.branchName ? (
                        <span>
                          <code className="text-xs text-zinc-500">{m.branchName}</code>
                          {m.branchBehindMain === true ? (
                            <span className="ml-1 text-red-300">behind main</span>
                          ) : m.branchBehindMain === false ? (
                            <span className="ml-1 text-teal-300">up to date</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-zinc-600">no branch found</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{m.openIssuesAssigned || "—"}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusStyle[m.status]}`}
                      >
                        {statusLabel[m.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-zinc-500">
        <p className="font-medium text-zinc-400">How &quot;behind&quot; is detected</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>No commits in 14+ days → stale / behind on activity.</li>
          <li>
            If a branch matches a member login (or login/*), we compare it to the default branch.
          </li>
          <li>Assigned open GitHub issues are shown per member when token allows.</li>
        </ul>
      </section>
    </div>
  );
}
