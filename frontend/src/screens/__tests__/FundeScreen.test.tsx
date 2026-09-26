import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FundeScreen from '../FundeScreen';
import { mockApi } from '../../test/mockApi';
import { huntDoc, listing, overview, page } from '../../test/huntFixtures';

vi.mock('../../components/RouteCorridorMap', () => ({
  default: (p: { listings: unknown[] }) => <div data-testid="mock-map">{p.listings.length}</div>,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

function api(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/hunts/11': huntDoc(),
    'GET /api/hunts/11/overview': overview(),
    'GET /api/hunts/11/listings': (_: unknown, url: string) => {
      const verdict = new URLSearchParams(url.split('?')[1]).get('verdict');
      const all = [listing('a', 'fit'), listing('b', 'fit', { price_eur: 8000 }), listing('c', 'unclear'), listing('d', 'no')];
      return page(all.filter((l) => !verdict || l.fit.verdict === verdict), { all: 4, fit: 2, unclear: 1, no: 1 });
    },
    'GET /api/kept': { ids: [] },
    ...extra,
  });
}

const screenFor = () => render(<FundeScreen huntId={11} onBack={vi.fn()} onConfigure={vi.fn()} onStartScrape={vi.fn()} />);

describe('FundeScreen', () => {
  it('reads the hunt: name, tabs from the counts, the best fit and the rest', async () => {
    api();
    screenFor();
    expect(await screen.findByRole('heading', { name: 'Supersportler' })).toBeInTheDocument();
    const tabs = screen.getByRole('tablist');
    await waitFor(() => expect(tabs.querySelector('[data-tab=fit]')).toHaveTextContent('2'));
    expect(tabs).toHaveTextContent('Unclear 1');
    expect(tabs).toHaveTextContent('All 4');
    await waitFor(() => expect(screen.getAllByTestId('listing-row')).toHaveLength(1));
    expect(document.getElementById('best')).toHaveTextContent('Yamaha R1 a');
    expect(screen.getByTestId('mock-map')).toHaveTextContent('2');
  });

  it('asks the server for a tab and shows why an offer is unclear or out', async () => {
    const { calls } = api();
    screenFor();
    await screen.findAllByTestId('listing-row');
    fireEvent.click(document.querySelector('[data-tab=unclear]')!);
    expect(await screen.findByText('Modell nicht erkannt')).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('verdict=unclear'))).toBe(true);
    fireEvent.click(document.querySelector('[data-tab=no]')!);
    expect(await screen.findByText('Anderes Modell: Yamaha R1 RN12')).toBeInTheDocument();
  });

  it('filters by one of the hunt targets', async () => {
    const { calls } = api();
    screenFor();
    await screen.findAllByTestId('listing-row');
    fireEvent.click(screen.getByTestId('targets-btn'));
    fireEvent.click(await screen.findByRole('button', { name: 'Yamaha R1 RN19' }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('target=168'))).toBe(true));
    expect(screen.getByTestId('target-filter')).toHaveTextContent('Only Yamaha R1 RN19');
    fireEvent.click(within(screen.getByTestId('target-filter')).getByRole('button'));
    await waitFor(() => expect(screen.queryByTestId('target-filter')).not.toBeInTheDocument());
  });

  it('orders on the server and offers the corridor of the hunt family', async () => {
    const { calls } = api();
    screenFor();
    await screen.findAllByTestId('listing-row');
    fireEvent.click(screen.getByRole('button', { name: /best/i, pressed: false }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('sort=score'))).toBe(true));
    expect(screen.getAllByText('Corridor').length).toBeGreaterThan(0);
  });

  it('points an empty fit tab to the unclear offers', async () => {
    mockApi({
      'GET /api/hunts/11': huntDoc(),
      'GET /api/hunts/11/overview': overview(),
      'GET /api/hunts/11/listings': page([], { all: 2, fit: 0, unclear: 2, no: 0 }),
    });
    screenFor();
    expect(await screen.findByText('Nothing matches for certain yet.')).toBeInTheDocument();
  });

  describe('widening the radius of a search that found nothing', () => {
    const empty = (put: unknown) =>
      mockApi({
        'GET /api/hunts/11': huntDoc(),
        'GET /api/hunts/11/overview': { ...overview(), pots: { all: 0, fit: 0, unclear: 0, no: 0 } },
        'GET /api/hunts/11/listings': page([], { all: 0, fit: 0, unclear: 0, no: 0 }),
        'GET /api/kept': { ids: [] },
        'POST /api/search-families/8/diagnose-radius': { current_radius: 200, measured_at: '', options: [{ radius: 300, count: 5 }], terms: [] },
        'PUT /api/hunts/11': put,
      });

    it('saves once however often it is clicked, and says why it failed', async () => {
      const { calls } = empty({ status: 400, body: { error: 'Ort unbekannt' } });
      screenFor();
      const pill = await screen.findByRole('button', { name: /Search 300 km/ });
      fireEvent.click(pill);
      fireEvent.click(pill);
      expect(await screen.findByTestId('hunt-error')).toHaveTextContent('Ort unbekannt');
      expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    });

    it('reads the offers again, their conditions have new ids, and crawls when the server says so', async () => {
      const onStartScrape = vi.fn();
      const { calls } = empty((b: unknown) => ({ ...(b as object), crawl_changed: true }));
      render(<FundeScreen huntId={11} onBack={vi.fn()} onConfigure={vi.fn()} onStartScrape={onStartScrape} />);
      fireEvent.click(await screen.findByRole('button', { name: /Search 300 km/ }));
      const reads = calls.filter((c) => c.url.startsWith('/api/hunts/11/listings')).length;
      await waitFor(() => expect(onStartScrape).toHaveBeenCalledTimes(1));
      expect((calls.find((c) => c.method === 'PUT')!.body as { frame: { radius_km: number } }).frame.radius_km).toBe(300);
      await waitFor(() => expect(calls.filter((c) => c.url.startsWith('/api/hunts/11/listings')).length).toBeGreaterThan(reads));
    });
  });

  describe('the features the offers differ in', () => {
    const signals = {
      node: { id: 176, name: 'Honda CBR 1000 RR SC59' },
      signals: [
        { attr_id: 'track', label: 'Rennstrecke', type: 'boolean', polarity: 'minus', default_weight: -2, found: 9, total: 81, in_hunt: false },
        { attr_id: 'ez', label: 'Erstzulassung', type: 'number', polarity: 'value', default_weight: 0, found: 70, total: 81, in_hunt: false },
        { attr_id: 'abs', label: 'ABS', type: 'boolean', polarity: 'plus', default_weight: 2, found: 30, total: 81, in_hunt: true },
      ],
    };

    it('lists them with how often, and one tap adds a yes/no one as a weighted wish', async () => {
      const { calls } = api({
        'GET /api/hunts/11/signals': signals,
        'PUT /api/hunts/11': (b: unknown) => ({ ...(b as object), crawl_changed: false }),
      });
      screenFor();
      await screen.findAllByTestId('listing-row');
      fireEvent.click(screen.getByTestId('signals-btn'));
      const rows = await screen.findAllByTestId('signal-row');
      expect(rows[0]).toHaveTextContent('Rennstrecke · 9 of 81');
      expect(rows[0]).toHaveTextContent('bothers');
      expect(rows[1]).toHaveTextContent('shown in the list');
      expect(within(rows[1]).queryByRole('button')).toBeNull();
      expect(rows[2]).toHaveTextContent('in the search');
      const reads = calls.filter((c) => c.url.startsWith('/api/hunts/11/listings')).length;
      fireEvent.click(within(rows[0]).getByRole('button', { name: 'Add Rennstrecke as a wish' }));
      await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
      const put = calls.find((c) => c.method === 'PUT')!.body as { conditions: unknown[] };
      expect(put.conditions).toContainEqual({ attr_id: 'track', label: 'Rennstrecke', op: 'present', value: null, importance: 'wish', weight: -2 });
      await waitFor(() => expect(calls.filter((c) => c.url.startsWith('/api/hunts/11/listings')).length).toBeGreaterThan(reads));
      await waitFor(() => expect(calls.filter((c) => c.url === '/api/hunts/11/signals').length).toBe(2));
    });

    it('says when proposals will come', async () => {
      api({ 'GET /api/hunts/11/signals': { node: null, signals: [] } });
      screenFor();
      await screen.findAllByTestId('listing-row');
      fireEvent.click(screen.getByTestId('signals-btn'));
      expect(await screen.findByTestId('signals-empty')).toHaveTextContent('Suggestions come after the first fetch (from 20 finds).');
    });
  });
});
