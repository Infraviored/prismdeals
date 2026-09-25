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
    it('creates the hunt first, hangs the terms on it and stores the musts', async () => {
      const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
      globalThis.fetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
        calls.push({ url, method: init.method || 'GET', body: JSON.parse(String(init.body || '{}')) });
        // The real family endpoint answers with the family only: no campaign.
        const body = url === '/api/campaigns' ? { success: true, id: 101 } : { id: 42 };
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
      });

      const result = await executeHuntSave({
        intentText: 'Supersportmotorrad mit min. 170PS. Yamaha r1 rn19 oder Honda CBR 1000 rr',
        huntType: 'shortlist',
        models: ['Yamaha R1 RN19', 'Honda CBR 1000 RR'],
        musts: [{ id: 'powerPs', label: 'mindestens 170 PS', type: 'number', want: { min: 170 } }],
        prefs: [{ id: 'ABS', label: 'ABS', want: { text: 'ABS' }, type: 'text' }],
        sizes: [],
        place: null,
        locationId: '7074',
        locationSlug: 'vilgertshofen',
        radius: 200,
        maxPrice: 7000,
        categoryId: '305',
        attributes: [],
        parsedIntent: null,
        probeMarketPicture: mockMarketPicture,
        probeRungs: mockRungs,
      });

      expect(result).toEqual({ campaignId: 101, familyId: 42 });
      expect(calls.map(c => `${c.method} ${c.url}`)).toEqual([
        'POST /api/campaigns',
        'POST /api/search-families',
        'PUT /api/campaigns/101/requirements',
      ]);
      expect(calls[0].body.name).toBe('Yamaha R1 RN19 / Honda CBR 1000 RR');
      expect(calls[1].body.campaign_id).toBe(101);
      expect(calls[2].body.requirements).toEqual([
        { id: 'own_mindestens_170_ps', label: 'mindestens 170 PS', importance: 'high', own: true, buyer_wants: { min: 170 } },
        { id: 'own_abs', label: 'ABS', importance: 'low', own: true, buyer_wants: { present: true } },
      ]);
    });
  });
});

describe('brandsOf', () => {
  it('takes each proposed model’s brand once', async () => {
    const { brandsOf } = await import('../huntSave');
    expect(brandsOf(['Honeywell HT-900', 'Rowenta Turbo Silence', 'Honeywell HYF290E'])).toEqual(['honeywell', 'rowenta']);
  });
});

describe('huntDisplayName', () => {
  it('names a class hunt after the class', async () => {
    const { huntDisplayName } = await import('../huntSave');
    expect(
      huntDisplayName({
        intentText: 'Ventilator Innenraum, bis 25 Euro',
        huntType: 'class',
        models: ['Honeywell HT-900', 'Dyson AM07'],
        parsedIntent: { class: 'ventilator' } as never,
      })
    ).toBe('Ventilator');
  });
});
