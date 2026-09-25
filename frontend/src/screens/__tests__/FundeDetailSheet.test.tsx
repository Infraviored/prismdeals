import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FundeDetailSheet } from '../FundeDetailSheet';
import type { RowListing } from '../../components/surface';

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
    const refDiffEl = screen.getByText('35 € below market');
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

  it('keeps its actions small, in the header: open, share (no footer)', () => {
    render(<FundeDetailSheet listing={mockListing} onClose={vi.fn()} />);

    const openLink = screen.getByLabelText('Open on Kleinanzeigen');
    expect(openLink).toHaveAttribute('href', mockListing.url);
    expect(screen.getByLabelText('Share link')).toBeInTheDocument();
    // No text button reading "Open on Kleinanzeigen" pinned under the listing.
    expect(screen.queryByText('Open on Kleinanzeigen')).not.toBeInTheDocument();
  });

  it('explains the score with the hunt conditions the verdict computed', () => {
    const scored: RowListing = {
      ...mockListing,
      score: 42,
      score_parts: {
        score: 42,
        gate: { met: [], violated: [], open: [], factor: 0.75 },
        axes: { identity: 1, value: 0.6, risk: 0.7, procurement: null, fit: null },
      },
      fit: { verdict: 'unclear', reason: 'Takt nicht genannt', states: { '1': 'met', '2': 'open', '3': 'violated' }, target_id: 4 },
      market_median: 150,
      price_eur: 140,
    };
    const conditions = new Map([
      ['1', { id: 1, label: 'Typ', op: 'eq' as const, value: 'DDR4', importance: 'must' as const, text: 'Typ: DDR4' }],
      ['2', { id: 2, label: 'Takt', op: 'min' as const, value: 3200, importance: 'must' as const, text: 'Takt ab 3200' }],
      ['3', { id: 3, label: 'RGB', op: 'present' as const, value: null, importance: 'wish' as const, text: 'RGB' }],
    ]);
    render(<FundeDetailSheet listing={scored} onClose={vi.fn()} conditions={conditions} />);
    const box = screen.getByTestId('score-breakdown');
    expect(box).toHaveTextContent('42 %');
    expect(box).toHaveTextContent('Takt nicht genannt');
    expect(box).toHaveTextContent('? Takt ab 3200: not stated');
    expect(box).toHaveTextContent('✓ Typ: DDR4');
    expect(box).toHaveTextContent('✗');
  });

  it('renders belowReference in neutral asche (#8FA6A1) without coral or data-price-signal when not a deal (#5)', () => {
    const nonDealListing: RowListing = {
      ...mockListing,
      is_deal: false,
      price_delta_eur: 5,
    };
    render(<FundeDetailSheet listing={nonDealListing} onClose={vi.fn()} />);
    const deltaEl = screen.getByText('5 € below market');
    expect(deltaEl).toBeInTheDocument();
    expect(deltaEl.className).toContain('text-[#8FA6A1]');
    expect(deltaEl.className).not.toContain('text-[#E87967]');
    expect(deltaEl).not.toHaveAttribute('data-price-signal');
  });

  it('explains the comparison rank and lists seller questions to copy', () => {
    render(
      <FundeDetailSheet
        listing={{
          ...mockListing,
          rank: 1,
          rank_of: 12,
          rank_reason: 'Alle Angaben vollständig',
          same_as: [5, 4],
          seller_questions: ['Ist ein Test vor Ort möglich?'],
        }}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Rank 1 of 12 in the comparison')).toBeInTheDocument();
    expect(screen.getByText('Similar to rank 5, 4')).toBeInTheDocument();
    expect(screen.getByText('Ist ein Test vor Ort möglich?')).toBeInTheDocument();
  });
});
