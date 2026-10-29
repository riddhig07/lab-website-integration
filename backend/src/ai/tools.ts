// Every tool the portal's assistant can call, from the tracker, GitHub, Drive
// and site-content modules.
import { DriveError } from '../google/drive';
import { GitHubError } from '../github/app';
import { SprintError } from '../tracker/sprints';
import { TrackerError } from '../tracker/tasks';
import { contentTools } from './contentTools';
import { driveTools } from './driveTools';
import { githubTools } from './githubTools';
import type { ToolContext, ToolModule, ToolResult, ToolView } from './toolkit';
import { trackerTools } from './trackerTools';

const MODULES: ToolModule[] = [trackerTools, githubTools, driveTools, contentTools];

const owner = new Map<string, ToolModule>();
for (const m of MODULES) for (const d of m.declarations) owner.set(d.name, m);

export const TOOL_DECLARATIONS = MODULES.flatMap((m) => m.declarations);

export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const handler = owner.get(name)?.handlers[name];
  if (!handler) return { error: `Unknown tool ${name}` };
  try {
    const result = await handler(args ?? {}, ctx);
    return result && typeof result === 'object' && !Array.isArray(result) ? (result as ToolResult) : { result };
  } catch (err) {
    // Surfaced to the model so it can correct itself.
    if (err instanceof TrackerError || err instanceof GitHubError || err instanceof DriveError || err instanceof SprintError) return { error: err.message };
    return { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  }
}

/** One short line per tool call, shown on its card. */
export function summarizeResult(name: string, r: ToolResult): string {
  if (r.error) return `error: ${String(r.error)}`;
  try {
    return owner.get(name)?.summarize(name, r) ?? 'done';
  } catch {
    return 'done';
  }
}

export function viewOf(name: string, r: ToolResult): ToolView | null {
  if (r.error) return { kind: 'error', message: String(r.error) };
  try {
    return owner.get(name)?.view(name, r) ?? null;
  } catch {
    return null;
  }
}

export type { ToolContext, ToolView };
