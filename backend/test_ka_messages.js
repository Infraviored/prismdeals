/**
 * Conversations: polled into the table; a reminder only for an unread seller
 * answer not yet opened here; a thread opened here is seen.
 */
const assert = require('assert');
const Module = require('module');
const sqlite3 = require('sqlite3');
const fs = require('fs');

// ka_browser without a browser: canned answers from Kleinanzeigen.
const calls = [];
const fake = {
  status: () => ({ connected: true }),
  call: async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'GET' && path.includes('?page=')) {
      return { conversations: [
        { id: 'a', adId: 1, role: 'Buyer', adTitle: 'CBR', sellerName: 'Markus', buyerName: 'Florian Schneider', textShortTrimmed: 'Ja, noch da', boundness: 'INBOUND', receivedDate: '2026-09-27T10:00:00', unread: true },
        { id: 'b', adId: 2, role: 'Buyer', adTitle: 'RAM', sellerName: 'Jo', buyerName: 'Florian Schneider', textShortTrimmed: 'Danke', boundness: 'INBOUND', receivedDate: '2026-09-20T10:00:00', unread: false },
        { id: 'c', adId: 3, role: 'Buyer', adTitle: 'Sofa', sellerName: 'Ann', buyerName: 'Florian Schneider', textShortTrimmed: 'Hallo?', boundness: 'OUTBOUND', receivedDate: '2026-09-27T09:00:00', unread: false },
      ] };
    }
    if (method === 'GET') return { id: 'a', adId: 1, role: 'Buyer', sellerName: 'Markus', adTitle: 'CBR', messages: [{ boundness: 'INBOUND', textShort: 'Ja, noch da', receivedDate: '2026-09-27T10:00:00' }] };
    return { conversationId: 'n1' };
  },
};
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === './ka_browser') return fake;
  return load.call(this, request, ...rest);
};

const db = new sqlite3.Database(':memory:');
const query = (s, p = []) => new Promise((r, j) => db.all(s, p, (e, x) => (e ? j(e) : r(x))));
const run = (s, p = []) => new Promise((r, j) => db.run(s, p, e => (e ? j(e) : r())));
const schema = fs.readFileSync(require('path').join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
const table = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS ka_conversations'), schema.indexOf('CREATE INDEX IF NOT EXISTS idx_ka_conversations_ad'));

(async () => {
  await run(table);
  const m = require('./ka_messages')(query, run);
  assert.deepStrictEqual(await m.poll(), { polled: 3 });
  assert.deepStrictEqual((await m.reminders()).map(r => r.id), ['a'], 'only the unread seller answer');
  assert.deepStrictEqual(await m.conversationFor(2), { id: 'b' });
  await m.thread('a');
  assert.deepStrictEqual(await m.reminders(), [], 'opened here: seen');
  const sent = await m.contact(9, 'Servus, noch da?');
  assert.deepStrictEqual(sent, { id: 'n1' });
  const post = calls.find(c => c.method === 'POST');
  assert.deepStrictEqual(post.body, { adId: '9', contacter: { name: 'Florian Schneider' }, message: 'Servus, noch da?' });
  console.log('ka messages: all assertions passed');
})().catch(e => { console.error(e); process.exit(1); });
