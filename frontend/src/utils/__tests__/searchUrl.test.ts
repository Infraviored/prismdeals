import { describe, it, expect } from 'vitest';
import {
  decomposeSearchUrl,
  composeSearchUrl,
  slugify,
  parseTail,
  parsePrice,
} from '../searchUrl';

describe('searchUrl utilities', () => {
  describe('slugify', () => {
    it('handles German umlauts and punctuation properly', () => {
      expect(slugify('München (Bayern)')).toBe('muenchen-bayern');
      expect(slugify('Groß-Gerau')).toBe('gross-gerau');
      expect(slugify('Landsberg am Lech')).toBe('landsberg-am-lech');
    });
  });

  describe('parseTail', () => {
    it('extracts location and radius from tail segment', () => {
      const tail = parseTail('https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30');
      expect(tail).toEqual({
        category: null,
        location: 'l7091',
        radius: 30,
      });
    });

    it('extracts category if present', () => {
      const tail = parseTail('https://www.kleinanzeigen.de/s-notebooks/muenchen/preis::450/laptop/k0c278l6411');
      expect(tail).toEqual({
        category: '278',
        location: 'l6411',
        radius: null,
      });
    });
  });

  describe('parsePrice', () => {
    it('parses min and max price', () => {
      expect(parsePrice('https://www.kleinanzeigen.de/s-ort/preis:50:200/k0l123r30')).toEqual({
        min: 50,
        max: 200,
      });
      expect(parsePrice('https://www.kleinanzeigen.de/s-ort/preis::500/k0l123r30')).toEqual({
        min: null,
        max: 500,
      });
      expect(parsePrice('https://www.kleinanzeigen.de/s-ort/preis:100:/k0l123r30')).toEqual({
        min: 100,
        max: null,
      });
    });

    it('returns null when no price segment exists', () => {
      expect(parsePrice('https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30')).toBeNull();
    });
  });

  describe('decomposeSearchUrl', () => {
    it('decomposes Campaign 6 Drucker URL without price filter', () => {
      const url = 'https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30';
      const result = decomposeSearchUrl(url);
      expect(result).toEqual({
        locationSlug: 'landsberg-am-lech',
        locationId: '7091',
        radius: 30,
        minPrice: null,
        maxPrice: null,
        query: 'drucker',
        category: null,
      });
    });

    it('decomposes URL with price filter and category', () => {
      const url = 'https://www.kleinanzeigen.de/s-notebooks/muenchen/preis:100:600/laptop/k0c278l6411r20';
      const result = decomposeSearchUrl(url);
      expect(result).toEqual({
        locationSlug: 'notebooks',
        locationId: '6411',
        radius: 20,
        minPrice: 100,
        maxPrice: 600,
        query: 'muenchen',
        category: '278',
      });
    });

    it('returns null for invalid URLs', () => {
      expect(decomposeSearchUrl('')).toBeNull();
      expect(decomposeSearchUrl('https://example.com/not-kleinanzeigen')).toBeNull();
    });
  });

  describe('composeSearchUrl', () => {
    it('composes canonical URL matching Campaign 6 Drucker', () => {
      const url = composeSearchUrl({
        locationSlug: 'landsberg-am-lech',
        locationId: '7091',
        radius: 30,
        query: 'drucker',
      });
      expect(url).toBe('https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30');
    });

    it('adds price range segment when min and max price are specified', () => {
      const url = composeSearchUrl({
        locationSlug: 'landsberg-am-lech',
        locationId: '7091',
        radius: 30,
        minPrice: 25,
        maxPrice: 150,
        query: 'drucker',
      });
      expect(url).toBe('https://www.kleinanzeigen.de/s-landsberg-am-lech/preis:25:150/drucker/k0l7091r30');
    });

    it('adds price segment when only maxPrice is specified', () => {
      const url = composeSearchUrl({
        locationSlug: 'landsberg-am-lech',
        locationId: '7091',
        radius: 50,
        maxPrice: 100,
        query: 'drucker',
      });
      expect(url).toBe('https://www.kleinanzeigen.de/s-landsberg-am-lech/preis::100/drucker/k0l7091r50');
    });

    it('modifies radius in the tail segment correctly', () => {
      const url = composeSearchUrl({
        locationSlug: 'landsberg-am-lech',
        locationId: '7091',
        radius: 100,
        query: 'drucker',
      });
      expect(url).toBe('https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r100');
    });
  });
});
