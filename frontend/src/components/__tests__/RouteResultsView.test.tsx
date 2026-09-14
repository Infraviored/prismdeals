import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RouteResultsView from '../RouteResultsView';

vi.mock('../RouteCorridorMap', () => ({
  default: () => <div data-testid="mock-route-corridor-map" />,
}));

const mockRouteData = {
  route: {
    id: 10,
    campaign_id: 1,
    name: 'ThinkPad Search',
    base_url: 'https://www.kleinanzeigen.de/s-laptop/k0c278',
    origin: 'München',
    destination: 'Nürnberg',
    radius_km: 15,
    half_width_km: 20,
    distance_km: 170,
    duration_min: 105,
    circles: [
      { lat: 48.13, lon: 11.58, radius_km: 15, label: 'München' },
      { lat: 49.45, lon: 11.08, radius_km: 15, label: 'Nürnberg' },
    ],
  },
  listings: [
    {
      id: 'item-1',
      title: 'Lenovo ThinkPad T480 i5 16GB',
      price: '250 €',
      location: 'München',
      url: 'https://www.kleinanzeigen.de/s-anzeige/1',
      lat: 48.13,
      lon: 11.58,
      detour_min: 5,
      offroute_km: 2.1,
      geo_status: 'routed',
      niceness_score: 8,
      llm_processed: true,
      images: [],
      matched_terms: [{ id: 101, label: 'ThinkPad T480', term: 'ThinkPad T480' }],
    },
    {
      id: 'item-2',
      title: 'Lenovo ThinkPad T490 i7 32GB',
      price: '', // Missing price to test fallback
      location: 'Ingolstadt',
      url: 'https://www.kleinanzeigen.de/s-anzeige/2',
      lat: 48.76,
      lon: 11.42,
      detour_min: 12,
      offroute_km: 4.5,
      geo_status: 'routed',
      niceness_score: 9,
      llm_processed: false,
      images: [],
      matched_terms: [{ id: 102, label: 'ThinkPad T490', term: 'ThinkPad T490' }],
    },
    {
      id: 'item-3',
      title: 'Lenovo ThinkPad T480s Top Zustand',
      price: '280 €',
      location: 'Nürnberg',
      url: 'https://www.kleinanzeigen.de/s-anzeige/3',
      lat: 49.45,
      lon: 11.08,
      detour_min: 8,
      offroute_km: 1.8,
      geo_status: 'routed',
      niceness_score: 7,
      llm_processed: false,
      images: [],
      matched_terms: [{ id: 101, label: 'ThinkPad T480', term: 'ThinkPad T480' }],
    },
  ],
  counts: {
    total: 3,
    routed: 3,
    too_far: 0,
    unplaced: 0,
  },
};

const mockFamilyDetail = {
  id: 5,
  name: 'ThinkPad Family',
  base_url: 'https://www.kleinanzeigen.de/s-laptop/k0c278',
  terms: [
    { id: 101, term: 'ThinkPad T480', label: 'ThinkPad T480', enabled: true },
    { id: 102, term: 'ThinkPad T490', label: 'ThinkPad T490', enabled: true },
  ],
};

describe('RouteResultsView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('displays matched model badge on listing cards', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/campaigns/1/route') {
        return Promise.resolve({ ok: true, json: async () => mockRouteData });
      }
      if (url === '/api/search-families/5') {
        return Promise.resolve({ ok: true, json: async () => mockFamilyDetail });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <RouteResultsView
        campaignId={1}
        campaignName="ThinkPad Search"
        familyId={5}
        onEvaluateWithAi={vi.fn()}
        isScraping={false}
        onStartScrape={vi.fn()}
      />
    );

    // Wait for listings to be displayed
    await waitFor(() => {
      expect(screen.getByText('Lenovo ThinkPad T480 i5 16GB')).toBeInTheDocument();
      expect(screen.getByText('Lenovo ThinkPad T490 i7 32GB')).toBeInTheDocument();
      expect(screen.getByText('Lenovo ThinkPad T480s Top Zustand')).toBeInTheDocument();
    });

    // Check that matched model badges are present on the cards
    const badges = screen.getAllByTestId('matched-term-badge');
    expect(badges.length).toBe(3);
    const badgeTexts = badges.map((b) => b.textContent);
    expect(badgeTexts).toEqual(['ThinkPad T480', 'ThinkPad T480', 'ThinkPad T490']);
  });

  it('renders model filter switches with hit counts and filters listings', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/campaigns/1/route') {
        return Promise.resolve({ ok: true, json: async () => mockRouteData });
      }
      if (url === '/api/search-families/5') {
        return Promise.resolve({ ok: true, json: async () => mockFamilyDetail });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <RouteResultsView
        campaignId={1}
        campaignName="ThinkPad Search"
        familyId={5}
        onEvaluateWithAi={vi.fn()}
        isScraping={false}
        onStartScrape={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Lenovo ThinkPad T480 i5 16GB')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /(Alle|All) (Modelle|models) \(3\)/i })).toBeInTheDocument();
      expect(screen.getByText('(2)')).toBeInTheDocument();
      expect(screen.getByText('(1)')).toBeInTheDocument();
    });

    // Initially all 3 listings are shown
    expect(screen.getByText('Lenovo ThinkPad T480 i5 16GB')).toBeInTheDocument();
    expect(screen.getByText('Lenovo ThinkPad T490 i7 32GB')).toBeInTheDocument();
    expect(screen.getByText('Lenovo ThinkPad T480s Top Zustand')).toBeInTheDocument();

    // Click T480 filter chip to toggle it off
    const t480Chip = screen.getByRole('button', { name: /ThinkPad T480/i });
    fireEvent.click(t480Chip);

    // Now only T490 should remain visible
    await waitFor(() => {
      expect(screen.queryByText('Lenovo ThinkPad T480 i5 16GB')).not.toBeInTheDocument();
      expect(screen.queryByText('Lenovo ThinkPad T480s Top Zustand')).not.toBeInTheDocument();
      expect(screen.getByText('Lenovo ThinkPad T490 i7 32GB')).toBeInTheDocument();
    });

    // Click "Alle Modelle" button to toggle all back on
    const allButton = screen.getByRole('button', { name: /(Alle|All) (Modelle|models)/i });
    fireEvent.click(allButton);

    await waitFor(() => {
      expect(screen.getByText('Lenovo ThinkPad T480 i5 16GB')).toBeInTheDocument();
      expect(screen.getByText('Lenovo ThinkPad T490 i7 32GB')).toBeInTheDocument();
      expect(screen.getByText('Lenovo ThinkPad T480s Top Zustand')).toBeInTheDocument();
    });
  });

  it('renders fallback when price is empty or whitespace', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/campaigns/1/route') {
        return Promise.resolve({ ok: true, json: async () => mockRouteData });
      }
      if (url === '/api/search-families/5') {
        return Promise.resolve({ ok: true, json: async () => mockFamilyDetail });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <RouteResultsView
        campaignId={1}
        campaignName="ThinkPad Search"
        familyId={5}
        onEvaluateWithAi={vi.fn()}
        isScraping={false}
        onStartScrape={vi.fn()}
      />
    );

    // Item 2 has empty price, should show fallback
    await waitFor(() => {
      expect(screen.getByText(/Kein Preis|No price|VB/i)).toBeInTheDocument();
    });
  });
});
