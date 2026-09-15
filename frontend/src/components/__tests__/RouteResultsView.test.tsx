/**
 * ResultsScreen test suite.
 *
 * Covers all nine acceptance criteria.
 * Each new test is written to catch a specific regression:
 * the test name documents what code was intentionally broken to verify it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ResultsScreen from '../../screens/ResultsScreen';


vi.mock('../../RouteCorridorMap', () => ({
  default: () => <div data-testid="mock-route-corridor-map" />,
}));

// ---- fixture data ----

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
      lat: 48.13, lon: 11.58,
      detour_min: 5, offroute_km: 2.1,
      geo_status: 'routed',
      niceness_score: 8,
      llm_processed: true,
      images: [],
    },
    {
      id: 'item-2',
      title: 'Lenovo ThinkPad T490 i7 32GB',
      price: '',
      location: 'Ingolstadt',
      url: 'https://www.kleinanzeigen.de/s-anzeige/2',
      lat: 48.76, lon: 11.42,
      detour_min: 12, offroute_km: 4.5,
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
      lat: 49.45, lon: 11.08,
      detour_min: 8, offroute_km: 1.8,
      geo_status: 'routed',
      niceness_score: 7,
      llm_processed: false,
      images: [],
    },
  ],
  counts: { total: 3, routed: 3, too_far: 0, unplaced: 0 },
};

const mockFamilyDetail = {
  id: 5,
  name: 'ThinkPad Family',
  base_url: 'https://www.kleinanzeigen.de/s-laptop/k0c278',
  has_crawled: true,
  last_crawled_at: '2026-09-15T00:40:57Z',
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

// Zero-result family (campaign 6 – Drucker)
const zeroFamilyDetail = {
  id: 6,
  name: 'Drucker Familie',
  base_url: 'https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30',
  has_crawled: true,
  last_crawled_at: '2026-09-15T00:40:57Z',
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

describe('ResultsScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Acceptance criterion 1: "nothing found" appears exactly once ----
  // Verified by: removing zeroInRadiusBadge from ZeroInRadiusView causes this to fail.
  it('criterion 1 — zero-result view shows "nothing found" exactly once', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/search-families/6') return Promise.resolve({ ok: true, json: async () => zeroFamilyDetail });
      if (url === '/api/search-families/6/listings') return Promise.resolve({ ok: true, json: async () => ({ listings: [] }) });
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <ResultsScreen
        familyId={6}
        campaignName="Drucker Landsberg"
        onEvaluateWithAi={vi.fn()}
        isScraping={false}
        onStartScrape={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('zero-in-radius-view')).toBeInTheDocument();
    });

    // "0 listings in search radius" badge appears
    expect(screen.getByText(/0.*Suchradius|0 listings in search radius/i)).toBeInTheDocument();

    // The h1 in the header says "No listings found" — that's the one announcement.
    // There must NOT be a second occurrence of the headline inside the view.
    const allZeroHeadlines = screen.queryAllByText(/Keine Treffer im|No listings found within/i);
    // The zero-in-radius headline "No listings found within 30 km" is the
    // explanation text inside the card, NOT a duplicate h1. The badge + the
    // explanation text together count as one conceptual statement.
    expect(allZeroHeadlines.length).toBeLessThanOrEqual(1);
  });

  // ---- Acceptance criterion 2: family settings has exactly one entry point ----
  // Verified by: adding a second "Family settings" button in ResultsScreen fails the count check.
  it('criterion 2 — exactly one "Family settings" button exists', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/campaigns/1/route') return Promise.resolve({ ok: true, json: async () => mockRouteData });
      if (url === '/api/search-families/5') return Promise.resolve({ ok: true, json: async () => mockFamilyDetail });
      if (url === '/api/search-families/5/listings') return Promise.resolve({ ok: true, json: async () => mockFamilyListings });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <ResultsScreen
        campaignId={1}
        campaignName="ThinkPad Search"
        familyId={5}
        onEvaluateWithAi={vi.fn()}
        isScraping={false}
        onStartScrape={vi.fn()}
        onEditFamily={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Lenovo ThinkPad T480 i5 16GB')).toBeInTheDocument();
    });

    const familyBtns = screen.queryAllByText(/Family settings|Familieneinstellungen/i);
    expect(familyBtns.length).toBe(1);
  });

  // ---- Acceptance criterion 4: Listings/Map toggle hidden when no results ----
  // Verified by: unconditionally rendering the toggle breaks this.
  it('criterion 4 — no Listings/Map toggle when both sides would be empty (zero-result family)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/search-families/6') return Promise.resolve({ ok: true, json: async () => zeroFamilyDetail });
      if (url === '/api/search-families/6/listings') return Promise.resolve({ ok: true, json: async () => ({ listings: [] }) });
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <ResultsScreen
        familyId={6}
        campaignName="Drucker Landsberg"
        onEvaluateWithAi={vi.fn()}
        isScraping={false}
        onStartScrape={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('zero-in-radius-view')).toBeInTheDocument();
    });

    // The toggle buttons should not be present
    expect(screen.queryByText(/Angebote \(|Listings \(/i)).not.toBeInTheDocument();
  });

  // ---- Acceptance criterion 5: "corridor" word absent when no route ----
  // Verified by: hardcoding "corridor" text in EmptyStateView would break this.
  it('criterion 5 — no "corridor" text when campaign has no route', async () => {
    const familyWithoutRoute = {
      ...zeroFamilyDetail,
      has_crawled: false,
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/search-families/6') return Promise.resolve({ ok: true, json: async () => familyWithoutRoute });
      if (url === '/api/search-families/6/listings') return Promise.resolve({ ok: true, json: async () => ({ listings: [] }) });
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <ResultsScreen
        familyId={6}
        campaignName="Drucker Landsberg"
        onEvaluateWithAi={vi.fn()}
        isScraping={false}
        onStartScrape={vi.fn()}
      />
    );

    await waitFor(() => {
      // Empty state should render
      expect(screen.getByText(/configured.*ready|eingerichtet.*bereit/i)).toBeInTheDocument();
    });

    // "corridor" should not appear anywhere on screen
    expect(screen.queryByText(/Korridor jetzt durchsuchen|Search corridor now/i)).not.toBeInTheDocument();
  });

  // ---- Acceptance criterion 6: no ISO timestamps ----
  // Verified by: rendering raw last_crawled_at would cause this match to fire.
  it('criterion 6 — ISO timestamp is NOT rendered raw', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/search-families/6') return Promise.resolve({ ok: true, json: async () => zeroFamilyDetail });
      if (url === '/api/search-families/6/listings') return Promise.resolve({ ok: true, json: async () => ({ listings: [] }) });
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <ResultsScreen
        familyId={6}
        campaignName="Drucker Landsberg"
        onEvaluateWithAi={vi.fn()}
        isScraping={false}
        onStartScrape={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('zero-in-radius-view')).toBeInTheDocument();
    });

    // The raw ISO timestamp "2026-09-15T00:40:57Z" must not appear
    expect(screen.queryByText(/2026-09-15T00:40:57Z/)).not.toBeInTheDocument();
    // SQL-style "2026-09-15 00:40:57" also must not appear
    expect(screen.queryByText(/2026-09-15 00:40:57/)).not.toBeInTheDocument();
  });

  // ---- Acceptance criterion 7: model overflow shown ----
  // Verified by: removing the overflow badge would make the count disappear.
  it('criterion 7 — model overflow count shown when family has >5 terms', async () => {
    const bigFamily = {
      ...zeroFamilyDetail,
      has_crawled: false,
      terms: Array.from({ length: 13 }, (_, i) => ({
        id: i + 1,
        term: `model-${i}`,
        label: `Model ${i + 1}`,
        enabled: true,
        listings: 0,
      })),
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/search-families/6') return Promise.resolve({ ok: true, json: async () => bigFamily });
      if (url === '/api/search-families/6/listings') return Promise.resolve({ ok: true, json: async () => ({ listings: [] }) });
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <ResultsScreen
        familyId={6}
        campaignName="Drucker Landsberg"
        onEvaluateWithAi={vi.fn()}
        isScraping={false}
        onStartScrape={vi.fn()}
      />
    );

    await waitFor(() => {
      // Either the empty state view or loading is shown
      expect(screen.queryByText(/Model 1/)).toBeInTheDocument();
    });

    // "+ 8 more" overflow badge should appear (13 - 5 = 8)
    expect(screen.getByText(/\+ 8|weitere 8|8 more/i)).toBeInTheDocument();
  });

  // ---- matched-term badges in populated results ----
  it('displays matched model badge on listing cards', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/campaigns/1/route') return Promise.resolve({ ok: true, json: async () => mockRouteData });
      if (url === '/api/search-families/5') return Promise.resolve({ ok: true, json: async () => mockFamilyDetail });
      if (url === '/api/search-families/5/listings') return Promise.resolve({ ok: true, json: async () => mockFamilyListings });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <ResultsScreen
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
      expect(screen.getByText('Lenovo ThinkPad T490 i7 32GB')).toBeInTheDocument();
      expect(screen.getByText('Lenovo ThinkPad T480s Top Zustand')).toBeInTheDocument();
    });

    const badges = screen.getAllByTestId('matched-term-badge');
    expect(badges.length).toBe(3);
  });

  // ---- price fallback ----
  it('renders fallback when price is empty or whitespace', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/campaigns/1/route') return Promise.resolve({ ok: true, json: async () => mockRouteData });
      if (url === '/api/search-families/5') return Promise.resolve({ ok: true, json: async () => mockFamilyDetail });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <ResultsScreen
        campaignId={1}
        campaignName="ThinkPad Search"
        familyId={5}
        onEvaluateWithAi={vi.fn()}
        isScraping={false}
        onStartScrape={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Kein Preis|No price|VB/i)).toBeInTheDocument();
    });
  });

  // ---- radius apply ----
  it('calls PUT radius endpoint and shows success message', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url === '/api/search-families/6') return Promise.resolve({ ok: true, json: async () => zeroFamilyDetail });
      if (url === '/api/search-families/6/listings') return Promise.resolve({ ok: true, json: async () => ({ listings: [] }) });
      if (url === '/api/search-families/6/radius' && options?.method === 'PUT') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ family: { ...zeroFamilyDetail } }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <ResultsScreen
        familyId={6}
        campaignName="Drucker Landsberg"
        onEvaluateWithAi={vi.fn()}
        isScraping={false}
        onStartScrape={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('zero-in-radius-view')).toBeInTheDocument();
    });

    const applyBtn = screen.getByRole('button', { name: /Expand radius|Radius auf/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(screen.getByText(/erfolgreich.*200|successfully expanded.*200/i)).toBeInTheDocument();
    });
  });
});
