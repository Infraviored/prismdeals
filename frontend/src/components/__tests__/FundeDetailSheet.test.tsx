import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FundeDetailSheet } from '../../screens/FundeDetailSheet';
import type { RowListing } from '../surface';

const mockListing: RowListing = {
  id: 'listing-101',
  title: 'Federkern-Matratze Ikea Vestmarka 140x200x15cm',
  price: '90 €',
  price_eur: 90,
  price_delta_eur: 35,
  location: 'Bayern - Landsberg (Lech)',
  detour_min: 12,
  images: [
    'https://example.com/photo1.jpg',
    'https://example.com/photo2.jpg',
    'https://example.com/photo3.jpg',
  ],
  description: 'Guter Zustand, kaum benutzt, tierfreier Nichtraucherhaushalt.',
  url: 'https://kleinanzeigen.de/s-anzeige/12345678',
  is_deal: true,
  summary: 'Ausgezeichneter Zustand, 28% unter üblichem Marktwert.',
  niceness_score: 92,
};

describe('FundeDetailSheet', () => {
  it('renders hero price and reference distance signal', () => {
    render(<FundeDetailSheet listing={mockListing} onClose={vi.fn()} />);

    const priceEl = screen.getByTestId('detail-price');
    expect(priceEl).toHaveTextContent('90 €');
    expect(priceEl.className).toContain('text-3xl');
    expect(priceEl.className).toContain('font-bold');

    // Reference distance is displayed in coral
    const refDiffEl = screen.getByText('35 € below reference');
    expect(refDiffEl).toBeInTheDocument();
    expect(refDiffEl.className).toContain('text-[#E87967]');
  });

  it('formats location by stripping federal state prefix and shows detour', () => {
    render(<FundeDetailSheet listing={mockListing} onClose={vi.fn()} />);

    expect(screen.getByText('Landsberg (Lech)')).toBeInTheDocument();
    expect(screen.queryByText('Bayern - Landsberg (Lech)')).not.toBeInTheDocument();
    expect(screen.getByText('12 min detour')).toBeInTheDocument();
  });

  it('renders swipable image gallery with photo counter and navigation', () => {
    render(<FundeDetailSheet listing={mockListing} onClose={vi.fn()} />);

    expect(screen.getByText('Photo 1 / 3')).toBeInTheDocument();
    const nextBtn = screen.getByLabelText('Next photo');
    fireEvent.click(nextBtn);

    expect(screen.getByText('Photo 2 / 3')).toBeInTheDocument();
  });

  it('renders single primary action button to open in Kleinanzeigen with <= 4 buttons total', () => {
    render(<FundeDetailSheet listing={mockListing} onClose={vi.fn()} />);

    const openLink = screen.getByText('Open on Kleinanzeigen');
    expect(openLink.closest('a')).toHaveAttribute('href', mockListing.url);

    // Count all buttons in the sheet: close button (1), prev (1), next (1) -> 3 buttons
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeLessThanOrEqual(4);
  });

  it('renders 1-line AI rating when present and omits without gaps when absent', () => {
    const { rerender } = render(<FundeDetailSheet listing={mockListing} onClose={vi.fn()} />);
    expect(screen.getByText('Ausgezeichneter Zustand, 28% unter üblichem Marktwert.')).toBeInTheDocument();
    expect(screen.getByText('92/100')).toBeInTheDocument();

    const noAiListing: RowListing = {
      ...mockListing,
      summary: null,
      niceness_score: null,
      reference_comparison: null,
    };
    rerender(<FundeDetailSheet listing={noAiListing} onClose={vi.fn()} />);
    expect(screen.queryByText('/100')).not.toBeInTheDocument();
  });
});
