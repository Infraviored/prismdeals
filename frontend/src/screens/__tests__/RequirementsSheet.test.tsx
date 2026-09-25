import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RequirementsSheet } from '../RequirementsSheet';

const MOCK_FIELDS = [
  {
    id: 'a2Compatible',
    type: 'boolean' as const,
    label: 'A2-tauglich',
    description: 'yes if the bike is at or below 35 kW, or restrictable.',
  },
  {
    id: 'storageCondition',
    type: 'enum' as const,
    label: 'Unterstellung',
    description: 'Where the bike was kept: garage, carport, draussen.',
    options: ['garage', 'carport', 'draussen', 'unbekannt'],
  },
  {
    id: 'crashDamage',
    type: 'boolean' as const,
    label: 'Sturzschaden',
    description: 'yes if a fall or crash damage is mentioned.',
  },
];

const MOCK_REQUIREMENTS = [
  {
    id: 'a2Compatible',
    buyer_wants: { match: true },
  },
];

describe('RequirementsSheet', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('never shows field descriptions (English extractor instructions)', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/requirements')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              fields: MOCK_FIELDS,
              requirements: MOCK_REQUIREMENTS,
              searches: 2,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(
      <RequirementsSheet
        isOpen={true}
        onClose={vi.fn()}
        campaignId={8}
      />
    );

    // Stored requirement field label is shown
    expect(await screen.findByText('A2-tauglich')).toBeInTheDocument();

    // Descriptions MUST NOT be rendered
    expect(
      screen.queryByText(/yes if the bike is at or below 35 kW/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Where the bike was kept/i)
    ).not.toBeInTheDocument();
  });

  it('renders stored requirements in the primary view and unconfigured fields behind more criteria', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/requirements')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              fields: MOCK_FIELDS,
              requirements: MOCK_REQUIREMENTS,
              searches: 1,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(
      <RequirementsSheet
        isOpen={true}
        onClose={vi.fn()}
        campaignId={8}
      />
    );

    // Stored field (a2Compatible) is visible immediately
    expect(await screen.findByText('A2-tauglich')).toBeInTheDocument();

    // Unconfigured fields are NOT visible initially
    expect(screen.queryByText('Unterstellung')).not.toBeInTheDocument();
    expect(screen.queryByText('Sturzschaden')).not.toBeInTheDocument();

    // "More criteria" button exists
    const moreBtn = screen.getByRole('button', { name: /More criteria|Weitere Kriterien/i });
    expect(moreBtn).toBeInTheDocument();

    // Click "More criteria"
    fireEvent.click(moreBtn);

    // Now unconfigured fields are visible
    expect(screen.getByText('Unterstellung')).toBeInTheDocument();
    expect(screen.getByText('Sturzschaden')).toBeInTheDocument();

    // Button flips to "Fewer criteria"
    expect(screen.getByRole('button', { name: /Fewer criteria|Weniger Kriterien/i })).toBeInTheDocument();
  });

  it('says so when nothing is chosen yet, suggestions stay folded', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ playbook: 'vehicles/motorcycles', fields: MOCK_FIELDS, requirements: [], searches: 1 }),
    });
    render(<RequirementsSheet isOpen onClose={() => {}} campaignId={8} />);
    // An empty sheet with one button was the result before.
    expect(await screen.findByText(/No requirements yet/)).toBeInTheDocument();
    expect(screen.queryByText('Unterstellung')).not.toBeInTheDocument();
  });

  it('keeps own wishes and importance on save and adds a new wish', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body || '') });
      if (init?.method === 'PUT' || url.endsWith('/judge')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            playbook: 'vehicles/motorcycles',
            fields: MOCK_FIELDS,
            requirements: [
              { id: 'a2Compatible', importance: 'high', buyer_wants: { match: true } },
              { id: 'own_abs', label: 'ABS', importance: 'low', own: true, buyer_wants: { present: true } },
            ],
            searches: 2,
          }),
      });
    });
    render(<RequirementsSheet isOpen onClose={() => {}} campaignId={9} />);
    expect(await screen.findByText('ABS')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/ABS, cases/), { target: { value: 'Koffer' } });
    fireEvent.click(screen.getByText('Add as nice to have'));
    fireEvent.click(screen.getByText(/Save requirements|Anforderungen speichern/));
    await vi.waitFor(() => expect(calls.some(c => c.url.endsWith('/requirements') && c.body)).toBe(true));
    const sent = JSON.parse(calls.find(c => c.url.endsWith('/requirements') && c.body)!.body).requirements;
    const ids = sent.map((r: { id: string }) => r.id).sort();
    expect(ids).toEqual(['a2Compatible', 'own_abs', 'own_koffer']);
    expect(sent.find((r: { id: string }) => r.id === 'a2Compatible').importance).toBe('high');
    expect(sent.find((r: { id: string }) => r.id === 'own_koffer').importance).toBe('low');
  });

  it('a removed own wish stays removed after save', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body || '') });
      if (init?.method === 'PUT' || url.endsWith('/judge')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            playbook: 'vehicles/motorcycles',
            fields: MOCK_FIELDS,
            requirements: [
              { id: 'own_abs', label: 'ABS', importance: 'low', own: true, buyer_wants: { present: true } },
            ],
            searches: 1,
          }),
      });
    });
    render(<RequirementsSheet isOpen onClose={() => {}} campaignId={9} />);
    expect(await screen.findByText('ABS')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Remove|Entfernen/ })[0]);
    fireEvent.click(screen.getByText(/Save requirements|Anforderungen speichern/));
    await vi.waitFor(() => expect(calls.some(c => c.url.endsWith('/requirements') && c.body)).toBe(true));
    const sent = JSON.parse(calls.find(c => c.url.endsWith('/requirements') && c.body)!.body).requirements;
    expect(sent.map((r: { id: string }) => r.id)).toEqual([]);
  });
});
