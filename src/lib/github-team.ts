const GH = "https://api.github.com";

export type MemberRepoStatus = {
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

export type RepoTeamStatus = {
  slug: string;
  defaultBranch: string;
  repoUpdatedAt: string | null;
  members: MemberRepoStatus[];
  error?: string;
};

function headers(): HeadersInit {
  const h: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "sherp-lab-site",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`${GH}${path}`, { headers: headers(), next: { revalidate: 120 } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

type RepoMeta = { default_branch: string; pushed_at?: string };
type Commit = {
  sha: string;
  commit: { author: { date: string | null }; message: string };
  author: { login: string | null } | null;
};
type Branch = { name: string; commit: { sha: string } };
type Compare = { status: string; behind_by: number; ahead_by: number };
type Issue = { assignees: { login: string }[] };

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function activityStatus(lastPush: string | null, commits14d: number): MemberRepoStatus["status"] {
  if (!lastPush && commits14d === 0) return "no-activity";
  const days = daysSince(lastPush);
  if (days === null) return "no-activity";
  if (days <= 4 && commits14d > 0) return "active";
  if (days <= 14) return "quiet";
  return "behind";
}

export async function getRepoTeamStatus(
  slug: string,
  members: { name: string; github: string }[],
): Promise<RepoTeamStatus> {
  const configured = members.filter((m) => m.github.trim().length > 0);
  try {
    const repo = await gh<RepoMeta>(`/repos/${slug}`);
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const commits = await gh<Commit[]>(
      `/repos/${slug}/commits?since=${since}&per_page=100`,
    );

    let branches: Branch[] = [];
    try {
      branches = await gh<Branch[]>(`/repos/${slug}/branches?per_page=30`);
    } catch {
      branches = [];
    }

    let openIssues: Issue[] = [];
    try {
      openIssues = await gh<Issue[]>(`/repos/${slug}/issues?state=open&per_page=50`);
    } catch {
      openIssues = [];
    }

    const memberStatuses: MemberRepoStatus[] = await Promise.all(
      members.map(async (m) => {
        if (!m.github.trim()) {
          return {
            github: m.github,
            name: m.name,
            commits14d: 0,
            lastPush: null,
            lastCommitMessage: null,
            status: "unconfigured" as const,
            openIssuesAssigned: 0,
            branchBehindMain: null,
            branchName: null,
          };
        }

        const login = m.github.trim().toLowerCase();
        const mine = commits.filter((c) => c.author?.login?.toLowerCase() === login);
        const last = mine[0];
        const lastPush = last?.commit.author.date ?? null;

        const assigned = openIssues.filter((i) =>
          i.assignees.some((a) => a.login.toLowerCase() === login),
        ).length;

        const branch =
          branches.find((b) => b.name.toLowerCase() === login) ??
          branches.find((b) => b.name.toLowerCase().startsWith(`${login}/`)) ??
          branches.find((b) => b.name.toLowerCase().includes(login));

        let branchBehindMain: boolean | null = null;
        if (branch && branch.name !== repo.default_branch) {
          try {
            const cmp = await gh<Compare>(
              `/repos/${slug}/compare/${repo.default_branch}...${branch.name}`,
            );
            branchBehindMain = cmp.behind_by > 0;
          } catch {
            branchBehindMain = null;
          }
        }

        const status = activityStatus(lastPush, mine.length);

        return {
          github: m.github,
          name: m.name,
          commits14d: mine.length,
          lastPush,
          lastCommitMessage: last?.commit.message?.split("\n")[0] ?? null,
          status,
          openIssuesAssigned: assigned,
          branchBehindMain,
          branchName: branch?.name ?? null,
        };
      }),
    );

    return {
      slug,
      defaultBranch: repo.default_branch,
      repoUpdatedAt: repo.pushed_at ?? null,
      members: memberStatuses,
    };
  } catch (e) {
    return {
      slug,
      defaultBranch: "main",
      repoUpdatedAt: null,
      members: configured.map((m) => ({
        github: m.github,
        name: m.name,
        commits14d: 0,
        lastPush: null,
        lastCommitMessage: null,
        status: "no-activity" as const,
        openIssuesAssigned: 0,
        branchBehindMain: null,
        branchName: null,
      })),
      error: e instanceof Error ? e.message : "GitHub error",
    };
  }
}
