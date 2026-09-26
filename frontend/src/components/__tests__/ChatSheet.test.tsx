import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatSheet } from '../ChatSheet';
import { MessageDraft } from '../MessageDraft';
import { KaReminders } from '../KaReminders';

const THREAD = { id: 'c1', ad_title: 'Honda CBR', other_name: 'Markus', messages: [
  { mine: true, text: 'Hat sie ABS?', at: '1' }, { mine: false, text: 'Ja. Wann schaust du?', at: '2' }] };

function api(routes: Record<string, unknown>) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method || 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(routes).find(k => url.startsWith(k));
    return new Response(JSON.stringify(key ? routes[key] : {}), { status: 200 });
  }));
  return calls;
}

describe('chat', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('suggests an answer to the seller and sends it with one button', async () => {
    const calls = api({ '/api/ka/conversations/c1/draft': { text: 'Servus, Samstag? LG Florian' }, '/api/ka/conversations/c1/reply': { ok: true }, '/api/ka/conversations/c1': THREAD });
    render(<ChatSheet conversationId="c1" onClose={vi.fn()} />);
    expect(await screen.findByText('Ja. Wann schaust du?')).toBeTruthy();
    const box = (await screen.findByLabelText(/answer|antwort/i)) as HTMLTextAreaElement;
    await waitFor(() => expect(box.value).toBe('Servus, Samstag? LG Florian'));
    fireEvent.click(screen.getByRole('button', { name: /^(send|senden)$/i }));
    await waitFor(() => expect(calls.some(c => c.url === '/api/ka/conversations/c1/reply' && (c.body as { text: string }).text === 'Servus, Samstag? LG Florian')).toBe(true));
  });

  it('writes a first message about a listing and sends it', async () => {
    const calls = api({ '/api/ka/listings/42/conversation': { id: null }, '/api/hunts/11/listings/42/message-draft': { text: 'Servus, noch da?' }, '/api/ka/listings/42/contact': { id: null } });
    render(<MessageDraft huntId={11} listingId="42" />);
    fireEvent.click(await screen.findByRole('button', { name: /write a message|nachricht schreiben/i }));
    const box = (await screen.findByLabelText(/message to the seller|nachricht an den verkäufer/i)) as HTMLTextAreaElement;
    await waitFor(() => expect(box.value).toBe('Servus, noch da?'));
    fireEvent.click(screen.getByRole('button', { name: /^(send|senden)$/i }));
    await waitFor(() => expect(calls.some(c => c.url === '/api/ka/listings/42/contact' && c.method === 'POST')).toBe(true));
  });

  it('opens the existing chat instead of a new message', async () => {
    api({ '/api/ka/listings/42/conversation': { id: 'c1' } });
    render(<MessageDraft huntId={11} listingId="42" />);
    expect(await screen.findByRole('button', { name: /open chat|chat öffnen/i })).toBeTruthy();
  });

  it('reminds of sellers who answered', async () => {
    api({ '/api/ka/reminders': { reminders: [{ id: 'c1', ad_title: 'Honda CBR', other_name: 'Markus', last_text: 'Ja. Wann schaust du?' }] } });
    render(<KaReminders />);
    expect(await screen.findByText(/Markus · Honda CBR/)).toBeTruthy();
  });
});
