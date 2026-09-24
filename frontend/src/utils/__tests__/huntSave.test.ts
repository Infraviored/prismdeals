import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compileHuntTerms, executeHuntSave } from '../huntSave';
import type { MarketPicture, ProbeRung } from '../../types';

describe('huntSave', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockRungs: ProbeRung[] = [
    {
      term: 'thinkpad-t14-oled',
      label: 'ThinkPad T14 OLED',
      source: 'seed',
      total: 30,
      sampled: 15,
      likely: 10,
      unclear: 2,
      no: 3,
      new_likely: 10,
      gain: 0.67,
      overlap: 0.0,
      likely_share: 0.33,
      kept: true,
      prices: [700],
    },
    {
      term: 'dropped-term',
      label: 'Dropped Term',
      source: 'broaden',
      total: 50,
      sampled: 10,
      likely: 0,
      unclear: 0,
      no: 10,
      new_likely: 0,
      gain: 0.0,
      overlap: 0.9,
      likely_share: 0.0,
      kept: false,
      prices: [],
    },
  ];

  const mockMarketPicture: MarketPicture = {
    rungs: mockRungs,
    chosen_terms: ['thinkpad t14 oled'],
    estimate: { union_likely: 10, union_unclear: 2, median_price: 700 },
    per_budget: [{ max: 800, likely: 10 }],
    relax: [],
    models_seen: [],
    requests: 2,
    seconds: 1.2,
    partial: false,
  };

  describe('compileHuntTerms', () => {
    it('prioritizes chosen_terms from market picture', () => {
      const terms = compileHuntTerms({
        intentText: 'ThinkPad Laptop',
        models: ['ThinkPad X1'],
        probeMarketPicture: mockMarketPicture,
        probeRungs: mockRungs,
      });

      expect(terms).toHaveLength(1);
      expect(terms[0].label).toBe('thinkpad t14 oled');
      expect(terms[0].term).toBe('thinkpad-t14-oled');
    });

    it('falls back to kept rungs when chosen_terms is empty', () => {
      const pictureWithoutChosen: MarketPicture = {
        ...mockMarketPicture,
        chosen_terms: [],
      };
      const terms = compileHuntTerms({
        intentText: 'ThinkPad Laptop',
        models: ['ThinkPad X1'],
        probeMarketPicture: pictureWithoutChosen,
        probeRungs: mockRungs,
      });

      expect(terms).toHaveLength(1);
      expect(terms[0].label).toBe('ThinkPad T14 OLED');
    });

    it('falls back to models when probe rungs are empty', () => {
      const terms = compileHuntTerms({
        intentText: 'ThinkPad Laptop',
        models: ['ThinkPad T14', 'ThinkPad P14s'],
        probeMarketPicture: null,
        probeRungs: [],
      });

      expect(terms).toHaveLength(2);
      expect(terms[0].label).toBe('ThinkPad T14');
      expect(terms[1].label).toBe('ThinkPad P14s');
    });

    it('falls back to broadened intent text when no models or probe data exists', () => {
      const terms = compileHuntTerms({
        intentText: 'ThinkPad T14 Gen 3',
        models: [],
        probeMarketPicture: null,
        probeRungs: [],
      });

      expect(terms).toHaveLength(1);
      expect(terms[0].term).toBe('thinkpad-t14-gen-3');
    });
  });

  describe('executeHuntSave', () => {
    it('creates search family, updates campaign intent, and starts scraper crawl', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/api/search-families') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 42, campaign_id: 101 }),
          });
        }
        if (url.startsWith('/api/campaigns/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true }),
          });
        }
        if (url === '/api/scraper/start') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ started: true }),
          });
        }
        return Promise.reject(new Error(`Unexpected url: ${url}`));
      });

      const res = await executeHuntSave({
        intentText: 'ThinkPad OLED 32GB',
        huntType: 'features',
        models: [],
        musts: [{ id: 'ram', label: '32 GB' }],
        prefs: [{ id: 'screen', label: 'OLED' }],
        sizes: [],
        place: {
          name: 'Berlin',
          label: 'Berlin (10115)',
          qualifier: '',
          state: 'Berlin',
          postal_code: '10115',
          lat: 52.5,
          lon: 13.4,
        },
        locationId: '3331',
        locationSlug: 'berlin',
        radius: 30,
        maxPrice: 800,
        categoryId: '278',
        attributes: [],
        parsedIntent: null,
        probeMarketPicture: mockMarketPicture,
        probeRungs: mockRungs,
      });

      expect(res.campaignId).toBe(101);
      expect(res.familyId).toBe(42);

      // Verify POST /api/search-families call
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/search-families',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Verify PATCH /api/campaigns/101 call
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/campaigns/101',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"hunt_type":"features"'),
        })
      );

      // Verify scraper start call
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/scraper/start',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ campaign_id: 101 }),
        })
      );
    });
  });
});
