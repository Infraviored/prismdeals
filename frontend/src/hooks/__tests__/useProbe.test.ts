import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProbe } from '../useProbe';
import type { MarketPicture, ProbeRung } from '../../types';

describe('useProbe', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockRung1: ProbeRung = {
    term: 'thinkpad-oled',
    label: 'thinkpad oled',
    source: 'seed',
    total: 50,
    sampled: 25,
    likely: 20,
    unclear: 3,
    no: 2,
    new_likely: 20,
    gain: 0.8,
    overlap: 0.0,
    likely_share: 0.4,
    kept: true,
    prices: [700, 800],
  };

  const mockMarketPicture: MarketPicture = {
    rungs: [mockRung1],
    chosen_terms: ['thinkpad oled'],
    estimate: {
      union_likely: 20,
      union_unclear: 3,
      median_price: 750,
    },
    per_budget: [
      { max: 500, likely: 5 },
      { max: 800, likely: 18 },
    ],
    relax: [
      { must: 'ram>=32', label: '32 GB', likely_without: 35 },
    ],
    models_seen: [{ name: 'ThinkPad T14', count: 12, median: 720 }],
    requests: 2,
    seconds: 1.5,
    partial: false,
  };

  it('streams rungs and final market picture from SSE events', async () => {
    const ssePayload = [
      `event: rung\ndata: ${JSON.stringify(mockRung1)}\n\n`,
      `event: result\ndata: ${JSON.stringify(mockMarketPicture)}\n\n`,
      `event: done\ndata: {"code":0}\n\n`,
    ].join('');

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ssePayload));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const { result } = renderHook(() => useProbe());

    expect(result.current.isProbing).toBe(false);
    expect(result.current.rungs).toHaveLength(0);

    await act(async () => {
      await result.current.startProbe({
        category_code: '278',
        seed_terms: ['thinkpad oled'],
      });
    });

    expect(result.current.isProbing).toBe(false);
    expect(result.current.rungs).toHaveLength(1);
    expect(result.current.rungs[0].term).toBe('thinkpad-oled');
    expect(result.current.marketPicture).not.toBeNull();
    expect(result.current.marketPicture?.estimate.union_likely).toBe(20);
    expect(result.current.effectiveLikelyCount).toBe(20);
  });

  it('handles client-side relax action without extra network requests', async () => {
    const ssePayload = [
      `event: result\ndata: ${JSON.stringify(mockMarketPicture)}\n\n`,
      `event: done\ndata: {"code":0}\n\n`,
    ].join('');

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ssePayload));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const { result } = renderHook(() => useProbe());

    await act(async () => {
      await result.current.startProbe({});
    });

    expect(result.current.marketPicture?.estimate.union_likely).toBe(20);

    // Call relaxMust
    act(() => {
      result.current.relaxMust('32 GB');
    });

    // Should update to likely_without (35)
    expect(result.current.marketPicture?.estimate.union_likely).toBe(35);
    expect(result.current.effectiveLikelyCount).toBe(35);
    expect(result.current.relaxedMusts.has('32 GB')).toBe(true);

    // No extra fetch call made
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('updates selected budget and recalculates effective likely count', async () => {
    const ssePayload = [
      `event: result\ndata: ${JSON.stringify(mockMarketPicture)}\n\n`,
      `event: done\ndata: {"code":0}\n\n`,
    ].join('');

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ssePayload));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const { result } = renderHook(() => useProbe());

    await act(async () => {
      await result.current.startProbe({});
    });

    expect(result.current.effectiveLikelyCount).toBe(20);

    act(() => {
      result.current.selectBudget(500);
    });

    expect(result.current.selectedBudgetMax).toBe(500);
    expect(result.current.effectiveLikelyCount).toBe(5);
  });

  it('handles probe error event from SSE', async () => {
    const ssePayload = `event: error\ndata: {"error":"Rate limit reached"}\n\n`;

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ssePayload));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const { result } = renderHook(() => useProbe());

    await act(async () => {
      await result.current.startProbe({});
    });

    expect(result.current.error).toBe('Rate limit reached');
  });
});
