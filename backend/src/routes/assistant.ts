import { Router } from 'express';
import { streamChat } from '../ai/assistant';
import { config } from '../config';

/** The portal-wide assistant (Claude). Off, with 503s, while ANTHROPIC_API_KEY is unset. */
export const assistantRouter = Router();

assistantRouter.get('/', (_req, res) => {
  res.json({ enabled: Boolean(config.anthropic.apiKey), model: config.anthropic.model });
});

/**
 * Server-sent events, one JSON object per `data:` line:
 *   {type:'text', delta} · {type:'thinking', delta} ·
 *   {type:'tool_start', id, tool, args} · {type:'tool', id, tool, args, ok, result_summary, ms, view} ·
 *   {type:'action', op, ...} · {type:'done', actions, usage} · {type:'error', error}
 */
assistantRouter.post('/chat', async (req, res) => {
  if (!config.anthropic.apiKey) {
    res.status(503).json({ error: 'The assistant is not set up (ANTHROPIC_API_KEY)' });
    return;
  }
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (messages.length === 0 || messages.length > 40) {
    res.status(400).json({ error: 'Send 1-40 messages' });
    return;
  }
  const page = typeof req.body?.page === 'string' && req.body.page.startsWith('/') ? req.body.page.slice(0, 200) : null;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  try {
    for await (const event of streamChat(messages, res.locals.user!, page, abort.signal)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err instanceof Error ? err.message : String(err) })}\n\n`);
  }
  res.end();
});
