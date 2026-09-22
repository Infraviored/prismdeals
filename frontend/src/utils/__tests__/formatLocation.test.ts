import { describe, it, expect } from 'vitest';
import { formatLocation } from '../formatLocation';

describe('formatLocation', () => {
  it('strips German federal state prefix', () => {
    expect(formatLocation('Bayern - Landsberg (Lech)')).toBe('Landsberg (Lech)');
  });

  it('preserves place names containing hyphens when prefix is not a federal state', () => {
    expect(formatLocation('80807 Milbertshofen - Am Hart')).toBe('80807 Milbertshofen - Am Hart');
  });

  it('leaves standard place names without prefixes unchanged', () => {
    expect(formatLocation('Landsberg (Lech)')).toBe('Landsberg (Lech)');
  });
});
