import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FundeAside, type CampaignOverviewData } from '../FundeAside';
import type { RowListing } from '../../components/surface/Row';

const mockOverview: CampaignOverviewData = {
  campaign_id: 1,
  campaign_name: 'Test Campaign',
  pots: { all: 10, fit: 8, unclear: 1, no: 1 },
  rejections: [{ reason: 'Too expensive', count: 1 }],
  market: {
    median: 120,
    deal_threshold: 80,
    cheapest: 60,
    min: 50,
    max: 200,
    count: 10,
    bins: [
      { min: 50, max: 100, count: 4, label: '50–100 €' },
      { min: 101, max: 200, count: 6, label: '101–200 €' },
    ],
  },
  requirements: [],
};

const mockBestListing: RowListing = {
  id: 'best-1',
  title: 'Great Deal',
  price_eur: 60,
  is_deal: true,
  location: 'Bayern - Augsburg',
};

describe('FundeAside (#8 & #9)', () => {
  it('renders translated aria-labels and lead text without hardcoded German strings', () => {
    render(<FundeAside overview={mockOverview} bestListing={mockBestListing} />);

    // In default English translation context:
    // Aside aria-label should be translated ("Market and requirements")
    const aside = screen.getByLabelText('Market and requirements');
    expect(aside).toBeInTheDocument();

    // Histogram aria-label should be translated ("Price distribution from ...")
    const hist = screen.getByRole('img');
    expect(hist).toHaveAttribute('aria-label', expect.stringContaining('Price distribution from 50 € to 200 €, median 120 €'));

    // Fallback lead should be translated
    expect(screen.getByText(/10 listings on the market/)).toBeInTheDocument();
  });

  it('says nothing about a market that has no priced listing', () => {
    // A campaign that has found nothing yet used to read "0 listings on the
    // market with a median of 0 €".
    const empty: CampaignOverviewData = {
      ...mockOverview,
      pots: { all: 0, fit: 0, unclear: 0, no: 0 },
      market: { ...mockOverview.market!, count: 0, median: 0, min: 0, max: 0, bins: [] },
    };
    const { container } = render(<FundeAside overview={empty} bestListing={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
