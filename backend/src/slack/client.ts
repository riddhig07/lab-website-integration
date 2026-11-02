// Posting to Slack as the "SHERP Lab Website" bot (chat:write). The bot must be
// invited to a channel before it can post there; a user id as the channel
// sends a DM from the app.
import { config } from '../config';

const { botToken, trackerChannelId, dryRun } = config.slack;

export const slackEnabled = Boolean(botToken && trackerChannelId);
// DMs (task assignments) only need the bot.
export const slackDmEnabled = Boolean(botToken);
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

export interface SlackUser {
  id: string;
  name: string;
}

let usersCache: { at: number; users: SlackUser[] } | null = null;
const USERS_TTL_MS = 10 * 60 * 1000;

/** People in the workspace (no bots, no deactivated accounts), for linking members to Slack. */
export async function listSlackUsers(): Promise<SlackUser[]> {
  if (!botToken) return [];
  if (usersCache && Date.now() - usersCache.at < USERS_TTL_MS) return usersCache.users;
  const users: SlackUser[] = [];
  let cursor = '';
  do {
    const res = await fetch(`https://slack.com/api/users.list?${new URLSearchParams({ limit: '200', cursor })}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const body = (await res.json()) as {
      ok: boolean;
      error?: string;
      members?: { id: string; name: string; deleted?: boolean; is_bot?: boolean; real_name?: string; profile?: { display_name?: string } }[];
      response_metadata?: { next_cursor?: string };
    };
    if (!body.ok) throw new Error(`Slack users.list failed: ${body.error ?? res.status}`);
    for (const u of body.members ?? []) {
      if (u.deleted || u.is_bot || u.id === 'USLACKBOT') continue;
      users.push({ id: u.id, name: u.real_name || u.profile?.display_name || u.name });
    }
    cursor = body.response_metadata?.next_cursor ?? '';
  } while (cursor);
  users.sort((a, b) => a.name.localeCompare(b.name));
  usersCache = { at: Date.now(), users };
  return users;
}
