import { describe, it, expect } from 'vitest';
import { broadenQuery } from '../searchTerms';
import { withoutGeneration } from '../searchTerms';

describe('broadenQuery', () => {
  it('keeps what sellers write and drops what they leave out', () => {
    expect(broadenQuery('Corsair Vengeance 32GB (2x16) DDR4-3200 CL16')).toBe('corsair vengeance 32gb');
  });

  it('drops a clock and a split written without parentheses', () => {
    expect(broadenQuery('G.Skill Ripjaws 2x8GB 3600 MHz CL18')).toBe('g skill ripjaws');
  });

  it('leaves a term alone that is already broad', () => {
    expect(broadenQuery('Yamaha R1')).toBe('yamaha r1');
    expect(broadenQuery('Matratze 140x200')).toBe('matratze');
  });
});

describe('withoutGeneration', () => {
  it('drops a trailing generation code, keeps short model names whole', () => {
    expect(withoutGeneration('yamaha-r1-rn19')).toBe('yamaha-r1');
    expect(withoutGeneration('BMW 3er E90')).toBe('BMW 3er');
    expect(withoutGeneration('honda-cbr-1000-rr')).toBe('honda-cbr-1000-rr');
    expect(withoutGeneration('golf 7')).toBe('golf 7');
    expect(withoutGeneration('corsair-vengeance-32gb')).toBe('corsair-vengeance-32gb');
  });
});
