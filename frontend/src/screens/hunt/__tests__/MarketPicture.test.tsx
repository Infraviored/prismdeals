import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MarketPicture from '../MarketPicture';
import type { MarketPicture as MarketPictureType, ProbeRung } from '../../../types';

describe('MarketPicture', () => {
  const mockRungs: ProbeRung[] = [
    {
      term: 'oled-laptop',
      label: 'oled laptop',
      source: 'seed',
      total: 60,
      sampled: 25,
      likely: 45,
      unclear: 5,
      no: 10,
      new_likely: 45,
      gain: 0.75,
      overlap: 0.0,
      likely_share: 0.75,
      kept: true,
      prices: [650, 750],
    },
    {
      term: 'oled-32gb',
      label: 'oled 32gb',
      source: 'seed',
      total: 18,
      sampled: 18,
      likely: 12,
      unclear: 2,
      no: 4,
      new_likely: 12,
      gain: 0.67,
      overlap: 0.3,
      likely_share: 0.67,
      kept: true,
      prices: [780],
    },
    {
      term: 'too-wide',
      label: 'too wide',
      source: 'broaden',
      total: 500,
      sampled: 20,
      likely: 1,
      unclear: 0,
      no: 19,
      new_likely: 0,
      gain: 0.0,
      overlap: 0.95,
      likely_share: 0.002,
      kept: false,
      prices: [],
    },
  ];

  const mockMarketPicture: MarketPictureType = {
    rungs: mockRungs,
    chosen_terms: ['oled laptop', 'oled 32gb'],
    estimate: {
      union_likely: 57,
      union_unclear: 7,
      median_price: 740,
    },
    per_budget: [
      { max: 500, likely: 2 },
      { max: 800, likely: 11 },
      { max: 1000, likely: 19 },
    ],
    relax: [
      { must: 'ram>=32', label: '32 GB', likely_without: 23 },
    ],
    models_seen: [{ name: 'ZenBook 14', count: 9, median: 720 }],
    requests: 6,
    seconds: 4.8,
    partial: false,
  };

  it('renders hero numbers for likely count and median price', () => {
    render(
      <MarketPicture
        isProbing={false}
        rungs={mockRungs}
        marketPicture={mockMarketPicture}
        error={null}
        selectedBudgetMax={null}
        effectiveLikelyCount={57}
        relaxedMusts={new Set()}
        onRelaxMust={vi.fn()}
        onSelectBudget={vi.fn()}
      />
    );

    expect(screen.getByTestId('market-hero-likely-count')).toHaveTextContent('57');
    expect(screen.getByTestId('market-hero-median-price')).toHaveTextContent('740 €');
  });

  it('renders 1-line rung rows with hits and likely count', () => {
    render(
      <MarketPicture
        isProbing={false}
        rungs={mockRungs}
        marketPicture={mockMarketPicture}
        error={null}
        selectedBudgetMax={null}
        effectiveLikelyCount={57}
        relaxedMusts={new Set()}
        onRelaxMust={vi.fn()}
        onSelectBudget={vi.fn()}
      />
    );

    // The term as it goes to Kleinanzeigen, not an internal label.
    expect(screen.getByText('oled-laptop')).toBeInTheDocument();
    expect(screen.getByText('oled-32gb')).toBeInTheDocument();
    // A term that added nothing is struck through, not flagged.
    expect(screen.getByText('too-wide').className).toContain('line-through');
    expect(screen.getByTestId('market-rung-row-0')).toHaveTextContent('60 offers · 50 possible');
  });

  it('allows selecting budget thresholds', () => {
    const handleSelectBudget = vi.fn();
    render(
      <MarketPicture
        isProbing={false}
        rungs={mockRungs}
        marketPicture={mockMarketPicture}
        error={null}
        selectedBudgetMax={null}
        effectiveLikelyCount={57}
        relaxedMusts={new Set()}
        onRelaxMust={vi.fn()}
        onSelectBudget={handleSelectBudget}
      />
    );

    const btn500 = screen.getByTestId('market-budget-btn-500');
    fireEvent.click(btn500);

    expect(handleSelectBudget).toHaveBeenCalledWith(500);
  });

  it('allows clicking relax button to trigger relaxation', () => {
    const handleRelax = vi.fn();
    render(
      <MarketPicture
        isProbing={false}
        rungs={mockRungs}
        marketPicture={mockMarketPicture}
        error={null}
        selectedBudgetMax={null}
        effectiveLikelyCount={57}
        relaxedMusts={new Set()}
        onRelaxMust={handleRelax}
        onSelectBudget={vi.fn()}
      />
    );

    const relaxBtn = screen.getByTestId('market-relax-btn-ram>=32');
    fireEvent.click(relaxBtn);

    expect(handleRelax).toHaveBeenCalledWith('ram>=32');
  });

  it('shows what is still open next to what fits, and the usual price without the deal colour', () => {
    render(
      <MarketPicture
        isProbing={false}
        rungs={mockRungs}
        marketPicture={mockMarketPicture}
        error={null}
        selectedBudgetMax={null}
        effectiveLikelyCount={57}
        relaxedMusts={new Set()}
        onRelaxMust={vi.fn()}
        onSelectBudget={vi.fn()}
      />
    );
    expect(screen.getByTestId('market-hero-open-count')).toHaveTextContent('7');
    expect(screen.getByTestId('market-hero-median-price').className).not.toContain('E87967');
  });
});
