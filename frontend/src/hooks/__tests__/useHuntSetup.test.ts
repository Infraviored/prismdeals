import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHuntSetup } from '../useHuntSetup';

describe('useHuntSetup', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('a new intent text drops what the previous one parsed', async () => {
    const replies = [
      { hunt_type: 'shortlist', confidence: 1, musts: [{ id: 'ps', label: 'PS', want: { min: 170 } }], prefs: [], models: ['Yamaha R1'], category_id: '305' },
      { hunt_type: 'exact', confidence: 1, musts: [], prefs: [] },
    ];
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(replies.shift()) })
    );
    const { result } = renderHook(() => useHuntSetup());
    await act(async () => {
      await result.current.submitIntent('Yamaha R1, min. 170 PS');
    });
    expect(result.current.musts).toHaveLength(1);
    await act(async () => {
      await result.current.submitIntent('Rennrad 56 cm Rahmen');
    });
    expect(result.current.musts).toEqual([]);
    expect(result.current.models).toEqual([]);
    expect(result.current.categoryId).toBeNull();
  });
});
