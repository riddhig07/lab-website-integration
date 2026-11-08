export type MemberTier = "professor" | "lead" | "member";

export type LabMember = {
  id: string;
  name: string;
  role: string;
  tier: MemberTier;
  bio: string;
  interests: string;
  email?: string;
  github?: string;
  linkedin?: string;
  projects: string[];
  photoUrl?: string;
};

const placeholder = {
  bio: "Biography coming soon.",
  interests: "Research interests — to be added.",
  email: undefined as string | undefined,
  github: undefined as string | undefined,
  linkedin: undefined as string | undefined,
  projects: [] as string[],
};

export const labMembers: LabMember[] = [
  {
    id: "sagnik-nath",
    name: "Sagnik Nath",
    role: "Professor",
    tier: "professor",
    bio: placeholder.bio,
    interests: placeholder.interests,
    email: placeholder.email,
    github: placeholder.github,
    linkedin: placeholder.linkedin,
    projects: placeholder.projects,
  },
  {
    id: "rachit-verma",
    name: "Rachit Verma",
    role: "Lead",
    tier: "lead",
    bio: placeholder.bio,
    interests: placeholder.interests,
    email: placeholder.email,
    github: placeholder.github,
    linkedin: placeholder.linkedin,
    projects: placeholder.projects,
  },
  {
    id: "riddhi-gaddamwar",
    name: "Riddhi Gaddamwar",
    role: "Lab member",
    tier: "member",
    bio: placeholder.bio,
    interests: placeholder.interests,
    email: placeholder.email,
    github: placeholder.github,
    linkedin: placeholder.linkedin,
    projects: placeholder.projects,
  },
  {
    id: "alexander-hamilton",
    name: "Alexander Hamilton",
    role: "Lab member",
    tier: "member",
    bio: placeholder.bio,
    interests: placeholder.interests,
    email: placeholder.email,
    github: placeholder.github,
    linkedin: placeholder.linkedin,
    projects: placeholder.projects,
  },
  {
    id: "braiden-merrill",
    name: "Braiden Merrill",
    role: "Lab member",
    tier: "member",
    bio: placeholder.bio,
    interests: placeholder.interests,
    email: placeholder.email,
    github: placeholder.github,
    linkedin: placeholder.linkedin,
    projects: placeholder.projects,
  },
  {
    id: "suhani-agarwal",
    name: "Suhani Agarwal",
    role: "Lab member",
    tier: "member",
    bio: placeholder.bio,
    interests: placeholder.interests,
    email: placeholder.email,
    github: placeholder.github,
    linkedin: placeholder.linkedin,
    projects: placeholder.projects,
  },
];

export function membersByTier(tier: MemberTier): LabMember[] {
  return labMembers.filter((m) => m.tier === tier);
}
