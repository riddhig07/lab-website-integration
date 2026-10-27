import { Readable } from 'node:stream';
import { Router, type ErrorRequestHandler } from 'express';
import { download, DriveError, driveEnabled, driveRootId, listFolder } from '../google/drive';

// The lab's Google Drive folder, read-only, for signed-in members (mounted
// under /api/internal, which requires a session).
export const driveRouter = Router();

driveRouter.use((_req, res, next) => {
  if (!driveEnabled) {
    res.status(503).json({ error: 'Google Drive is not set up (GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_DRIVE_FOLDER_ID).' });
    return;
  }
  next();
});

/** A folder's contents and its path from the lab folder. `root` is the lab folder itself. */
driveRouter.get('/folders/:id', async (req, res) => {
  const id = req.params.id === 'root' ? driveRootId() : req.params.id;
  res.json(await listFolder(id));
});

driveRouter.get('/files/:id/download', async (req, res) => {
  const file = await download(req.params.id);
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  Readable.fromWeb(file.body as import('node:stream/web').ReadableStream).pipe(res);
});

const driveErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if (!(err instanceof DriveError)) return next(err);
  if (err.status >= 500) console.error('[drive]', err.message);
  res.status(err.status).json({ error: err.message });
};
driveRouter.use(driveErrors);
