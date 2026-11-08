import { GitTeamHub } from "@/components/GitTeamHub";

export const metadata = { title: "Git team hub" };

export default function IntranetGitPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-bold text-white">Git team hub</h1>
      <p className="mt-3 max-w-2xl text-zinc-400">
        Register lab repositories and see who has pushed recently, who is quiet, and whether feature
        branches are behind main.
      </p>
      <div className="mt-10">
        <GitTeamHub />
      </div>
    </>
  );
}
