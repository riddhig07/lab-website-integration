/** Map lab members to GitHub usernames for push / behind tracking. */
export type GitMember = {
  name: string;
  github: string;
  role: string;
};

export const gitMembers: GitMember[] = [
  { name: "Sagnik Nath", github: "", role: "Professor" },
  { name: "Rachit Verma", github: "", role: "Lead" },
  { name: "Riddhi Gaddamwar", github: "", role: "Lab member" },
  { name: "Alexander Hamilton", github: "", role: "Lab member" },
  { name: "Braiden Merrill", github: "", role: "Lab member" },
  { name: "Suhani Agarwal", github: "", role: "Lab member" },
];

export function parseRepoSlug(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
  return null;
}
