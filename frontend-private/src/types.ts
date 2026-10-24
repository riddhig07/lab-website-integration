// Shapes of the data returned by the backend. Field definitions for the
// forms come from the backend at runtime (GET /api/internal/definitions).

export type Role = 'admin' | 'member';

export interface User {
  id: number;
  /** Null for GitHub accounts. */
  email: string | null;
  name: string;
  role: Role;
  /** Set for GitHub accounts. */
  github_login: string | null;
}

export type FieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'url' | 'email' | 'select';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  optionLabels?: Record<string, string>;
  default?: string | number | boolean;
  help?: string;
}

export interface ResourceDef {
  key: string;
  label: string;
  singular: string;
  description: string;
  public: boolean;
  fields: FieldDef[];
  listColumns: string[];
}
