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

    // Paste multi-line string
    const pastedText = 'ThinkPad T480\nThinkPad T490\nThinkPad T14';
    fireEvent.paste(textarea, {
      clipboardData: {
        getData: (format?: string) => (format === 'text' || !format ? pastedText : ''),
      },
    });

    // The items should now appear as individual items
    await waitFor(() => {
      expect(screen.getByText('ThinkPad T480')).toBeInTheDocument();
      expect(screen.getByText('ThinkPad T490')).toBeInTheDocument();
      expect(screen.getByText('ThinkPad T14')).toBeInTheDocument();
    });

    expect(screen.getByText(/3/)).toBeInTheDocument();
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

    // Toggle T480 off via its toggle button
    const toggleButtons = screen.getAllByLabelText(/Toggle model active\/inactive|Modell aktiv\/inaktiv schalten/i);
    fireEvent.click(toggleButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/1 \/ 2|1 of 2/)).toBeInTheDocument();
    });

    // Delete T490
    const deleteButtons = screen.getAllByLabelText(/Remove model|Modell entfernen/i);
    fireEvent.click(deleteButtons[1]);

    await waitFor(() => {
      expect(screen.queryByText('ThinkPad T490')).not.toBeInTheDocument();
      expect(screen.getByText(/0 \/ 1|0 of 1/)).toBeInTheDocument();
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

    // Wait for debounced preview to execute and render multiplication
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/search-families/preview',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    // Verify preview fact line format: "10 Modelle × 6 Kreise = 60 Suchen · 13 davon laufen schon · ca. 4 Minuten"
    await waitFor(() => {
      expect(screen.getByText(/10 (Modelle|models) × 6 (Kreise|circles) = 60 (Suchen|searches)/i)).toBeInTheDocument();
      expect(screen.getByText(/13 (davon laufen schon|already running)/i)).toBeInTheDocument();
      expect(screen.getByText(/ca\. 4 (Minuten|minutes)/i)).toBeInTheDocument();
    });
  });

  it('keeps save button disabled and informs user why it is disabled', async () => {
    render(<SearchFamilyEditor />);

    const nameInput = screen.getByLabelText(/Family Name|Name der Familie/i);
    const urlInput = screen.getByLabelText(/Base Search URL|Basis-URL/i);
    const saveBtn = screen.getByRole('button', { name: /Speichern|Save/i });

    expect(saveBtn).toBeDisabled();
    expect(screen.getAllByText(/Family name is required|Namen der Familie eingeben/i).length).toBeGreaterThan(0);

    // Fill in Name
    fireEvent.change(nameInput, { target: { value: 'ThinkPads' } });
    expect(saveBtn).toBeDisabled();
    expect(screen.getAllByText(/Base URL is required|Basis-URL eingeben/i).length).toBeGreaterThan(0);

    // Fill in Base URL
    fireEvent.change(urlInput, { target: { value: 'https://www.kleinanzeigen.de/s-laptop/k0c278' } });
    expect(saveBtn).toBeDisabled();
    expect(screen.getAllByText(/At least one active model required|Mindestens ein Modell eintragen/i).length).toBeGreaterThan(0);
  });

  it('keeps save button disabled when preview request fails with an error', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/search-families/preview') {
        return Promise.resolve({
          ok: false,
          json: async () => ({
            error: 'Invalid search parameters',
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

    const saveBtn = screen.getByRole('button', { name: /Speichern|Save/i });
    await waitFor(() => {
      expect(saveBtn).toBeDisabled();
      expect(screen.getByText(/Preview failed or invalid search parameters|Vorschau fehlgeschlagen/i)).toBeInTheDocument();
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
