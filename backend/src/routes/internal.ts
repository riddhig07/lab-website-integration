import { Router } from 'express';
import { requireAuth } from '../auth/session';
import { db } from '../db';
import { RESOURCE_DEFS, type ResourceKey } from '../resources';
import { crudRouter } from './crud';

const ORDER_BY: Record<ResourceKey, string> = {
  people: 'sort_order, name',
  publications: 'year DESC, id DESC',
  news: 'published_at DESC, id DESC',
  resources: 'category, title',
};

// Everything under /api/internal requires a signed-in lab member.
export const internalRouter = Router();
internalRouter.use(requireAuth);

// The portal builds its navigation and forms from these.
internalRouter.get('/definitions', (_req, res) => {
  res.json(Object.values(RESOURCE_DEFS));
});

internalRouter.get('/stats', (_req, res) => {
  const counts: Record<string, number> = {};
  for (const key of Object.keys(RESOURCE_DEFS)) {
    counts[key] = Number((db.prepare(`SELECT COUNT(*) AS n FROM ${key}`).get() as { n: number }).n);
  }
  res.json(counts);
});

for (const key of Object.keys(RESOURCE_DEFS) as ResourceKey[]) {
  internalRouter.use(`/${key}`, crudRouter(RESOURCE_DEFS[key], ORDER_BY[key]));
}
