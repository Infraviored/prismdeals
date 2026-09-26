import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KaLoginSheet } from '../KaLoginSheet';

describe('KaLoginSheet', () => {
  const calls: Array<{ url: string; body?: unknown }> = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url === '/api/ka/login') return new Response(JSON.stringify({ view: { width: 400, height: 780 } }), { status: 200 });
      if (url.startsWith('/api/ka/login/frame')) return new Response(null, { status: 204, headers: { 'X-Ka-State': 'open' } });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens the login and sends what is typed into the picture', async () => {
    render(<KaLoginSheet isOpen onClose={vi.fn()} onConnected={vi.fn()} />);
    await waitFor(() => expect(calls.some(c => c.url === '/api/ka/login')).toBe(true));
    const field = screen.getByLabelText(/type here|hier tippen/i) as HTMLInputElement;
    fireEvent.change(field, { target: { value: ' a' } });
    expect(field.value).toBe(' ');
    await waitFor(() => expect(calls.some(c => (c.body as { text?: string })?.text === 'a')).toBe(true));
    // A phone's backspace removes the kept space: sent as Backspace.
    fireEvent.change(field, { target: { value: '' } });
    await waitFor(() => expect(calls.some(c => (c.body as { key?: string })?.key === 'Backspace')).toBe(true));
  });
});
