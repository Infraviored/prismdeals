const express = require('express');
const assert = require('assert');
const router = require('./taxonomy');

async function test() {
  const app = express();
  app.use(router);
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  try {
    // The tree goes out without filters: 161 categories carrying their filters
    // is 714 kB, which is not something to hand a phone on a mobile connection.
    const res = await fetch(`${base}/api/taxonomy/categories`);
    assert.strictEqual(res.status, 200);
    const { categories } = await res.json();
    assert.ok(categories.length > 100, `expected the whole tree, got ${categories.length}`);
    assert.ok(!('filters' in categories[0]), 'the tree must not carry filters');
    assert.ok(categories.some(c => c.parent_id), 'the tree has more than one level');

    const asJson = JSON.stringify(categories).length;
    assert.ok(asJson < 120000, `tree is ${Math.round(asJson / 1024)} kB, too much for a phone`);

    // Notebooks, the category the URL grammar was verified against.
    const one = await fetch(`${base}/api/taxonomy/categories/278`);
    assert.strictEqual(one.status, 200);
    const notebooks = await one.json();
    assert.strictEqual(notebooks.id, '278');
    assert.ok(notebooks.filters.length > 3, 'notebooks offer several filters');

    const brand = notebooks.filters.find(f => f.key === 'notebooks.brand_s');
    assert.ok(brand, 'the brand filter is there');
    assert.strictEqual(brand.location, 'tail', 'attribute filters ride the tail');
    assert.ok(
      brand.options.some(o => o.value === 'apple'),
      'apple is one of the brands'
    );

    // Price is a path segment before the term, not a tail attribute. The two
    // zones go into the URL in different places, so the client must be told
    // which is which.
    const price = notebooks.filters.find(f => f.key === 'preis');
    assert.ok(price && price.location === 'path', 'price is a path facet');

    const missing = await fetch(`${base}/api/taxonomy/categories/999999`);
    assert.strictEqual(missing.status, 404, 'an unknown category is not an empty one');

    // Searching narrows the tree rather than making the client filter 161 rows.
    const search = await fetch(`${base}/api/taxonomy/categories?q=notebook`);
    const narrowed = (await search.json()).categories;
    assert.ok(narrowed.length > 0 && narrowed.length < categories.length, 'q narrows the tree');

    console.log('taxonomy api: all assertions passed');
  } finally {
    server.close();
  }
}

test().catch(e => {
  console.error(e.message);
  process.exit(1);
});
