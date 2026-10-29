// Posting to Slack as the "SHERP Lab Website" bot (chat:write). The bot must be
// invited to a channel before it can post there; a user id as the channel
// sends a DM from the app.
import { config } from '../config';

const { botToken, trackerChannelId, dryRun } = config.slack;

export const slackEnabled = Boolean(botToken && trackerChannelId);
export const trackerChannel = trackerChannelId;

// Slack truncates very long messages; split on line boundaries well before that.
const MAX_CHARS = 3500;

export function splitMessage(text: string, limit = MAX_CHARS): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current && current.length + line.length + 1 > limit) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current}\n${line.slice(0, limit)}` : line.slice(0, limit);
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Posts `text` (Slack mrkdwn) to a channel or user, split into several messages if long. */
export async function postMessage(channel: string, text: string): Promise<void> {
  for (const chunk of splitMessage(text)) {
    if (dryRun || !botToken) {
      console.log(`[slack] (dry run) to ${channel}:\n${chunk}\n`);
      continue;
    }
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel, text: chunk, unfurl_links: false, unfurl_media: false }),
    });
    const body = (await res.json()) as { ok: boolean; error?: string };
    if (!body.ok) throw new Error(`Slack chat.postMessage failed: ${body.error ?? res.status}`);
  }
}
