import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditScreen from '../EditScreen';
import type { Campaign } from '../../types';

const mockCampaign: Campaign = {
  id: 1,
  name: 'Drucker',
  family_id: 10,
};

describe('EditScreen', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/search-families/10') && (!options || options.method === 'GET')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 10,
              name: 'Drucker',
              base_url: 'https://www.kleinanzeigen.de/s-drucker/landsberg-am-lech/anzeige:angebote/preis::150/r30/k0l7437',
              terms: [
                { id: 1, term: 'brother-hl-l2350dw', label: 'Brother HL-L2350DW', enabled: true, listings: 12, fit_listings: 3 },
                { id: 2, term: 'hp-m428', label: 'HP M428', enabled: true },
              ],
            }),
        });
      }
      if (url.includes('/api/locations/resolve')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ location_id: 7437, display_name: 'Landsberg am Lech' }),
        });
      }
      if (url.includes('/api/places/suggest')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              places: [
                { name: 'Landsberg am Lech', postal_code: '86899', latitude: 48.05, longitude: 10.87 },
              ],
            }),
        });
      }
      if (url.includes('/api/search-families') && (options?.method === 'PUT' || options?.method === 'POST')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 10, searches: 2, conflicts: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('renders the 5 fields without Card containers', async () => {
    render(<EditScreen campaign={mockCampaign} onBack={vi.fn()} />);

    // Sticky header Bar (48px)
    expect(await screen.findByText(/Drucker/i)).toBeInTheDocument();
    expect(screen.getByText(/Save|Speichern/i)).toBeInTheDocument();

    // 1. Was / What -- the label of the field, not any text that contains the
    //    word: a loose matcher here caught the requirements button too.
    expect(screen.getByText(/^(Was|What)$/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Drucker')).toBeInTheDocument();
    expect(await screen.findByText('Brother HL-L2350DW')).toBeInTheDocument();
    expect(screen.getByText('HP M428')).toBeInTheDocument();

    // 2. Wo / Where
    expect(screen.getByText(/^(Wo|Where)$/i)).toBeInTheDocument();

    // 3. Wie weit / How far -- a slider and a typed number, not four presets.
    //    10, 30, 50 and 100 km are not the distances people live at: Landsberg
    //    to Augsburg is 38, to Munich 57.
    //    And no limit until one is chosen: a preset 30 km was a limit nobody set.
    expect(screen.getByText(/^(Wie weit|How far)$/i)).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: /No limit|Ohne Grenze/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Limit radius|Umkreis begrenzen/ }));
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('max', '200');
    expect(slider).toHaveValue('50');
    expect(screen.getByText('km')).toBeInTheDocument();

    // 4. Bis wie viel / Up to how much (Price)
    expect(screen.getByText(/BIS WIE VIEL|UP TO HOW MUCH/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('150')).toBeInTheDocument();

    // 5. Anforderungen -- what the site cannot filter on. Without a way in,
    //    Evaluate answered "set your requirements first" and there was nowhere
    //    in the whole app to set them.
    expect(screen.getByText(/^(Anforderungen|Requirements)$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/jenseits von Preis und Ort|beyond price and place/i)
    ).toBeInTheDocument();

    // Delete link at bottom
    expect(screen.getByText(/Suche löschen|Delete search/i)).toBeInTheDocument();
  });

  it('proves zero writes or scraper runs when typing (Tippen ist Tippen)', async () => {
    render(<EditScreen campaign={mockCampaign} onBack={vi.fn()} />);

    const whatInput = await screen.findByDisplayValue('Drucker');
    const priceInput = screen.getByDisplayValue('150');

    // Simulate extensive typing
    fireEvent.change(whatInput, { target: { value: 'Laserdrucker' } });
    fireEvent.change(priceInput, { target: { value: '250' } });

    // Wait 1000ms (far past the old 600ms debounce)
    await new Promise((r) => setTimeout(r, 1000));

    // Verify: fetch calls MUST ONLY be read queries (GET for initial load or place resolve)
    // NEVER a mutating POST/PUT/DELETE or scrape trigger
    const mutatingOrScraperCalls = fetchMock.mock.calls.filter(([url, init]) => {
      const method = (init?.method || 'GET').toUpperCase();
      const isMutate = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
      const isScrape = String(url).includes('/scrape') || String(url).includes('/knowledge-sets');
      return isMutate || isScrape;
    });

    expect(mutatingOrScraperCalls).toHaveLength(0);
  });

  it('allows adding and removing model pills', async () => {
    render(<EditScreen campaign={mockCampaign} onBack={vi.fn()} />);

    expect(await screen.findByText('Brother HL-L2350DW')).toBeInTheDocument();

    // Remove first model
    const removeBtn = screen.getByLabelText(/Remove Brother HL-L2350DW/i);
    fireEvent.click(removeBtn);
    expect(screen.queryByText('Brother HL-L2350DW')).not.toBeInTheDocument();

    // Add a new term
    const termInput = screen.getByLabelText(/Search terms on Kleinanzeigen|Suchbegriffe bei Kleinanzeigen/i);
    fireEvent.change(termInput, { target: { value: 'Canon MF445dw' } });
    fireEvent.keyDown(termInput, { key: 'Enter', code: 'Enter' });

    expect(screen.getByText('Canon MF445dw')).toBeInTheDocument();
  });

  it('never saves the narrow name as the search term', async () => {
    // The Corsair incident: with no term set, the name itself became the term,
    // "corsair-vengeance-32gb-2x16-ddr4-3200-cl16", and found almost nothing.
    const plainCampaign = { id: 7, name: 'Corsair Vengeance 32GB (2x16) DDR4-3200 CL16' };
    render(<EditScreen campaign={plainCampaign} searches={[]} onBack={vi.fn()} onSaved={vi.fn()} />);

    expect(await screen.findByText('corsair vengeance 32gb')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/^(Save|Speichern)$/));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/search-families', expect.objectContaining({ method: 'POST' }));
    });
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url) === '/api/search-families')!;
    const saved = JSON.parse(String((init as RequestInit).body));
    expect(saved.terms.map((t: { term: string }) => t.term)).toEqual(['corsair-vengeance-32gb']);
    expect(saved.base_url).not.toContain('ddr4-3200');
  });

  it('shows what each term found', async () => {
    render(<EditScreen campaign={mockCampaign} onBack={vi.fn()} />);
    expect(await screen.findByText('Brother HL-L2350DW')).toBeInTheDocument();
    expect(screen.getByText('12 found, 3 matching')).toBeInTheDocument();
  });

  it('saves and compiles structured search url when Speichern is clicked', async () => {
    const onSavedMock = vi.fn();
    render(<EditScreen campaign={mockCampaign} onBack={vi.fn()} onSaved={onSavedMock} />);

    const saveBtn = await screen.findByText(/Save|Speichern/i);
    fireEvent.click(saveBtn);

    // The URL itself, not merely the presence of the key. `stringContaining
    // '"base_url"'` accepted any string at all -- the composer could have been
    // replaced with a literal "https://kleinanzeigen.de/invalid-url-garbage"
    // and the test stayed green, while every search saved from this screen
    // pointed nowhere.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/search-families/10',
        expect.objectContaining({ method: 'PUT' })
      );
    });

    const [, init] = fetchMock.mock.calls.find(
      ([url, options]) =>
        String(url) === '/api/search-families/10' &&
        (options as RequestInit | undefined)?.method === 'PUT'
    )!;
    const saved = JSON.parse(String((init as RequestInit).body));

    // The grammar is /s-<place>/[preis:a:b/]<term>/k0[c<cat>]l<place>r<radius>.
    expect(saved.base_url).toMatch(
      /^https:\/\/www\.kleinanzeigen\.de\/s-landsberg-am-lech\//
    );
    expect(saved.base_url).toContain('preis::150');
    // The first search term, not the hunt's name.
    expect(saved.base_url).toContain('/brother-hl-l2350dw/');
    // No radius was chosen, so none is written: the search is not limited.
    expect(saved.base_url).toMatch(/\/k0(c\d+)?l7437$/);

    expect(onSavedMock).toHaveBeenCalled();
  });

  it('handles quiet delete confirmation', async () => {
    const onDeleteMock = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<EditScreen campaign={mockCampaign} onBack={vi.fn()} onDelete={onDeleteMock} />);

    const deleteBtn = await screen.findByText(/Suche löschen|Delete search/i);
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(onDeleteMock).toHaveBeenCalledWith(mockCampaign);
  });
});
