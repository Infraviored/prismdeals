import { vi } from 'vitest';

type Handler = unknown | ((body: unknown, url: string) => unknown);
export interface ApiCall {
  method: string;
  url: string;
  body: unknown;
}

/**
 * fetch answered from a table: "GET /api/hunts/11" -> JSON, or a function of the
 * request body. The longest matching key wins; a key matches a URL that starts
 * with its path. `{ status, body }` answers with that status. Unknown URLs: 404.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: ApiCall[] = [];
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase();
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const key = Object.keys(routes)
      .filter((k) => {
        const [m, path] = k.split(' ');
        return m === method && url.split('?')[0] === path.split('?')[0] && (!path.includes('?') || url.includes(path.split('?')[1]))
          || (m === method && path.endsWith('*') && url.startsWith(path.slice(0, -1)));
      })
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
    const handler = routes[key];
    const out = typeof handler === 'function' ? (handler as (b: unknown, u: string) => unknown)(body, url) : handler;
    const answer = out as { status?: number; body?: unknown } | undefined;
    if (answer && typeof answer === 'object' && 'status' in answer && typeof answer.status === 'number') {
      return { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
    }
    return { ok: true, status: 200, json: async () => out };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
