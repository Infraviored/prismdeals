/**
 * Conversations with sellers over Kleinanzeigen's own messagebox API
 * (ka_browser.call): polled into ka_conversations, read, answered, opened.
 *
 * A reminder is a conversation where the seller wrote last, Kleinanzeigen still
 * counts it unread, and the buyer has not opened it here since.
 */

const ka = require('./ka_browser');

const BASE = '/messagebox/api/users/{user}/conversations';
const POLL_MS = 10 * 60 * 1000;

function toRow(c) {
  return {
    id: c.id,
    ad_id: String(c.adId),
    role: c.role,
    ad_title: c.adTitle || null,
    other_name: c.role === 'Buyer' ? c.sellerName : c.buyerName,
    last_text: c.textShortTrimmed || null,
    last_inbound: c.boundness === 'INBOUND' ? 1 : 0,
    last_at: c.receivedDate || null,
    unread: c.unread ? 1 : 0,
  };
}

module.exports = (query, run) => {
  async function poll() {
    if (!ka.status().connected) return { polled: 0 };
    const list = await ka.call('GET', `${BASE}?page=0&size=50`);
    const now = new Date().toISOString();
    for (const c of list.conversations || []) {
      const r = toRow(c);
      await run(
        `INSERT INTO ka_conversations (id, ad_id, role, ad_title, other_name, last_text, last_inbound, last_at, unread, polled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET ad_title = excluded.ad_title, other_name = excluded.other_name,
           last_text = excluded.last_text, last_inbound = excluded.last_inbound, last_at = excluded.last_at,
           unread = excluded.unread, polled_at = excluded.polled_at`,
        [r.id, r.ad_id, r.role, r.ad_title, r.other_name, r.last_text, r.last_inbound, r.last_at, r.unread, now]
      );
    }
    return { polled: (list.conversations || []).length };
  }

  /** Seller answers the buyer has not looked at, newest first. */
  async function reminders() {
    return query(
      `SELECT id, ad_id, ad_title, other_name, last_text, last_at FROM ka_conversations
        WHERE role = 'Buyer' AND last_inbound = 1 AND unread = 1 AND (seen_at IS NULL OR seen_at <> last_at)
        ORDER BY last_at DESC`
    );
  }

  async function conversationFor(adId) {
    return (await query('SELECT id FROM ka_conversations WHERE ad_id = ? AND role = ? LIMIT 1', [String(adId), 'Buyer']))[0] || null;
  }

  /** The thread, oldest first, marked as seen. */
  async function thread(id) {
    const t = await ka.call('GET', `${BASE}/${encodeURIComponent(id)}?contentWarnings=true`);
    // Seen up to its newest message: a later one reminds again.
    await run('UPDATE ka_conversations SET seen_at = last_at WHERE id = ?', [id]);
    return {
      id: t.id,
      ad_id: String(t.adId),
      ad_title: t.adTitle,
      other_name: t.role === 'Buyer' ? t.sellerName : t.buyerName,
      messages: (t.messages || []).map(m => ({ mine: m.boundness === 'OUTBOUND', text: m.textShort, at: m.receivedDate })),
    };
  }

  async function reply(id, text) {
    await ka.call('POST', `${BASE}/${encodeURIComponent(id)}`, { message: text });
    await poll();
  }

  /** A new conversation about a listing, under the name the buyer's own conversations carry. */
  async function contact(adId, text) {
    const list = await ka.call('GET', `${BASE}?page=0&size=50`);
    const mine = (list.conversations || []).find(c => c.role === 'Buyer');
    if (!mine || !mine.buyerName) throw new Error('Kein Kontaktname bekannt.');
    const out = await ka.call('POST', BASE, { adId: String(adId), contacter: { name: mine.buyerName }, message: text });
    await poll();
    return { id: out.conversationId || out.id || null };
  }

  function start() {
    const tick = () => poll().catch(e => console.error('Kleinanzeigen poll:', e.message));
    setTimeout(tick, 30 * 1000);
    return setInterval(tick, POLL_MS);
  }

  return { poll, reminders, conversationFor, thread, reply, contact, start };
};
