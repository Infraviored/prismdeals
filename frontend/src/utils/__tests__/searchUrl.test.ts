import { describe, it, expect } from 'vitest';
import {
  slugify,
  parseTail,
  parsePrice,
  decomposeSearchUrl,
  composeSearchUrl,
} from '../searchUrl';

describe('searchUrl utilities', () => {
  it('normalizes slugs properly', () => {
    expect(slugify('Brother HL-L2350DW')).toBe('brother-hl-l2350dw');
    expect(slugify('HP LaserJet Pro M428')).toBe('hp-laserjet-pro-m428');
    expect(slugify('Kühlschrank Weiß')).toBe('kuehlschrank-weiss');
  });

  it('parses tail segment correctly', () => {
    const tail1 = parseTail('https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30');
    expect(tail1).toEqual({
      category: null,
      location: 'l7091',
      radius: 30,
    });

    const tail2 = parseTail('https://www.kleinanzeigen.de/s-notebooks/k0c278l6411');
    expect(tail2).toEqual({
      category: '278',
      location: 'l6411',
      radius: null,
    });
  });

  it('parses price filters correctly', () => {
    expect(
      parsePrice('https://www.kleinanzeigen.de/s-landsberg-am-lech/preis:10:150/drucker/k0l7091r30')
    ).toEqual({ min: 10, max: 150 });

    expect(
      parsePrice('https://www.kleinanzeigen.de/s-landsberg/preis::200/k0l7091')
    ).toEqual({ min: null, max: 200 });

    expect(
      parsePrice('https://www.kleinanzeigen.de/s-landsberg/drucker/k0l7091')
    ).toBeNull();
  });

  it('decomposes full search URLs into constituent parameters', () => {
    const dec = decomposeSearchUrl(
      'https://www.kleinanzeigen.de/s-landsberg-am-lech/preis:10:150/drucker/k0l7091r30'
    );
    expect(dec).toEqual({
      locationSlug: 'landsberg-am-lech',
      locationId: '7091',
      radius: 30,
      minPrice: 10,
      maxPrice: 150,
      query: 'drucker',
      category: null,
    });
  });

  it('composes search URLs matching Kleinanzeigen format', () => {
    const composed = composeSearchUrl({
      locationSlug: 'landsberg-am-lech',
      locationId: '7091',
      radius: 30,
      minPrice: 10,
      maxPrice: 150,
      query: 'drucker',
    });
    expect(composed).toBe(
      'https://www.kleinanzeigen.de/s-landsberg-am-lech/preis:10:150/drucker/k0l7091r30'
    );
  });

  it('composes URL with max price only and no query', () => {
    const composed = composeSearchUrl({
      locationSlug: 'muenchen',
      locationId: '6411',
      radius: 50,
      maxPrice: 300,
    });
    expect(composed).toBe(
      'https://www.kleinanzeigen.de/s-muenchen/preis::300/k0l6411r50'
    );
  });
});
