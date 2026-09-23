import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Row, type RowListing } from '../surface/Row';
import { FundeBestHero } from '../../screens/FundeBestHero';

const nonRamListing: RowListing = {
  id: 'auto-1',
  title: 'VW Golf 7 2.0 TDI',
  price: '12.000 €',
  price_eur: 12000,
  location: 'München',
  fit: {
    verdict: 'fit',
    facts: {
      color: 'schwarz',
      mileage: 85000,
      generation: 'undefined',
      stickCount: undefined,
      gbPerStick: undefined,
    },
  },
};

describe('RAM specs row guarding (#9)', () => {
  it('Row cleanly omits specs row without empty chip or undefined for non-RAM listing', () => {
    const { container } = render(<Row listing={nonRamListing} />);
    const specsEl = container.querySelector('.specs');
    expect(specsEl).toBeNull();
    expect(container.textContent).not.toContain('undefined');
    expect(container.textContent).not.toContain('UNDEFINED');
  });

  it('FundeBestHero cleanly omits specs row without empty chip or undefined for non-RAM listing', () => {
    const { container } = render(
      <FundeBestHero
        listing={nonRamListing}
        medianPrice={13000}
        tab="fit"
        isKept={false}
        onToggleKeep={() => {}}
      />
    );
    const specsEl = container.querySelector('.specs');
    expect(specsEl).toBeNull();
    expect(container.textContent).not.toContain('undefined');
    expect(container.textContent).not.toContain('UNDEFINED');
  });
});
