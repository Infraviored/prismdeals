import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFundeData } from '../useFundeData';
import { mockApi } from '../../test/mockApi';
import { listing, overview, page } from '../../test/huntFixtures';

afterEach(() => vi.unstubAllGlobals());

describe('useFundeData', () => {
  it('reads the hunt listings with verdicts, facts and target, and the counts for the tabs', async () => {
    mockApi({
      'GET /api/hunts/11/listings': page([listing('a', 'fit', { market_median: 8299, details: { Zustand: 'Gut' } })]),
      'GET /api/hunts/11/overview': overview(),
    });
    const { result } = renderHook(() => useFundeData({ huntId: 11 }));
    await waitFor(() => expect(result.current.listings.length).toBe(1));
    const row = result.current.listings[0];
    expect(row.score).toBe(80);
    expect(row.market_median).toBe(8299);
    expect(row.fit?.states).toEqual({ '2': 'met' });
    expect(row.facts).toEqual({ km: 12000 });
    expect(row.target?.name).toBe('Yamaha R1 RN19');
    expect(result.current.counts).toEqual({ all: 3, fit: 1, unclear: 1, no: 1 });
    expect(result.current.mapPoints).toHaveLength(1);
  });

  it('asks the server per tab, target, sort and deals', async () => {
    const { calls } = mockApi({
      'GET /api/hunts/11/listings': page([]),
      'GET /api/hunts/11/overview': overview(),
    });
    const { result } = renderHook(() => useFundeData({ huntId: 11 }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('verdict=fit'))).toBe(true));
    act(() => {
      result.current.setTab('all');
      result.current.setTargetId(168);
      result.current.setSort('score');
      result.current.setDealsOnly(true);
    });
    await waitFor(() => {
      const last = calls.filter((c) => c.url.includes('/listings')).pop()!.url;
      expect(last).toContain('target=168');
      expect(last).toContain('sort=score');
      expect(last).toContain('dealsOnly=1');
      expect(last).not.toContain('verdict=');
    });
  });
});
