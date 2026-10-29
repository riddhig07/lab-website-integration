import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import { githubEnabled } from './auth/github';
import { config } from './config';
import { db } from './db';
import { startJobs } from './jobs';
import { authRouter } from './routes/auth';
import { internalRouter } from './routes/internal';
import { publicRouter } from './routes/public';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/public', publicRouter);
app.use('/api/auth', authRouter);
app.use('/api/internal', internalRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
  console.log(`GitHub sign-in is ${githubEnabled ? 'on' : 'off'}.`);
  startJobs();
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (n === 0 && !githubEnabled) {
    console.warn('No users exist yet. Run `npm run seed` to create a password admin, or set up GitHub sign-in (see .env.example).');
  }
});
