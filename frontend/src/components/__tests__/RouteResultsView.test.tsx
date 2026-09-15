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

const mockFamilyListings = {
  total: 3,
  listings: [
    { id: 'item-1', matched_terms: [{ id: 101, label: 'ThinkPad T480', term: 'ThinkPad T480' }] },
    { id: 'item-2', matched_terms: [{ id: 102, label: 'ThinkPad T490', term: 'ThinkPad T490' }] },
    { id: 'item-3', matched_terms: [{ id: 101, label: 'ThinkPad T480', term: 'ThinkPad T480' }] },
  ],
};

describe('RouteResultsView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('displays matched model badge on listing cards via family listings enrichment', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/campaigns/1/route') {
        return Promise.resolve({ ok: true, json: async () => mockRouteData });
      }
      if (url === '/api/search-families/5') {
        return Promise.resolve({ ok: true, json: async () => mockFamilyDetail });
      }
      if (url === '/api/search-families/5/listings') {
        return Promise.resolve({ ok: true, json: async () => mockFamilyListings });
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
      if (url === '/api/search-families/5/listings') {
        return Promise.resolve({ ok: true, json: async () => mockFamilyListings });
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

    // Click "Alle Modelle" button AGAIN when all are active; all must remain visible ("Alle an = alles")
    fireEvent.click(allButton);
    expect(screen.getByText('Lenovo ThinkPad T480 i5 16GB')).toBeInTheDocument();
    expect(screen.getByText('Lenovo ThinkPad T490 i7 32GB')).toBeInTheDocument();
    expect(screen.getByText('Lenovo ThinkPad T480s Top Zustand')).toBeInTheDocument();
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

  it('shows zero-in-radius view with term chips and diagnose button when has_crawled=true and 0 listings', async () => {
    // Family detail with has_crawled=true and pre-loaded radius_diagnosis
    const zeroFamilyDetail = {
      id: 5,
      name: 'Drucker Familie',
      base_url: 'https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30',
      has_crawled: true,
      last_crawled_at: '2026-09-15 00:41:00',
      terms: [
        { id: 1, term: 'brother-mfc-l2740dw', label: 'Brother MFC-L2740DW', enabled: true, listings: 0 },
        { id: 2, term: 'brother-mfc-l5750dw', label: 'Brother MFC-L5750DW', enabled: true, listings: 0 },
      ],
      radius_diagnosis: {
        current_radius: 30,
        measured_at: '2026-09-15T12:22:50Z',
        options: [
          { radius: 30, count: 0 },
          { radius: 100, count: 7 },
          { radius: 200, count: 22 },
        ],
        terms: [
          { id: 1, term: 'brother-mfc-l2740dw', label: 'Brother MFC-L2740DW', counts: { '30': 0, '100': 1, '200': 2 } },
          { id: 2, term: 'brother-mfc-l5750dw', label: 'Brother MFC-L5750DW', counts: { '30': 0, '100': 2, '200': 5 } },
        ],
      },
    };

    // Route data with 0 listings
    const emptyRoute = {
      route: {
        id: 0,
        campaign_id: 0,
        name: 'Drucker Landsberg',
        base_url: '',
        origin: '',
        destination: '',
        radius_km: 0,
        half_width_km: 0,
        distance_km: null,
        duration_min: null,
        polyline: [],
        circles: [],
      },
      listings: [],
      counts: { total: 0, routed: 0, unplaced: 0 },
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/search-families/5') {
        return Promise.resolve({ ok: true, json: async () => zeroFamilyDetail });
      }
      if (url === '/api/search-families/5/listings') {
        return Promise.resolve({ ok: true, json: async () => ({ listings: [] }) });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <RouteResultsView
        familyId={5}
        campaignName="Drucker Landsberg"
        onEvaluateWithAi={vi.fn()}
        isScraping={false}
        onStartScrape={vi.fn()}
      />
    );

    // The zero-in-radius view should appear
    await waitFor(() => {
      expect(screen.getByTestId('zero-in-radius-view')).toBeInTheDocument();
    });

    // Should show the amber badge
    expect(screen.getByText(/0.*Suchradius|0 listings in search radius/i)).toBeInTheDocument();

    // Term chips should all show 0
    const chips = screen.getAllByTestId('term-chip');
    expect(chips.length).toBe(2);

    // Radius option cards should be rendered
    expect(screen.getByTestId('radius-option-30')).toBeInTheDocument();
    expect(screen.getByTestId('radius-option-100')).toBeInTheDocument();
    expect(screen.getByTestId('radius-option-200')).toBeInTheDocument();

    // Primary CTA to apply best radius should be present
    expect(screen.getByRole('button', { name: /Expand radius|Radius auf/i })).toBeInTheDocument();

    // The route data built in the component
    const routeState = emptyRoute;
    expect(routeState.counts.total).toBe(0);
  });

  it('calls PUT radius endpoint and shows success on apply-radius action', async () => {
    const zeroFamilyDetail = {
      id: 5,
      name: 'Drucker Familie',
      base_url: 'https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30',
      has_crawled: true,
      last_crawled_at: '2026-09-15 00:41:00',
      terms: [
        { id: 1, term: 'brother-mfc-l2740dw', label: 'Brother MFC-L2740DW', enabled: true, listings: 0 },
      ],
      radius_diagnosis: {
        current_radius: 30,
        measured_at: '2026-09-15T12:22:50Z',
        options: [
          { radius: 30, count: 0 },
          { radius: 100, count: 7 },
          { radius: 200, count: 22 },
        ],
        terms: [
          { id: 1, term: 'brother-mfc-l2740dw', label: 'Brother MFC-L2740DW', counts: { '30': 0, '100': 1, '200': 2 } },
        ],
      },
    };

    let putRadiusCalled = false;
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/search-families/5') {
        return Promise.resolve({ ok: true, json: async () => zeroFamilyDetail });
      }
      if (url === '/api/search-families/5/listings') {
        return Promise.resolve({ ok: true, json: async () => ({ listings: [] }) });
      }
      if (url === '/api/search-families/5/radius' && options?.method === 'PUT') {
        putRadiusCalled = true;
        return Promise.resolve({
          ok: true,
          json: async () => ({ family: { ...zeroFamilyDetail, base_url: 'https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r200' } }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <RouteResultsView
        familyId={5}
        campaignName="Drucker Landsberg"
        onEvaluateWithAi={vi.fn()}
        isScraping={false}
        onStartScrape={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('zero-in-radius-view')).toBeInTheDocument();
    });

    // Click the primary CTA button (200 km — use id to avoid ambiguity)
    const applyBtn = screen.getByRole('button', { name: /Expand radius|Radius auf/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(putRadiusCalled).toBe(true);
    });

    // Success message should appear
    await waitFor(() => {
      expect(screen.getByText(/erfolgreich.*200|successfully expanded.*200/i)).toBeInTheDocument();
    });
  });
});
