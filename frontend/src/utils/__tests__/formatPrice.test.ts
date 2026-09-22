import { describe, it, expect } from 'vitest';
import { formatPrice } from '../formatPrice';

// The real t is typed to the key union; the test only needs the fallback path.
const t = ((key: string) => key) as unknown as Parameters<typeof formatPrice>[2];

describe('formatPrice', () => {
  it('keeps VB, because a negotiable price is not a fixed one', () => {
    expect(formatPrice(60, '60 € VB', t).text).toBe('60 € VB');
  });

  it('spells out Verhandlungsbasis as VB too', () => {
    expect(formatPrice(120, '120 € Verhandlungsbasis', t).text).toBe('120 € VB');
  });

  it('leaves a fixed price alone', () => {
    expect(formatPrice(60, '60 €', t).text).toBe('60 €');
  });

  it('takes the amount from the number, not from the string', () => {
    expect(formatPrice(1200, '1.200 € VB', t).text).toBe('1200 € VB');
  });

  it('does not read VB out of a word that merely contains it', () => {
    expect(formatPrice(60, '60 € SVBX', t).text).toBe('60 €');
  });

  it('falls back to what the site said when there is no number', () => {
    expect(formatPrice(null, 'Zu verschenken', t)).toEqual({
      text: 'Zu verschenken',
      isMissing: false,
    });
  });

  it('says so when there is no price at all', () => {
    expect(formatPrice(null, '', t)).toEqual({ text: 'surface.noPrice', isMissing: true });
  });
});
