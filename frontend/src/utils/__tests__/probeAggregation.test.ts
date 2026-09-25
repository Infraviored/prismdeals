import { describe, it, expect } from 'vitest';
import {
  applyRelaxToMarketPicture,
  getLikelyCountForBudget,
  calculateRungStats,
  attributesToFilters,
} from '../probeAggregation';
import type { MarketPicture, ProbeRung } from '../../types';

describe('probeAggregation', () => {
  const sampleMarketPicture: MarketPicture = {
    rungs: [
      {
        term: 'thinkpad-oled',
        label: 'thinkpad oled',
        source: 'seed',
        total: 60,
        sampled: 25,
        likely: 15,
        unclear: 5,
        no: 5,
        new_likely: 15,
        gain: 0.6,
        overlap: 0.0,
        likely_share: 0.25,
        kept: true,
        prices: [600, 750, 800],
      },
      {
        term: 'thinkpad-32gb',
        label: 'thinkpad 32gb',
        source: 'seed',
        total: 18,
        sampled: 18,
        likely: 8,
        unclear: 2,
        no: 8,
        new_likely: 5,
        gain: 0.28,
        overlap: 0.38,
        likely_share: 0.44,
        kept: true,
        prices: [700, 850],
      },
    ],
    chosen_terms: ['thinkpad oled', 'thinkpad 32gb'],
    estimate: {
      union_likely: 11,
      union_unclear: 6,
      median_price: 750,
    },
    per_budget: [
      { max: 500, likely: 2 },
      { max: 800, likely: 8 },
      { max: 1000, likely: 11 },
    ],
    relax: [
      {
        must: 'ram>=32',
        label: '32 GB',
        likely_without: 23,
      },
    ],
    models_seen: [
      { name: 'ThinkPad T14', count: 8, median: 720 },
      { name: 'ThinkPad X1', count: 4, median: 850 },
    ],
    requests: 4,
    seconds: 3.2,
    partial: false,
  };

  describe('applyRelaxToMarketPicture', () => {
    it('updates union_likely and scales per_budget without new requests', () => {
      const relaxed = applyRelaxToMarketPicture(sampleMarketPicture, '32 GB');

      // Estimate union_likely snaps to likely_without (23)
      expect(relaxed.estimate.union_likely).toBe(23);

      // Relax item is removed from relax suggestions
      expect(relaxed.relax).toHaveLength(0);

      // Budget steps scale proportionally by 23 / 11 (~2.09)
      expect(relaxed.per_budget[0].max).toBe(500);
      expect(relaxed.per_budget[0].likely).toBe(Math.round(2 * (23 / 11))); // 4
      expect(relaxed.per_budget[1].max).toBe(800);
      expect(relaxed.per_budget[1].likely).toBe(Math.round(8 * (23 / 11))); // 17
      expect(relaxed.per_budget[2].max).toBe(1000);
      expect(relaxed.per_budget[2].likely).toBe(23);
    });

    it('works when relaxed by must id instead of label', () => {
      const relaxed = applyRelaxToMarketPicture(sampleMarketPicture, 'ram>=32');
      expect(relaxed.estimate.union_likely).toBe(23);
      expect(relaxed.relax).toHaveLength(0);
    });

    it('returns unchanged picture when must id not found', () => {
      const relaxed = applyRelaxToMarketPicture(sampleMarketPicture, 'non-existent');
      expect(relaxed).toEqual(sampleMarketPicture);
    });

    it('handles empty relax list safely', () => {
      const emptyRelaxPicture: MarketPicture = {
        ...sampleMarketPicture,
        relax: [],
      };
      const relaxed = applyRelaxToMarketPicture(emptyRelaxPicture, '32 GB');
      expect(relaxed).toEqual(emptyRelaxPicture);
    });
  });

  describe('getLikelyCountForBudget', () => {
    it('returns union_likely when no max price threshold is selected', () => {
      const count = getLikelyCountForBudget(sampleMarketPicture, null);
      expect(count).toBe(11);
    });

    it('returns exact count for matching budget step', () => {
      expect(getLikelyCountForBudget(sampleMarketPicture, 500)).toBe(2);
      expect(getLikelyCountForBudget(sampleMarketPicture, 800)).toBe(8);
      expect(getLikelyCountForBudget(sampleMarketPicture, 1000)).toBe(11);
    });

    it('finds appropriate step when price is between thresholds', () => {
      expect(getLikelyCountForBudget(sampleMarketPicture, 650)).toBe(2);
      expect(getLikelyCountForBudget(sampleMarketPicture, 900)).toBe(8);
      expect(getLikelyCountForBudget(sampleMarketPicture, 1200)).toBe(11);
    });

    it('returns 0 when market picture is null', () => {
      expect(getLikelyCountForBudget(null, 500)).toBe(0);
    });
  });

  describe('calculateRungStats', () => {
    it('correctly aggregates metrics across rungs', () => {
      const rungs: ProbeRung[] = sampleMarketPicture.rungs;
      const stats = calculateRungStats(rungs);

      expect(stats.totalRungs).toBe(2);
      expect(stats.keptRungs).toBe(2);
      expect(stats.totalHits).toBe(78); // 60 + 18
      expect(stats.totalLikely).toBe(23); // 15 + 8
      expect(stats.totalNewLikely).toBe(20); // 15 + 5
    });

    it('handles dropped rungs properly', () => {
      const mixedRungs: ProbeRung[] = [
        ...sampleMarketPicture.rungs,
        {
          term: 'dropped-term',
          label: 'dropped term',
          source: 'broaden',
          total: 100,
          sampled: 20,
          likely: 1,
          unclear: 0,
          no: 19,
          new_likely: 0,
          gain: 0.0,
          overlap: 0.9,
          likely_share: 0.01,
          kept: false,
          prices: [],
        },
      ];
      const stats = calculateRungStats(mixedRungs);
      expect(stats.totalRungs).toBe(3);
      expect(stats.keptRungs).toBe(2);
      expect(stats.totalHits).toBe(178);
    });
  });

  it('turns URL filter attributes into the probe filter map', () => {
    expect(
      attributesToFilters(['motorraeder_roller.km_i:,30000', 'motorraeder_roller.ez_i:2010,', 'broken'])
    ).toEqual({ 'motorraeder_roller.km_i': ',30000', 'motorraeder_roller.ez_i': '2010,' });
  });
});
