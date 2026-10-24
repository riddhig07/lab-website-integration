import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config';
import { SCHEMA } from './schema';
import type { ResourceDef } from './types';

mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new DatabaseSync(config.databasePath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(SCHEMA);

// Columns added after the live database was created. CREATE TABLE IF NOT
// EXISTS leaves existing tables alone, so add them here.
for (const [table, column, type] of [
  ['users', 'github_token', 'TEXT'],
  ['users', 'github_org_role', 'TEXT'],
  ['users', 'github_checked_at', 'INTEGER'],
]) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

export type Row = Record<string, unknown>;

/** SQLite stores booleans as 0/1; convert them back for JSON responses. */
export function fromRow(def: ResourceDef, row: Row): Row {
  const out: Row = { ...row };
  for (const field of def.fields) {
    if (field.type === 'boolean' && field.name in row) out[field.name] = Boolean(row[field.name]);
  }
  return out;
}
