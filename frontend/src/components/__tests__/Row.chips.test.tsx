import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import { Row, type RowListing } from '../surface/Row';
import { FundeBestHero } from '../../screens/FundeBestHero';
import { FundeDetailSheet } from '../../screens/FundeDetailSheet';

// The chips come from the server (backend/db/chips.js), the same for every
// kind of goods. Facts a category-specific reader once turned into chips
// (sticks, generation) must not show up on their own any more.
const listing: RowListing = {
  id: 'r-1',
  title: 'Honda CBR 1000 RR SC59 Fireblade',
  price: '7.900 € VB',
  price_eur: 7900,
  location: 'Bayern - Landsberg',
  score: 84,
  fit: { verdict: 'fit' },
  facts: { stickCount: 2, gbPerStick: 16, generation: 'ddr4' },
  details: { Erstzulassung: '03/2009', Kilometerstand: '21.800 km' },
  chips: [
    { text: 'EZ 2009', tone: 'value' },
    { text: '21.800 km', tone: 'value' },
    { text: 'ABS', tone: 'good' },
    { text: 'Unfallschaden', tone: 'bad' },
  ],
};

function expectChips(root: HTMLElement) {
  const values = within(root).getByTestId('chips-values');
  expect(values).toHaveTextContent('EZ 2009');
  expect(values).toHaveTextContent('21.800 km');
  const flags = within(root).getByTestId('chips-flags');
  const good = flags.querySelector('[data-tone=good]')!;
  const bad = flags.querySelector('[data-tone=bad]')!;
  expect(good).toHaveTextContent('✓ABS');
  expect(bad).toHaveTextContent('✗Unfallschaden');
  expect(root.textContent).not.toContain('2×16 GB');
  expect(root.textContent).not.toContain('DDR4');
}

describe('chips from the server', () => {
  it('the row shows them with their tones, values first, and nothing made up from facts', () => {
    const { container } = render(<Row listing={listing} />);
    expectChips(container);
    expect(container.querySelector('.price')).toHaveTextContent('7900 € VB');
    expect(container.querySelector('.price .terms')).toHaveTextContent('VB');
  });

  it('the best find and the sheet show the same chips', () => {
    const hero = render(<FundeBestHero listing={listing} medianPrice={null} tab="fit" isKept={false} onToggleKeep={() => {}} />);
    expectChips(hero.container);
    hero.unmount();
    render(<FundeDetailSheet listing={listing} onClose={() => {}} />);
    expectChips(document.body);
  });

  it('a listing without chips gets no chip line and no invented one', () => {
    const { container } = render(<Row listing={{ ...listing, chips: [] }} />);
    expect(container.querySelector('[data-testid=chips]')).toBeNull();
    expect(container.textContent).not.toContain('EZ 2009');
    expect(container.textContent).not.toContain('2×16 GB');
  });
});
