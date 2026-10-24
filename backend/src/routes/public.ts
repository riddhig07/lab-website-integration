import { Router } from 'express';
import { db, fromRow, type Row } from '../db';
import { RESOURCE_DEFS } from '../resources';

// Read-only, unauthenticated endpoints for the public site. Only select
// columns/rows that are meant to be public.
export const publicRouter = Router();

publicRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=60');
  next();
});

publicRouter.get('/people', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, title, category, email, website, photo_url, bio, sort_order
         FROM people WHERE is_public = 1
        ORDER BY sort_order, name`,
    )
    .all() as Row[];
  res.json(rows.map((r) => fromRow(RESOURCE_DEFS.people, r)));
});

publicRouter.get('/publications', (req, res) => {
  const featuredOnly = req.query.featured === '1';
  const rows = db
    .prepare(
      `SELECT id, title, authors, venue, year, url, pdf_url, featured
         FROM publications ${featuredOnly ? 'WHERE featured = 1' : ''}
        ORDER BY year DESC, id DESC`,
    )
    .all() as Row[];
  res.json(rows.map((r) => fromRow(RESOURCE_DEFS.publications, r)));
});

publicRouter.get('/news', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const rows = db
    .prepare(
      `SELECT id, title, body, published_at
         FROM news WHERE is_public = 1 AND published_at <= date('now')
        ORDER BY published_at DESC, id DESC
        LIMIT ?`,
    )
    .all(limit) as Row[];
  res.json(rows);
});
