import { NextResponse } from "next/server";
import { gitMembers, parseRepoSlug } from "@/content/team-github";
import { getRepoTeamStatus } from "@/lib/github-team";

export async function POST(request: Request) {
  const body = (await request.json()) as { repos?: string[] };
  const repos = (body.repos ?? [])
    .map(parseRepoSlug)
    .filter((r): r is string => Boolean(r));

  if (repos.length === 0) {
    return NextResponse.json({ error: "Add at least one valid org/repo or GitHub URL." }, { status: 400 });
  }

  const members = gitMembers.map((m) => ({ name: m.name, github: m.github }));
  const results = await Promise.all(repos.map((slug) => getRepoTeamStatus(slug, members)));

  return NextResponse.json({
    tokenConfigured: Boolean(process.env.GITHUB_TOKEN),
    repos: results,
  });
}
