import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchFamilyEditor from '../SearchFamilyEditor';

describe('SearchFamilyEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('splits multi-line text into individual toggleable and deletable term items', async () => {
    render(<SearchFamilyEditor />);

    const textarea = screen.getByLabelText(/Modelle|Models/i);
    expect(textarea).toBeInTheDocument();

    const pastedText = 'ThinkPad T480\nThinkPad T490\nThinkPad T14';
    fireEvent.paste(textarea, {
      clipboardData: {
        getData: (format?: string) => (format === 'text' || !format ? pastedText : ''),
      },
    });

    await waitFor(() => {
      expect(screen.getByText('ThinkPad T480')).toBeInTheDocument();
      expect(screen.getByText('ThinkPad T490')).toBeInTheDocument();
      expect(screen.getByText('ThinkPad T14')).toBeInTheDocument();
    });

    expect(screen.getByText(/3 of 3|3 von 3/)).toBeInTheDocument();
  });

  it('allows toggling and deleting individual terms', async () => {
    render(
      <SearchFamilyEditor
        initialName="Test Family"
        initialBaseUrl="https://www.kleinanzeigen.de/s-laptop/k0c278"
        initialTerms={[
          { term: 'ThinkPad T480', label: 'ThinkPad T480', enabled: true },
          { term: 'ThinkPad T490', label: 'ThinkPad T490', enabled: true },
        ]}
      />
    );

    expect(screen.getByText('ThinkPad T480')).toBeInTheDocument();
    expect(screen.getByText('ThinkPad T490')).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 2|2 of 2/)).toBeInTheDocument();

    const toggleButtons = screen.getAllByLabelText(/Toggle model active\/inactive|Modell aktivieren\/deaktivieren/i);
    fireEvent.click(toggleButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/1 \/ 2|1 of 2/)).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByLabelText(/Remove model|Modell entfernen/i);
    fireEvent.click(deleteButtons[1]);

    await waitFor(() => {
      expect(screen.queryByText('ThinkPad T490')).not.toBeInTheDocument();
      expect(screen.getByText(/0 \/ 1|0 of 1/)).toBeInTheDocument();
    });
  });

  it('pre-populates radius and location from existing Campaign 6 Drucker URL', async () => {
    const druckerUrl = 'https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30';
    render(
      <SearchFamilyEditor
        initialName="Drucker"
        initialBaseUrl={druckerUrl}
        initialTerms={[
          { term: 'Brother MFC-L2740DW', label: 'Brother MFC-L2740DW', enabled: true },
        ]}
      />
    );

    // Verify raw URL is NOT displayed as an input field
    expect(screen.queryByRole('textbox', { name: /Base Search URL|Basis-Such-URL/i })).not.toBeInTheDocument();

    // Verify Radius is pre-populated to 30 km (both badge and preset button exist)
    expect(screen.getAllByText(/30 km/).length).toBeGreaterThanOrEqual(1);

    // Verify price range is currently unconstrained
    expect(screen.getByText(/Keine Preisgrenze|No price limit/i)).toBeInTheDocument();
  });

  it('updates composed URL when radius preset is clicked', async () => {
    const druckerUrl = 'https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30';
    render(
      <SearchFamilyEditor
        initialName="Drucker"
        initialBaseUrl={druckerUrl}
        initialTerms={[
          { term: 'Brother MFC-L2740DW', label: 'Brother MFC-L2740DW', enabled: true },
        ]}
      />
    );

    // Click 50 km preset button
    const preset50 = screen.getByRole('button', { name: '50 km' });
    fireEvent.click(preset50);

    await waitFor(() => {
      expect(screen.getAllByText(/50 km/).length).toBeGreaterThanOrEqual(1);
      // The advanced details contains the newly composed URL with r50
      expect(screen.getByText(/r50/)).toBeInTheDocument();
    });
  });

  it('updates composed URL with preis:a:b when min and max price are entered', async () => {
    const druckerUrl = 'https://www.kleinanzeigen.de/s-landsberg-am-lech/drucker/k0l7091r30';
    render(
      <SearchFamilyEditor
        initialName="Drucker"
        initialBaseUrl={druckerUrl}
        initialTerms={[
          { term: 'Brother MFC-L2740DW', label: 'Brother MFC-L2740DW', enabled: true },
        ]}
      />
    );

    const minInput = screen.getByPlaceholderText(/Min €/i);
    const maxInput = screen.getByPlaceholderText(/Max €/i);

    fireEvent.change(minInput, { target: { value: '25' } });
    fireEvent.change(maxInput, { target: { value: '150' } });

    await waitFor(() => {
      expect(screen.getByText(/25 € – 150 €/)).toBeInTheDocument();
      expect(screen.getByText(/preis:25:150/)).toBeInTheDocument();
    });
  });

  it('debounces preview calculation and renders factual multiplication stats', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/search-families/preview') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            terms: 10,
            circles: 6,
            searches: 60,
            new_searches: 47,
            reused_searches: 13,
            pages: 60,
            estimated_seconds: 240,
            urls: [],
            conflicts: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <SearchFamilyEditor
        initialName="ThinkPads"
        initialBaseUrl="https://www.kleinanzeigen.de/s-laptop/k0c278"
        initialTerms={[
          { term: 'ThinkPad T480', label: 'ThinkPad T480', enabled: true },
        ]}
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/search-families/preview',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/10 (Modelle|models) × 6 (Kreise|circles) = 60 (Suchen|searches)/i)).toBeInTheDocument();
      expect(screen.getByText(/13 (davon laufen schon|already running)/i)).toBeInTheDocument();
      expect(screen.getByText(/ca\. 4 (Minuten|minutes)/i)).toBeInTheDocument();
    });
  });

  it('submits POST /api/search-families preserving disabled terms in payload and invokes onSave callback', async () => {
    const onSave = vi.fn();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/search-families/preview') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            terms: 1,
            circles: 1,
            searches: 1,
            new_searches: 1,
            reused_searches: 0,
            pages: 1,
            estimated_seconds: 30,
            urls: [],
            conflicts: [],
          }),
        });
      }
      if (url === '/api/search-families') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 42,
            searches: 1,
            conflicts: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock;

    render(
      <SearchFamilyEditor
        initialName="ThinkPads"
        initialBaseUrl="https://www.kleinanzeigen.de/s-laptop/k0c278"
        initialTerms={[
          { term: 'ThinkPad T480', label: 'ThinkPad T480', enabled: true },
          { term: 'ThinkPad X280', label: 'ThinkPad X280', enabled: false },
        ]}
        onSave={onSave}
      />
    );

    const saveBtn = screen.getByRole('button', { name: /Speichern|Save/i });
    await waitFor(() => {
      expect(saveBtn).not.toBeDisabled();
    });

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/search-families',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'ThinkPads',
            base_url: 'https://www.kleinanzeigen.de/s-laptop/k0c278',
            terms: [
              { term: 'ThinkPad T480', label: 'ThinkPad T480', enabled: true },
              { term: 'ThinkPad X280', label: 'ThinkPad X280', enabled: false },
            ],
          }),
        })
      );
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        id: 42,
        searches: 1,
        conflicts: [],
      });
    });
  });
});
