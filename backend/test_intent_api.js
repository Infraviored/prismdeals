const express = require('express');
const assert = require('assert');
const router = require('./intent_api');

async function test() {
  const app = express();
  app.use(express.json());
  app.use(router);

  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  try {
    console.log('Testing 1: POST /api/intent/parse with valid text');
    const parseRes = await fetch(`${base}/api/intent/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Corsair 2x16 GB DDR4-3200 CL16, max 150 €',
        category: '225',
      }),
    });
    assert.strictEqual(parseRes.status, 200, 'Expected 200 OK from /api/intent/parse');
    const intent = await parseRes.json();
    assert.ok(intent && typeof intent === 'object', 'Expected intent object');
    assert.strictEqual(intent.hunt_type, 'exact', 'Expected hunt_type exact for Corsair RAM');
    assert.ok(Array.isArray(intent.musts), 'Expected musts array');
    assert.ok(typeof intent.filters === 'object', 'Expected filters object');
    assert.ok(intent.budget && intent.budget.max === 150, 'Expected budget max 150');

    console.log('Testing 2: POST /api/intent/parse with missing text (400 validation)');
    const emptyRes = await fetch(`${base}/api/intent/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '   ' }),
    });
    assert.strictEqual(emptyRes.status, 400, 'Expected 400 for empty text');

    console.log('Testing 3: POST /api/intent/models with valid class');
    const modelsRes = await fetch(`${base}/api/intent/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_text: '1000cc Supersportler',
        budget: 7000,
        category: '305',
      }),
    });
    assert.strictEqual(modelsRes.status, 200, 'Expected 200 OK from /api/intent/models');
    const { models } = await modelsRes.json();
    assert.ok(Array.isArray(models), 'Expected models array');
    assert.ok(models.length >= 5, `Expected at least 5 proposed models, got ${models.length}`);
    for (const m of models) {
      assert.ok(typeof m.model === 'string' && m.model.length > 0, 'Every proposal needs a model name');
      assert.ok(typeof m.years === 'string', 'Every proposal needs years string');
    }

    console.log('Testing 4: POST /api/intent/models with missing class (400 validation)');
    const emptyClassRes = await fetch(`${base}/api/intent/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_text: '' }),
    });
    assert.strictEqual(emptyClassRes.status, 400, 'Expected 400 for empty class_text');

    console.log('All intent_api tests passed successfully!');
  } finally {
    server.close();
  }
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
