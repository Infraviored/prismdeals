import { describe, it, expect } from 'vitest';
import { shortTitle } from '../shortTitle';

describe('shortTitle', () => {
  it('drops what the spec line already shows', () => {
    expect(shortTitle('Corsair Vengeance LPX 32 GB DDR4-3200 CL16 – 2×16 GB')).toBe('Corsair Vengeance LPX');
    expect(shortTitle('(A2#) Corsair Vengeance RGB Pro 32GB (2x16GB) DDR4-3200 CL16 RAM')).toBe('Corsair Vengeance RGB Pro');
    expect(shortTitle('DDR 4 Corsair Vengeance Arbeitsspeicher 32 GB (2×16 GB) 3200 Mhz')).toBe('Corsair Vengeance');
    expect(shortTitle('CORSAIR VENGEANCE® LPX Speicherkit 32 GB (2 x 16 GB) DDR4 CL16')).toBe('Corsair Vengeance LPX');
  });
});
