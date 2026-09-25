import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FundeScreen from '../FundeScreen';
import type { Campaign } from '../../types';

vi.mock('../../components/RouteCorridorMap', () => ({
  default: () => <div data-testid="mock-route-corridor-map" />,
}));

const mockCampaign: Campaign = {
  id: 1,
  name: 'Matratzen',
  route_id: 10,
  family_id: 5,
};

const mockRouteData = {
  route: {
    id: 10,
    campaign_id: 1,
    name: 'Matratzen Jagd',
    base_url: 'https://kleinanzeigen.de/s-matratze/k0',
    origin: 'Landsberg',
    destination: 'Konstanz',
    radius_km: 30,
    half_width_km: 20,
    distance_km: 180,
    duration_min: 120,
    circles: [],
  },
  total: 3,
  listings: [
    {
      id: 'listing-1',
      title: 'Federkern-Matratze Ikea 140x200',
      price: '90 €',
      price_eur: 90,
      location: 'Landsberg am Lech',
      detour_min: 0,
      offroute_km: 0,
      first_seen_at: new Date().toISOString(),
      is_deal: false,
      images: ['https://example.com/matratze.jpg'],
    },
    {
      id: 'listing-2',
      title: 'Novilla Matratzentopper 180x200',
      price: '55 €',
      price_eur: 55,
      location: 'Sigmarszell',
      detour_min: 4,
      offroute_km: 2,
      first_seen_at: new Date(Date.now() - 3600000).toISOString(),
      is_deal: true,
      images: [],
    },
    {
      id: 'listing-3',
      title: 'Gästematratze klappbar 80x200',
      price: '20 €',
      price_eur: 20,
      location: 'Memmingen',
      detour_min: null,
      offroute_km: 15,
      first_seen_at: new Date(Date.now() - 7200000).toISOString(),
      is_deal: false,
      images: [],
    },
  ],
  counts: { total: 3, routed: 2, unplaced: 0 },
};

describe('FundeScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      // A hunt's listings come from its family, corridor or not.
      if (url.includes('/api/search-families/5/listings?view=map')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ total: 3, centre: null, points: mockRouteData.listings.map(l => ({ ...l, lat: 48, lon: 11 })) }),
        });
      }
      if (url.includes('/api/search-families/5/listings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ total: 3, listings: mockRouteData.listings }),
        });
      }
      if (url.includes('/api/search-families/5')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 5,
              name: 'Matratzen',
              terms: [
                { id: 101, term: 'Federkern', label: 'Federkern', enabled: true },
                { id: 102, term: 'Topper', label: 'Topper', enabled: true },
              ],
              radius_diagnosis: {
                current_radius: 30,
                options: [
                  { radius: 50, count: 4 },
                  { radius: 100, count: 18 },
                ],
              },
            }),
        });
      }
      if (url.includes('/api/campaigns/1/route')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRouteData),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ total: 0, listings: [] }),
      });
    });
  });

  it('renders sticky Bar with campaign title and live count', async () => {
    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} />);

    expect(await screen.findByText('Matratzen')).toBeInTheDocument();
    const countEl = await screen.findByTestId('surface-bar-count');
    expect(countEl).toHaveTextContent('3');
  });

  it('renders listings as Row components with hero prices and detour/distance', async () => {
    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} />);

    expect(await screen.findByText('Federkern-Matratze Ikea 140x200')).toBeInTheDocument();
    expect(screen.getByText('Novilla Matratzentopper 180x200')).toBeInTheDocument();
    expect(screen.getByText('90 €')).toBeInTheDocument();
    expect(screen.getByText('55 €')).toBeInTheDocument();

    // Check detour and distance display. The wording follows the interface
    // language -- German says "auf Route" -- so the assertion asks for either
    // rather than pinning the test to one locale.
    expect(screen.getByText(/on route|auf Route/)).toBeInTheDocument();
    expect(screen.getByText('+4m')).toBeInTheDocument();
    expect(screen.getByText('15 km')).toBeInTheDocument();
  });

  it('asks the server for deals rather than filtering the loaded page', async () => {
    // Filtering the fifty rows on screen and reporting that count as the
    // search's size told the buyer a 1,266-listing search held two deals.
    // Filtering has to happen where the counting happens.
    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} />);

    expect(await screen.findByText('Federkern-Matratze Ikea 140x200')).toBeInTheDocument();

    // The toggle moved into the filter sheet: seven controls did not fit across
    // 390 px, and the corridor pill rendered clipped as "rridor".
    fireEvent.click(screen.getAllByText('Filter')[0]);
    fireEvent.click(screen.getByText('Deals only'));

    await waitFor(() => {
      const asked = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .map(c => String(c[0]))
        .some(u => u.includes('dealsOnly=1'));
      expect(asked).toBe(true);
    });
  });

  it('opens detail Sheet when clicking a listing row', async () => {
    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} />);

    const row = await screen.findByText('Federkern-Matratze Ikea 140x200');
    fireEvent.click(row);

    expect(await screen.findByTestId('surface-sheet-panel')).toBeInTheDocument();
    expect(screen.getByTestId('surface-sheet-close')).toBeInTheDocument();
  });

  it('renders EmptyLine when no listings match', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/search-families/5')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 5,
              name: 'Matratzen',
              radius_diagnosis: {
                options: [
                  { radius: 50, count: 4 },
                  { radius: 100, count: 18 },
                ],
              },
            }),
        });
      }
      if (url.includes('/overview')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              campaign_id: 1,
              pots: { all: 0, fit: 0, unclear: 0, no: 0 },
              last_crawled_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
              market: null,
              requirements: [],
              rejections: [],
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ total: 0, listings: [] }),
      });
    });

    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} />);

    // The printer case: a search that ran and found nothing says so, and
    // offers the wider radii that would find something -- not "press fetch".
    expect(await screen.findByText(/Searched .* nothing found/)).toBeInTheDocument();
    expect(screen.getByText('Search 50 km')).toBeInTheDocument();
    expect(screen.getByText('Search 100 km')).toBeInTheDocument();
    expect(screen.getByText('Change search terms')).toBeInTheDocument();
    expect(screen.queryByText(/Fetching listings starts it/)).not.toBeInTheDocument();
  });

  it('an empty match tab in a campaign with listings points to the unclear ones', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/overview')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              campaign_id: 1,
              pots: { all: 4, fit: 0, unclear: 4, no: 0 },
              rejections: [],
              market: null,
              requirements: [],
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ total: 0, listings: [] }),
      });
    });

    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} />);

    expect(await screen.findByText('Nothing matches for certain yet.')).toBeInTheDocument();
    expect(screen.getByText('Show unclear')).toBeInTheDocument();
    expect(screen.queryByText(/within \d+ km/)).not.toBeInTheDocument();
  });

  it('closes the list with a map of every find, without a toggle', async () => {
    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} />);

    expect(await screen.findByTestId('mock-route-corridor-map')).toBeInTheDocument();
    const asked = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map(c => String(c[0]));
    expect(asked.some(u => u.includes('/api/search-families/5/listings?view=map'))).toBe(true);
  });

  it('orders by distance or score on the server, over the whole hunt', async () => {
    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} />);

    fireEvent.click(await screen.findByText('Nearest'));
    fireEvent.click(screen.getByText('Best rated'));
    await waitFor(() => {
      const asked = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .map(c => String(c[0]));
      expect(asked.some(u => u.includes('/listings?') && u.includes('sort=near'))).toBe(true);
      expect(asked.some(u => u.includes('/listings?') && u.includes('sort=score'))).toBe(true);
    });
  });

  it('offers a corridor for a hunt that already runs', async () => {
    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} />);

    fireEvent.click((await screen.findAllByText('Corridor'))[0]);
    expect(await screen.findByText('Search along a route')).toBeInTheDocument();
    expect(screen.getByTestId('corridor-save')).toBeDisabled();
    expect(await screen.findByTestId('corridor-current')).toHaveTextContent('Landsberg → Konstanz');
  });

  it('a shared link opens the find even when it is not in the loaded list', async () => {
    window.location.hash = '#dashboard?campaignId=1&listingId=shared-42';
    const base = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/listings/shared-42')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'shared-42', title: 'Geteilter Fund', price_eur: 99, images: [] }),
        });
      }
      return (base as typeof fetch)(url);
    });
    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} />);
    expect(await screen.findByTestId('listing-number')).toHaveTextContent('shared-42');
    window.location.hash = '';
  });

  it('says a search is running while it runs, not when the last one was', async () => {
    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} isScraping />);
    expect(await screen.findByText('Searching now …')).toBeInTheDocument();
  });

  it('displays real schedule interval in freshness header (#7)', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/campaigns/1/route')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRouteData),
        });
      }
      if (url.includes('/api/campaigns/1/overview')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            // Minutes, as the scheduler reads it (intervalMinutes * 60 * 1000).
            schedule_interval: 360,
            last_crawled_at: new Date(Date.now() - 3600000).toISOString(),
            pots: { all: 3, fit: 2, unclear: 0, no: 1 },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ total: 0, listings: [] }),
      });
    });

    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} />);

    const freshnessEl = await screen.findByTestId('freshness');
    expect(freshnessEl).toHaveTextContent(/searches every 6h|sucht alle 6 Std/);
    expect(freshnessEl).not.toHaveTextContent(/searches hourly|stündlich/);
  });
});
