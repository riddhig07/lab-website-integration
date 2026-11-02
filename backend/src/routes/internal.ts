import { Router } from 'express';
import { requireAuth } from '../auth/session';
import { db } from '../db';
import { CONTENT_ORDER_BY, RESOURCE_DEFS, type ResourceKey } from '../resources';
import { assistantRouter } from './assistant';
import { crudRouter } from './crud';
import { driveRouter } from './drive';
import { githubRouter } from './github';
import { meetingsRouter } from './meetings';
import { trackerRouter } from './tracker';

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

internalRouter.use('/drive', driveRouter);
internalRouter.use('/github', githubRouter);
internalRouter.use('/tracker', trackerRouter);
internalRouter.use('/assistant', assistantRouter);
internalRouter.use('/meetings', meetingsRouter);

for (const key of Object.keys(RESOURCE_DEFS) as ResourceKey[]) {
  internalRouter.use(`/${key}`, crudRouter(RESOURCE_DEFS[key], CONTENT_ORDER_BY[key]));
}
