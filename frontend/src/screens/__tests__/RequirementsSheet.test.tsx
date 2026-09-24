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
});
