// Shapes of the data returned by the public API (/api/public).

// Keep in sync with backend/src/resources.ts.
export const PERSON_CATEGORIES = ['pi', 'postdoc', 'phd', 'ms', 'undergrad', 'staff', 'alumni'] as const;
export type PersonCategory = (typeof PERSON_CATEGORIES)[number];

export const PERSON_CATEGORY_LABELS: Record<PersonCategory, string> = {
  pi: 'Principal Investigator',
  postdoc: 'Postdoctoral Researchers',
  phd: 'PhD Students',
  ms: "Master's Students",
  undergrad: 'Undergraduate Researchers',
  staff: 'Staff',
  alumni: 'Alumni',
};

export interface Person {
  id: number;
  name: string;
  title: string | null;
  category: PersonCategory;
  email: string | null;
  website: string | null;
  photo_url: string | null;
  bio: string | null;
  sort_order: number;
}

export interface Publication {
  id: number;
  title: string;
  authors: string;
  venue: string | null;
  year: number;
  url: string | null;
  pdf_url: string | null;
  featured: boolean;
}

export interface NewsItem {
  id: number;
  title: string;
  body: string;
  published_at: string; // YYYY-MM-DD
}
