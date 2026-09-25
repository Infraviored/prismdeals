import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFundeData } from '../useFundeData';

afterEach(() => vi.restoreAllMocks());

describe('useFundeData', () => {
  it('keeps the score the API computed, so every row can show it', async () => {
    const listing = {
      id: 1, title: 'Corsair', price_eur: 140, score: 80,
      score_parts: { score: 80, gate: { met: ['DDR4'], violated: [], open: [], factor: 1 }, axes: {} },
      market_median: 150, details: { Zustand: 'Gut' },
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes('/overview') ? {} : { listings: [listing], total: 1 };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const { result } = renderHook(() =>
      useFundeData({ campaign: { id: 7, name: 'RAM' } as never }),
    );
    await waitFor(() => expect(result.current.listings.length).toBe(1));
    const row = result.current.listings[0];
    expect(row.score).toBe(80);
    expect(row.market_median).toBe(150);
    expect(row.score_parts?.gate.met).toEqual(['DDR4']);
    expect(row.details).toEqual({ Zustand: 'Gut' });
  });
});
