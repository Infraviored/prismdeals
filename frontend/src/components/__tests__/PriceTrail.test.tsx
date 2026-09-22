import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PriceTrail } from '../surface/PriceTrail';

const at = (price: number, day: number) => ({
  price_eur: price,
  seen_at: `2026-09-${String(day).padStart(2, '0')}T00:00:00Z`,
});

describe('PriceTrail', () => {
  it('draws nothing for a price that never moved', () => {
    // A flat line would claim a history the listing does not have.
    const { container } = render(<PriceTrail history={[at(130, 1)]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('draws the line once there are two prices', () => {
    const { container } = render(<PriceTrail history={[at(130, 1), at(100, 8)]} />);
    const path = container.querySelector('path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('d')).toMatch(/^M/);
  });

  it('marks a falling price differently from a rising one', () => {
    const fell = render(<PriceTrail history={[at(130, 1), at(100, 8)]} />);
    const rose = render(<PriceTrail history={[at(100, 1), at(130, 8)]} />);
    expect(fell.container.querySelector('path')?.getAttribute('stroke')).toBe('#10B981');
    expect(rose.container.querySelector('path')?.getAttribute('stroke')).not.toBe('#10B981');
  });

  it('shows the market as a line to beat', () => {
    const { container } = render(
      <PriceTrail history={[at(130, 1), at(100, 8)]} reference={150} />
    );
    expect(container.querySelector('line')).not.toBeNull();
  });

  it('keeps the reference inside the drawing when it sits outside the prices', () => {
    // A market far above every price would otherwise be drawn off the top of
    // a 16px box and simply not appear.
    const { container } = render(
      <PriceTrail history={[at(100, 1), at(90, 8)]} reference={300} height={16} />
    );
    const y = Number(container.querySelector('line')?.getAttribute('y1'));
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(16);
  });

  it('ignores points with no price rather than drawing them as zero', () => {
    const { container } = render(
      <PriceTrail history={[at(130, 1), { price_eur: null, seen_at: '2026-09-05T00:00:00Z' }]} />
    );
    expect(container.querySelector('svg')).toBeNull();
  });
});
