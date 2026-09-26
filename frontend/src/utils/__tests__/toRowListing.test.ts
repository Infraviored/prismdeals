import { describe, it, expect } from 'vitest';
import { toRowListing } from '../toRowListing';

describe('toRowListing', () => {
  it('carries the same offer listed elsewhere through to the row', () => {
    const also = [{ id: '9', url: 'https://www.kleinanzeigen.de/s-anzeige/x/9', location: 'Südstadt', price_eur: 6200 }];
    const row = toRowListing({ id: '1', title: 'CBR', also } as never);
    expect(row.also).toEqual(also);
    expect(toRowListing({ id: '2', title: 'x' } as never).also).toBeNull();
  });
});
