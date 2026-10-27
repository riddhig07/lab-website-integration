// Background work for the task tracker, on a one-minute tick: rolling sprints
// over, syncing GitHub every few minutes, and the scheduled Slack posts. Each
// job's failure is logged and never stops the others.
import { githubAppEnabled } from './github/app';
import { slackEnabled } from './slack/client';
import { checkSlackSchedule } from './slack/tracker';
import { ensureCurrentSprint } from './tracker/sprints';
import { runSync } from './tracker/sync';

const TICK_MS = 60 * 1000;
const SYNC_EVERY_MS = 10 * 60 * 1000;

export function startJobs(): void {
  let lastSync = 0;
  const tick = async () => {
    try {
      ensureCurrentSprint();
    } catch (err) {
      console.error('[tracker] sprint rollover failed', err);
    }
    if (githubAppEnabled && Date.now() - lastSync >= SYNC_EVERY_MS) {
      lastSync = Date.now();
      runSync().catch((err) => console.error('[tracker] sync failed', err));
    }
    if (slackEnabled) {
      await checkSlackSchedule().catch((err) => console.error('[slack]', err));
    }
  };
  setTimeout(() => void tick(), 5_000);
  setInterval(() => void tick(), TICK_MS);
}
