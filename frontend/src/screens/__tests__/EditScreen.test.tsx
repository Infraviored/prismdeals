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
                { id: 1, term: 'brother-hl-l2350dw', label: 'Brother HL-L2350DW', enabled: true },
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

  it('renders the 4 fields without Card containers', async () => {
    render(<EditScreen campaign={mockCampaign} onBack={vi.fn()} />);

    // Sticky header Bar (48px)
    expect(await screen.findByText(/Drucker/i)).toBeInTheDocument();
    expect(screen.getByText(/Save|Speichern/i)).toBeInTheDocument();

    // 1. Was / What
    expect(screen.getByText(/WAS|WHAT/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Drucker')).toBeInTheDocument();
    expect(await screen.findByText('Brother HL-L2350DW')).toBeInTheDocument();
    expect(screen.getByText('HP M428')).toBeInTheDocument();

    // 2. Wo / Where
    expect(screen.getByText(/WO|WHERE/i)).toBeInTheDocument();

    // 3. Wie weit / How far -- a slider and a typed number, not four presets.
    //    10, 30, 50 and 100 km are not the distances people live at: Landsberg
    //    to Augsburg is 38, to Munich 57.
    expect(screen.getByText(/WIE WEIT|HOW FAR/i)).toBeInTheDocument();
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('max', '200');
    expect(slider).toHaveValue('30');
    expect(screen.getByRole('spinbutton', { name: '' })).toHaveValue(30);
    expect(screen.getByText('km')).toBeInTheDocument();

    // 4. Bis wie viel / Up to how much (Price)
    expect(screen.getByText(/BIS WIE VIEL|UP TO HOW MUCH/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('150')).toBeInTheDocument();

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

    // Add a new model
    const addBtn = screen.getByTitle(/Add model|Modell hinzufügen/i);
    fireEvent.click(addBtn);

    const modelInput = screen.getByPlaceholderText(/Add model|Modell hinzufügen/i);
    fireEvent.change(modelInput, { target: { value: 'Canon MF445dw' } });
    fireEvent.keyDown(modelInput, { key: 'Enter', code: 'Enter' });

    expect(screen.getByText('Canon MF445dw')).toBeInTheDocument();
  });

  it('saves and compiles structured search url when Speichern is clicked', async () => {
    const onSavedMock = vi.fn();
    render(<EditScreen campaign={mockCampaign} onBack={vi.fn()} onSaved={onSavedMock} />);

    const saveBtn = await screen.findByText(/Save|Speichern/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/search-families/10',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"base_url"'),
        })
      );
    });

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
