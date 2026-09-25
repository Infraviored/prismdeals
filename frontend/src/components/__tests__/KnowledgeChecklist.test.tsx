import type { Mock } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { KnowledgeChecklist } from '../KnowledgeChecklist';

describe('KnowledgeChecklist', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when claims list is empty', async () => {
    (fetch as unknown as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ listing_id: '123', node_key: 'motorrad/r1', claims: [] }),
    });

    const { container } = render(<KnowledgeChecklist listingId="123" nodeKey="motorrad/r1" />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders claims with kind badges and source links', async () => {
    (fetch as unknown as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        listing_id: '123',
        node_key: 'motorrad/supersport/yamaha-r1/rn19',
        claims: [
          {
            id: 1,
            node_key: 'motorrad/supersport/yamaha-r1/rn19',
            kind: 'weakness',
            statement: 'Drosselklappenpotentiometer neigt zu Ausfällen.',
            check_path: 'on_site',
            weight: 'costly',
            sources: ['https://r1-forum.de/tps'],
            approved: true,
          },
          {
            id: 2,
            node_key: 'motorrad/supersport/yamaha-r1',
            kind: 'maintenance',
            statement: 'Ventilspielprüfung alle 40.000 km.',
            check_path: 'text',
            weight: 'minor',
            sources: ['https://yamaha-motor.eu/service'],
            approved: true,
          },
        ],
      }),
    });

    render(<KnowledgeChecklist listingId="123" nodeKey="motorrad/supersport/yamaha-r1/rn19" />);

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-checklist')).toBeInTheDocument();
    });

    expect(screen.getByText('Drosselklappenpotentiometer neigt zu Ausfällen.')).toBeInTheDocument();
    expect(screen.getByText('Ventilspielprüfung alle 40.000 km.')).toBeInTheDocument();
    expect(screen.getByText(/Weakness|Schwachstelle/)).toBeInTheDocument();
    expect(screen.getByText(/Maintenance|Wartung/)).toBeInTheDocument();
    expect(screen.getByText(/Inspect on site|Vor Ort prüfen/)).toBeInTheDocument();
    expect(screen.getByText(/Check description|Im Text prüfen/)).toBeInTheDocument();
  });
});
