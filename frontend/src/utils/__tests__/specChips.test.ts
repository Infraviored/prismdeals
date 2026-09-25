import { describe, it, expect } from 'vitest';
import { getSpecChips } from '../specChips';

describe('getSpecChips', () => {
  it('handles empty or non-object input cleanly', () => {
    expect(getSpecChips()).toEqual([]);
    expect(getSpecChips(null)).toEqual([]);
    expect(getSpecChips({})).toEqual([]);
  });

  it('formats full DDR4 spec kit correctly', () => {
    const chips = getSpecChips({
      stickCount: 2,
      gbPerStick: 16,
      generation: 'ddr4',
      speedMhz: 3200,
      casLatency: 16,
      formFactor: 'dimm',
    });
    expect(chips).toEqual(['2×16 GB', 'DDR4-3200', 'CL16', 'DIMM']);
  });

  it('formats partial kit with generation without speed', () => {
    const chips = getSpecChips({
      stickCount: 4,
      gbPerStick: 8,
      generation: 'ddr3',
    });
    expect(chips).toEqual(['4×8 GB', 'DDR3']);
  });

  it('guards against "undefined", "null", and non-numeric strings from foreign categories', () => {
    const chips = getSpecChips({
      generation: 'undefined',
      speedMhz: 'null',
      stickCount: 'none',
      gbPerStick: undefined,
      casLatency: null,
      formFactor: 'undefined',
      color: 'schwarz',
    });
    expect(chips).toEqual([]);
  });
});
