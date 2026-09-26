/* eslint-disable no-restricted-syntax */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Bar, Row, Pill, Sheet, EmptyLine } from '../surface';

describe('Surface Components P1', () => {
  describe('Bar component', () => {
    it('renders title, count, and calls onBack when clicked', () => {
      const handleBack = vi.fn();
      render(
        <Bar
          title="Matratze"
          count={107}
          onBack={handleBack}
          actions={<button data-testid="action-btn">Filter</button>}
        />
      );

      expect(screen.getByText('Matratze')).toBeInTheDocument();
      expect(screen.getByTestId('surface-bar-count')).toHaveTextContent('107');
      expect(screen.getByTestId('action-btn')).toBeInTheDocument();

      const backBtn = screen.getByTestId('surface-bar-back');
      fireEvent.click(backBtn);
      expect(handleBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('Row component (edge case resilience)', () => {
    it('renders normal listing with price as hero, detour, and thumbnail', () => {
      const handleClick = vi.fn();
      const listing = {
        id: 'L1',
        title: 'Federkern-Matratze Ikea 140x200',
        price_eur: 90,
        price: '90 €',
        location: 'Landsberg',
        images: ['https://example.com/img.jpg'],
        detour_min: 0,
        first_seen_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      };

      render(<Row listing={listing} onClick={handleClick} />);

      expect(screen.getByText('Federkern-Matratze Ikea 140x200')).toBeInTheDocument();
      expect(screen.getByTestId('listing-price')).toHaveTextContent('90 €');
      // No score, no score line: nothing invented under the price.
      expect(screen.queryByTestId('listing-score')).not.toBeInTheDocument();
      expect(screen.getByText('Landsberg')).toBeInTheDocument();
      // The wording follows the interface language: German says "auf Route".
      expect(screen.getByText(/on route|auf Route/)).toBeInTheDocument();

      const row = screen.getByTestId('listing-row');
      fireEvent.click(row);
      expect(handleClick).toHaveBeenCalledWith(listing);
    });

    it('handles missing location gracefully (198/1266 in dataset)', () => {
      const listing = {
        id: 'L2',
        title: 'Matratze ohne Ortsangabe',
        price_eur: 50,
        price: '50 €',
        location: null,
        detour_min: 5,
        first_seen_at: new Date().toISOString(),
      };

      render(<Row listing={listing} />);
      expect(screen.getByText('Matratze ohne Ortsangabe')).toBeInTheDocument();
      expect(screen.getByTestId('listing-price')).toHaveTextContent('50 €');
      expect(screen.getByText('+5m')).toBeInTheDocument();
    });

    it('handles missing image gracefully (48/1266 in dataset)', () => {
      const listing = {
        id: 'L3',
        title: 'Matratze ohne Foto',
        price_eur: 75,
        price: '75 €',
        location: 'Augsburg',
        images: [],
        detour_min: null,
        offroute_km: 12,
      };

      render(<Row listing={listing} />);
      expect(screen.getByText('Matratze ohne Foto')).toBeInTheDocument();
      expect(screen.getByText('12 km')).toBeInTheDocument();
    });

    it('handles missing price gracefully (19/1266 in dataset)', () => {
      const listing = {
        id: 'L4',
        title: 'Matratze zu verschenken oder VB',
        price_eur: null,
        price: null,
        location: 'Konstanz',
        detour_min: null,
      };

      render(<Row listing={listing} />);
      expect(screen.getByText('Matratze zu verschenken oder VB')).toBeInTheDocument();
      expect(screen.getByTestId('listing-price')).toHaveTextContent('VB');
    });

    it('highlights price in coral accent when isDeal is true', () => {
      const listing = {
        id: 'L5',
        title: 'Super Deal Matratze',
        price_eur: 30,
        price: '30 €',
        location: 'Memmingen',
        is_deal: true,
      };

      render(<Row listing={listing} isDeal={true} />);
      const priceEl = screen.getByTestId('listing-price');
      expect(priceEl).toHaveClass('text-[#E87967]');
    });

    it('highlights stale listings (>7 days) with stale status color', () => {
      const staleDate = new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString();
      const listing = {
        id: 'L6',
        title: 'Alte Anzeige',
        price_eur: 40,
        location: 'Kempten',
        first_seen_at: staleDate,
      };

      render(<Row listing={listing} />);
      const staleEl = screen.getByText(/Tagen|ago/);
      expect(staleEl).toHaveClass('text-[#C9A227]');
    });
  });

  describe('Pill component', () => {
    it('renders inactive and active state with click event and distinct styling', () => {
      const handleClick = vi.fn();
      const { rerender } = render(
        <Pill label="30 km" count={12} active={false} onClick={handleClick} />
      );

      const pill = screen.getByTestId('surface-pill');
      expect(pill).toHaveAttribute('data-active', 'false');
      expect(pill).toHaveClass('border-[#0E4A40]');
      expect(screen.getByTestId('surface-pill-count')).toHaveTextContent('12');

      fireEvent.click(pill);
      expect(handleClick).toHaveBeenCalledTimes(1);

      rerender(<Pill label="30 km" count={12} active={true} />);
      expect(screen.getByTestId('surface-pill')).toHaveAttribute('data-active', 'true');
      expect(screen.getByTestId('surface-pill')).toHaveClass('bg-[#0E4A40]');
      expect(screen.getByTestId('surface-pill')).toHaveClass('border-[#F2F5F4]');
    });
  });

  describe('Sheet component', () => {
    it('renders when isOpen is true and handles close via button and Escape key', () => {
      const handleClose = vi.fn();
      const { rerender } = render(
        <Sheet isOpen={false} onClose={handleClose} title="Detail">
          <div>Sheet Content</div>
        </Sheet>
      );

      expect(screen.queryByText('Sheet Content')).not.toBeInTheDocument();

      rerender(
        <Sheet isOpen={true} onClose={handleClose} title="Detail">
          <div>Sheet Content</div>
        </Sheet>
      );

      expect(screen.getByText('Sheet Content')).toBeInTheDocument();
      expect(screen.getByText('Detail')).toBeInTheDocument();

      const closeBtn = screen.getByTestId('surface-sheet-close');
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(2);
    });

    it('leaves focus alone when the parent re-renders with a new onClose', () => {
      // The app re-renders every two seconds. Moving focus each time threw
      // away a text selection on Android, copy bar and all.
      const sheet = (onClose: () => void) => (
        <Sheet isOpen={true} onClose={onClose} title="Anforderungen">
          <input data-testid="inside" />
        </Sheet>
      );
      const { rerender } = render(sheet(() => {}));
      const input = screen.getByTestId('inside');
      input.focus();
      rerender(sheet(() => {}));
      expect(document.activeElement).toBe(input);

      const latest = vi.fn();
      rerender(sheet(latest));
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(latest).toHaveBeenCalledTimes(1);
    });
  });

  describe('EmptyLine component', () => {
    it('renders a single line message and action pills without Card wrapper', () => {
      render(
        <EmptyLine
          message="Keine Treffer in 30 km"
          actions={<Pill label="100 km" count={6} active={false} />}
        />
      );

      const el = screen.getByTestId('surface-empty-line');
      expect(el).toBeInTheDocument();
      expect(screen.getByText('Keine Treffer in 30 km')).toBeInTheDocument();
      expect(screen.getByText('100 km')).toBeInTheDocument();
    });
  });
});

describe('Row score', () => {
  it('shows the score under the price', () => {
    render(<Row listing={{ id: 's1', title: 'Kit', price_eur: 150, price: '150 €', score: 86.6 }} onClick={() => {}} />);
    expect(screen.getByTestId('listing-score')).toHaveTextContent('87 %');
  });
});

describe('Row keeps rank out of the list', () => {
  it('shows the percent but not the comparison rank', () => {
    render(
      <Row
        listing={{ id: '1', title: 'Corsair', price: '140 €', price_eur: 140, score: 80, rank: 2, rank_of: 12 }}
        onClick={() => {}}
      />
    );
    expect(screen.getByTestId('listing-score')).toHaveTextContent('80');
    expect(screen.queryByText(/12/)).not.toBeInTheDocument();
  });
});
