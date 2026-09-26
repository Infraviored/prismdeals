import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FundeAside } from '../FundeAside';
import { huntDoc, overview } from '../../test/huntFixtures';

describe('FundeAside', () => {
  it('shows prices, the usual price per target, each condition with who meets it, and why offers were rejected', () => {
    const o = overview();
    o.conditions.push({ ...huntDoc().targets[0].conditions[0], node_id: 176, met: 0, violated: 9, open: 0, total: 9 });
    render(<FundeAside overview={o} bestListing={null} doc={huntDoc()} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Prices from 3850 to 9000 €');
    expect(screen.getByTestId('markets')).toHaveTextContent('Usual for Yamaha R1 RN19 (6)');
    expect(screen.getByTestId('markets')).toHaveTextContent('8299 €');
    const reqs = document.getElementById('requirements')!;
    expect(reqs).toHaveTextContent('Kilometerstand bis 30000');
    expect(reqs).toHaveTextContent('15 / 15');
    expect(reqs).toHaveTextContent('Kilometerstand bis 5000 · Honda CBR 1000 RR SC59');
    expect(document.getElementById('rejections')).toHaveTextContent('1×Anderes Modell');
  });

  it('says nothing about a market that has no priced listing', () => {
    const o = { ...overview(), price_distribution: { min: null, max: null, count: 0, bins: [] }, conditions: [], rejections: [] };
    const { container } = render(<FundeAside overview={o} bestListing={null} />);
    expect(container.querySelector('#market')).toBeNull();
    const { container: none } = render(<FundeAside overview={null} bestListing={null} />);
    expect(none.firstChild).toBeNull();
  });
});
