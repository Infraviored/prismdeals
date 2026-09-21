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

    // --- Suggestions ---
    //
    // The words people type are not what the categories are called: a printer
    // lives under "PC-Zubehör & Software", a mattress under "Schlafzimmer".
    // The word is in the filter values, which is where the site keeps the
    // distinction, so a suggestion carries the filter it matched on.
    const suggest = async q =>
      (await (await fetch(`${base}/api/taxonomy/suggest?q=${encodeURIComponent(q)}`)).json())
        .suggestions;

    const printer = await suggest('laserdrucker');
    assert.ok(printer.length > 0, 'a laser printer finds a category');
    assert.strictEqual(printer[0].name, 'PC-Zubehör & Software');
    assert.ok(printer[0].filter.includes('drucker'), `carries the filter: ${printer[0].filter}`);

    const mattress = await suggest('matratze');
    assert.strictEqual(mattress[0].name, 'Schlafzimmer');
    assert.ok(mattress[0].filter.includes('matratzen'), mattress[0].filter);

    // A German compound's head is its last word. Without that rule
    // "kleiderschrank" matched Damenbekleidung on "Kleider", filing a wardrobe
    // search under skirts.
    const wardrobe = await suggest('kleiderschrank');
    assert.ok(
      wardrobe.every(w => /Schrank|Schränke/i.test(w.filter_label || '')),
      `a wardrobe is a cupboard: ${wardrobe.map(w => w.filter_label).join(', ')}`
    );

    // Clothing sizes are one letter. Matched by containment they hit every term
    // with an S in it, so "bohrmaschine" came back as Damenbekleidung.
    for (const term of ['bohrmaschine', 'schneeschieber']) {
      const wrong = (await suggest(term)).filter(x => x.name.includes('bekleidung'));
      assert.strictEqual(wrong.length, 0, `${term} is not clothing`);
    }

    // A weak match is no match: a wrong category filters a search to nothing
    // and does not say why.
    assert.deepStrictEqual(await suggest('xq'), [], 'too short to guess from');
    assert.deepStrictEqual(await suggest('zzzzzzzz'), [], 'no match is an honest answer');

    assert.ok((await suggest('matratze')).length <= 3, 'at most three to choose from');

    console.log('taxonomy api: all assertions passed');
  } finally {
    server.close();
  }
}

test().catch(e => {
  console.error(e.message);
  process.exit(1);
});
