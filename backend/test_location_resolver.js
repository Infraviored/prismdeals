const express = require('express');
const assert = require('assert');
const router = require('./location_resolver');

// Mock external HTTP requests for hermetic unit testing
router._setFetchJsonForTest(async (url) => {
  if (url.includes('86899') || url.includes('Landsberg')) {
    return { _0: 'Deutschland', _7091: '86899 Landsberg (Lech)' };
  }
  return {};
});

async function test() {
  const app = express();
  app.use(router);

  const server = app.listen(0);
  const port = server.address().port;

  try {
    // Test 1: Resolve by slug (Landsberg am Lech)
    const resSlug = await fetch(`http://localhost:${port}/api/locations/resolve?slug=landsberg-am-lech`);
    assert.strictEqual(resSlug.status, 200, 'Expected 200 for slug resolution');
    const dataSlug = await resSlug.json();
    assert.ok(dataSlug.place, 'Expected place object');
    assert.strictEqual(dataSlug.place.name, 'Landsberg', 'Expected Landsberg name');
    assert.strictEqual(dataSlug.location_id, '7091', 'Expected location_id 7091');

    // Test 2: Resolve by postal code
    const resPlz = await fetch(`http://localhost:${port}/api/locations/resolve?postal_code=86899`);
    assert.strictEqual(resPlz.status, 200, 'Expected 200 for postal code');
    const dataPlz = await resPlz.json();
    assert.strictEqual(dataPlz.location_id, '7091', 'Expected location_id 7091');

    // Test 3: Missing parameter returns 400
    const resBad = await fetch(`http://localhost:${port}/api/locations/resolve`);
    assert.strictEqual(resBad.status, 400, 'Expected 400 for empty query');

    // Test 4: Unknown slug returns 404
    const resUnknownSlug = await fetch(`http://localhost:${port}/api/locations/resolve?slug=unknown-city-xyz`);
    assert.strictEqual(resUnknownSlug.status, 404, 'Expected 404 for unknown slug');

    console.log('All backend location resolver tests passed.');
  } finally {
    server.close();
  }
}

test().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
