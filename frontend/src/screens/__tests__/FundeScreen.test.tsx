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
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ total: 0, listings: [] }),
      });
    });

    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} />);

    expect(await screen.findByTestId('surface-empty-line')).toBeInTheDocument();
    expect(screen.getByText('No matches within 30 km')).toBeInTheDocument();
    expect(screen.getByText('50 km')).toBeInTheDocument();
    expect(screen.getByText('100 km')).toBeInTheDocument();
  });

  it('toggles map view when clicking Map pill', async () => {
    render(<FundeScreen campaign={mockCampaign} onBack={vi.fn()} onConfigure={vi.fn()} />);

    const mapPills = await screen.findAllByText('Map');
    fireEvent.click(mapPills[0]);

    expect(await screen.findByTestId('mock-route-corridor-map')).toBeInTheDocument();
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
            schedule_interval: 6,
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
