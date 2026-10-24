import { Router } from 'express';
import { requireRole } from '../auth/session';
import { db, fromRow, type Row } from '../db';
import type { ResourceDef } from '../types';

type SqlValue = string | number | null;

function isSafeUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true; // site-relative path
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Validates a request body against a resource definition, in field order. */
export function parseInput(def: ResourceDef, body: unknown): { values: SqlValue[] } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Expected a JSON object' };
  const input = body as Record<string, unknown>;
  const values: SqlValue[] = [];

  for (const field of def.fields) {
    const raw = input[field.name];
    if (raw === undefined || raw === null || raw === '') {
      if (field.required) return { error: `${field.label} is required` };
      values.push(field.type === 'boolean' ? 0 : null);
      continue;
    }

    const str = String(raw).trim();
    switch (field.type) {
      case 'number': {
        const n = Number(raw);
        if (!Number.isFinite(n)) return { error: `${field.label} must be a number` };
        values.push(n);
        break;
      }
      case 'boolean':
        values.push(raw === true || raw === 1 || raw === 'true' ? 1 : 0);
        break;
      case 'select':
        if (!field.options?.includes(str)) return { error: `${field.label} has an invalid value` };
        values.push(str);
        break;
      case 'url':
        if (!isSafeUrl(str)) return { error: `${field.label} must be an http(s) URL or a /path` };
        values.push(str);
        break;
      case 'email':
        if (!/^[^\s@]+@[^\s@]+$/.test(str)) return { error: `${field.label} must be an email address` };
        values.push(str);
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return { error: `${field.label} must be a date (YYYY-MM-DD)` };
        values.push(str);
        break;
      default:
        values.push(str);
    }
  }
  return { values };
}

/**
 * Generic list/get/create/update/delete routes for a content table.
 * `def.key` is the table name and comes from static definitions, never user input.
 */
export function crudRouter(def: ResourceDef, orderBy: string): Router {
  const router = Router();
  const table = def.key;
  const columns = def.fields.map((f) => f.name);

  const getById = (id: number | bigint) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Row | undefined;
    return row && fromRow(def, row);
  };

  router.get('/', (_req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all() as Row[];
    res.json(rows.map((r) => fromRow(def, r)));
  });

  router.get('/:id', (req, res) => {
    const row = getById(Number(req.params.id));
    if (!row) {
      res.status(404).json({ error: `${def.singular} not found` });
      return;
    }
    res.json(row);
  });

  router.post('/', (req, res) => {
    const parsed = parseInput(def, req.body);
    if ('error' in parsed) {
      res.status(400).json(parsed);
      return;
    }
    const placeholders = columns.map(() => '?').join(', ');
    const result = db
      .prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`)
      .run(...parsed.values);
    res.status(201).json(getById(result.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const parsed = parseInput(def, req.body);
    if ('error' in parsed) {
      res.status(400).json(parsed);
      return;
    }
    const id = Number(req.params.id);
    const assignments = columns.map((c) => `${c} = ?`).join(', ');
    const result = db
      .prepare(`UPDATE ${table} SET ${assignments}, updated_at = datetime('now') WHERE id = ?`)
      .run(...parsed.values, id);
    if (result.changes === 0) {
      res.status(404).json({ error: `${def.singular} not found` });
      return;
    }
    res.json(getById(id));
  });

  router.delete('/:id', requireRole('admin'), (req, res) => {
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(req.params.id));
    if (result.changes === 0) {
      res.status(404).json({ error: `${def.singular} not found` });
      return;
    }
    res.status(204).end();
  });

  return router;
}
