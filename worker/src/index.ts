// Jarvis Cloud
//   /api/*           JSON API for the Jarvis web app      (Authorization: Bearer <JARVIS_TOKEN>)
//   /mcp/<token>     MCP server for Claude (Streamable HTTP, JSON responses)
import { diffPlans, isEmptyChange, type ChangeSet, type PlanData } from '../../src/lib/core.ts';
import { PlanStore } from './store.ts';
import { TOOLS, UserError } from './tools.ts';

export { PlanStore };

interface Env {
  PLAN: DurableObjectNamespace<PlanStore>;
  JARVIS_TOKEN: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Max-Age': '86400',
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// Constant-time compare so the token can't be guessed by timing.
function same(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const store = (env: Env) => env.PLAN.get(env.PLAN.idFromName('main'));

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!env.JARVIS_TOKEN || env.JARVIS_TOKEN.length < 24) {
      return json({ error: 'Server not configured: set the JARVIS_TOKEN secret (24+ characters) in Cloudflare.' }, 500);
    }

    if (url.pathname === '/' || url.pathname === '') {
      return new Response('Jarvis Cloud is running.\n', { headers: { 'Content-Type': 'text/plain', ...CORS } });
    }

    if (url.pathname.startsWith('/mcp/')) {
      if (!same(url.pathname.slice(5).replace(/\/$/, ''), env.JARVIS_TOKEN)) return json({ error: 'Not found' }, 404);
      return mcp(req, env);
    }

    if (url.pathname.startsWith('/api/')) {
      const auth = req.headers.get('Authorization') ?? '';
      if (!same(auth.replace(/^Bearer\s+/i, ''), env.JARVIS_TOKEN)) return json({ error: 'Unauthorized' }, 401);
      try {
        return await api(req, url, env);
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    }
    return json({ error: 'Not found' }, 404);
  },
} satisfies ExportedHandler<Env>;

// ---------- App API ----------
async function api(req: Request, url: URL, env: Env): Promise<Response> {
  const s = store(env);
  if (req.method === 'GET' && url.pathname === '/api/plan') return json(await s.read());
  if (req.method === 'GET' && url.pathname === '/api/version') return json({ version: await s.version() });
  if (req.method === 'POST' && url.pathname === '/api/sync') {
    const body = (await req.json()) as { changes?: ChangeSet };
    if (!body.changes || typeof body.changes !== 'object') throw new Error('Body must be { changes }.');
    return json(await s.apply({ upsert: body.changes.upsert ?? {}, delete: body.changes.delete ?? {}, prefs: body.changes.prefs }));
  }
  if (req.method === 'POST' && url.pathname === '/api/replace') {
    const body = (await req.json()) as { plan?: PlanData };
    if (!body.plan || !Array.isArray(body.plan.tasks)) throw new Error('Body must be { plan }.');
    return json(await s.replace(body.plan));
  }
  return json({ error: 'Not found' }, 404);
}

// ---------- MCP (JSON-RPC 2.0 over Streamable HTTP, stateless) ----------
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const INSTRUCTIONS = `Jarvis is the user's personal planning app: buckets (areas of life) > goals > milestones > tasks.
Jarvis schedules each open task onto a day automatically (earliest deadline first, a daily task limit, steps inside a goal or milestone kept in order).
- To act on a task the user mentions, find it with search_tasks first, then get_task for full notes.
- After doing work for a task (drafting an email, research), record it on the task with update_task append_note, and complete_task only when the task is actually finished.
- Only set "due" for real deadlines; use do_date only when the user wants a specific day.
- Changes show up in the Jarvis app within a few seconds.`;

interface RpcReq {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

async function mcp(req: Request, env: Env): Promise<Response> {
  if (req.method === 'GET') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST', ...CORS } });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST', ...CORS } });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  const msgs = (Array.isArray(body) ? body : [body]) as RpcReq[];
  const out = [];
  for (const m of msgs) {
    const r = await handle(m, env);
    if (r) out.push(r);
  }
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(body) ? out : out[0]);
}

async function handle(m: RpcReq, env: Env): Promise<unknown | null> {
  const isNotification = m.id === undefined || m.id === null;
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id: m.id ?? null, error: { code, message } });
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return err(-32600, 'Invalid Request');
  if (isNotification) return null;

  switch (m.method) {
    case 'initialize': {
      const asked = String(m.params?.protocolVersion ?? '');
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'jarvis', title: 'Jarvis', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: !!t.readOnly, destructiveHint: !!t.destructive, idempotentHint: !!t.readOnly, openWorldHint: false },
        })),
      });
    case 'tools/call': {
      const name = String(m.params?.name ?? '');
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return err(-32602, `Unknown tool: ${name}`);
      const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const s = store(env);
        const snap = await s.read();
        const { result, next } = tool.run(snap.plan, args);
        if (next) {
          const changes = diffPlans(snap.plan, next);
          if (!isEmptyChange(changes)) await s.apply(changes);
        }
        return ok({ content: [{ type: 'text', text: JSON.stringify(result, null, 1) }], structuredContent: result && typeof result === 'object' && !Array.isArray(result) ? result : { result } });
      } catch (e) {
        const msg = e instanceof UserError ? e.message : `Jarvis error: ${(e as Error).message}`;
        return ok({ content: [{ type: 'text', text: msg }], isError: true });
      }
    }
    case 'resources/list':
      return ok({ resources: [] });
    case 'prompts/list':
      return ok({ prompts: [] });
    default:
      return err(-32601, `Method not found: ${m.method}`);
  }
}
