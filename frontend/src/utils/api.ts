/** JSON in, JSON out; an answer that is not ok throws the server's own words. */
export async function api<T>(url: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method || 'GET',
    credentials: 'same-origin',
    signal: init?.signal,
    ...(init?.body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }
      : {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${res.status}`);
  }
  return data as T;
}
