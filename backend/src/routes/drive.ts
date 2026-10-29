import { Readable } from 'node:stream';
import { Router, type ErrorRequestHandler, type RequestHandler, type Response } from 'express';
import { download, DriveError, driveEnabled, driveRootId, listFolder } from '../google/drive';
import { createFolder, startUpload } from '../google/driveWrite';
import { connectedEmail, disconnectAccount, googleUploadsEnabled } from '../google/userAuth';

// The lab's Google Drive folder for signed-in members (mounted under
// /api/internal, which requires a session). Reads go through the site's
// service account; uploads through each member's own Google account.
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

// ---------------------------------------------------------------------------
// Uploads, as the member's own connected Google account.

/** Whether uploads are available, and the member's connected Google account. */
driveRouter.get('/account', (_req, res) => {
  res.json({ uploads_enabled: googleUploadsEnabled, email: googleUploadsEnabled ? connectedEmail(res.locals.user!.id) : null });
});

driveRouter.delete('/account', async (_req, res) => {
  await disconnectAccount(res.locals.user!.id);
  res.status(204).end();
});

const uploadsOn: RequestHandler = (_req, res, next) => {
  if (!googleUploadsEnabled) {
    res.status(503).json({ error: 'Uploads are not set up (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET).' });
    return;
  }
  next();
};

const folderParam = (id: string) => (id === 'root' ? driveRootId() : id);
const actor = (res: Response) => {
  const user = res.locals.user!;
  return user.github_login ? `@${user.github_login}` : (user.email ?? user.name);
};

/**
 * Starts an upload of { name, mime_type, size } into the folder and returns
 * { upload_url }: the browser PUTs the file there, straight to Google.
 */
driveRouter.post('/folders/:id/uploads', uploadsOn, async (req, res) => {
  res.status(201).json(await startUpload(res.locals.user!.id, actor(res), folderParam(String(req.params.id)), req.body ?? {}));
});

/** Creates a subfolder { name }. */
driveRouter.post('/folders/:id/folders', uploadsOn, async (req, res) => {
  res.status(201).json(await createFolder(res.locals.user!.id, actor(res), folderParam(String(req.params.id)), req.body?.name));
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
