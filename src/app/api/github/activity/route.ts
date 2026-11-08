import { NextResponse } from "next/server";

type GhEvent = {
  id: string;
  type: string;
  repo: { name: string };
  created_at: string;
};

export async function GET() {
  const org = process.env.GITHUB_ORG;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;

  if (!org && !repo) {
    return NextResponse.json({
      configured: false,
      events: [],
      message: "Set GITHUB_ORG or GITHUB_REPO for live activity.",
    });
  }

  const url = repo
    ? `https://api.github.com/repos/${repo}/events?per_page=8`
    : `https://api.github.com/orgs/${org}/events?per_page=8`;

  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "sherp-lab-site",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(url, { headers, next: { revalidate: 300 } });
    if (!res.ok) {
      return NextResponse.json(
        { configured: true, events: [], error: `GitHub API ${res.status}` },
        { status: 200 },
      );
    }
    const data = (await res.json()) as GhEvent[];
    const events = data.map((e) => ({
      id: String(e.id),
      type: e.type,
      repo: e.repo.name,
      createdAt: e.created_at,
    }));
    return NextResponse.json({ configured: true, events });
  } catch {
    return NextResponse.json({ configured: true, events: [], error: "fetch failed" });
  }
}
