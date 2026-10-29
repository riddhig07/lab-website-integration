// Content types managed in the portal. These definitions drive API validation
// (routes/crud.ts) and are served to the portal to build its forms
// (GET /api/internal/definitions). Adding a field here means adding the
// matching column in schema.ts.
import type { ResourceDef } from './types';

// Keep in sync with frontend/src/types.ts (used to group the public People page).
export const PERSON_CATEGORIES = ['pi', 'postdoc', 'phd', 'ms', 'undergrad', 'staff', 'alumni'] as const;

export const PERSON_CATEGORY_LABELS: Record<string, string> = {
  pi: 'Principal Investigator',
  postdoc: 'Postdoctoral Researchers',
  phd: 'PhD Students',
  ms: "Master's Students",
  undergrad: 'Undergraduate Researchers',
  staff: 'Staff',
  alumni: 'Alumni',
};

export const RESOURCE_DEFS = {
  people: {
    key: 'people',
    label: 'People',
    singular: 'Person',
    description: 'Lab members shown on the public People page.',
    public: true,
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'title', label: 'Title', type: 'text', help: 'e.g. "PhD Student" or "Associate Professor"' },
      {
        name: 'category',
        label: 'Category',
        type: 'select',
        required: true,
        options: PERSON_CATEGORIES,
        optionLabels: PERSON_CATEGORY_LABELS,
        default: 'phd',
      },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'website', label: 'Website', type: 'url' },
      { name: 'photo_url', label: 'Photo URL', type: 'url' },
      { name: 'bio', label: 'Bio', type: 'textarea' },
      { name: 'sort_order', label: 'Sort order', type: 'number', default: 0, help: 'Lower numbers appear first' },
      { name: 'is_public', label: 'Show on public site', type: 'boolean', default: true },
    ],
    listColumns: ['name', 'title', 'category', 'is_public'],
  },
  publications: {
    key: 'publications',
    label: 'Publications',
    singular: 'Publication',
    description: 'Papers listed on the public Publications page.',
    public: true,
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'authors', label: 'Authors', type: 'text', required: true },
      { name: 'venue', label: 'Venue', type: 'text' },
      { name: 'year', label: 'Year', type: 'number', required: true, default: new Date().getFullYear() },
      { name: 'url', label: 'Link', type: 'url' },
      { name: 'pdf_url', label: 'PDF', type: 'url' },
      { name: 'featured', label: 'Featured on home page', type: 'boolean', default: false },
    ],
    listColumns: ['year', 'title', 'venue', 'featured'],
  },
  news: {
    key: 'news',
    label: 'News',
    singular: 'News item',
    description: 'Announcements shown on the public News page.',
    public: true,
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'body', label: 'Body', type: 'textarea', required: true },
      { name: 'published_at', label: 'Publish date', type: 'date', required: true },
      { name: 'is_public', label: 'Show on public site', type: 'boolean', default: true },
    ],
    listColumns: ['published_at', 'title', 'is_public'],
  },
  resources: {
    key: 'resources',
    label: 'Lab Resources',
    singular: 'Resource',
    description: 'Internal links and documents. Only visible to signed-in lab members.',
    public: false,
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'text', help: 'e.g. "Onboarding", "Compute", "Writing"' },
      { name: 'url', label: 'URL', type: 'url' },
      { name: 'description', label: 'Description', type: 'textarea' },
    ],
    listColumns: ['category', 'title', 'url'],
  },
} satisfies Record<string, ResourceDef>;

export type ResourceKey = keyof typeof RESOURCE_DEFS;

/** How each content type is listed. */
export const CONTENT_ORDER_BY: Record<ResourceKey, string> = {
  people: 'sort_order, name',
  publications: 'year DESC, id DESC',
  news: 'published_at DESC, id DESC',
  resources: 'category, title',
};
