import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { KnowledgeSheet } from '../KnowledgeSheet';

describe('KnowledgeSheet', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and renders brief with what to know and search brief', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        decision: 'lohnt sich',
        research_value: 'shallow',
        what_to_know: ['Schwachstellen beim R1 RN19 Motor', 'Ventilspielprüfung'],
        brief: 'Recherchiere gründlich zu Yamaha R1 RN19...',
        node_key: 'motorrad/supersport/yamaha-r1/rn19',
        existing_claims: [],
        pending_claims: [],
      }),
    });

    render(<KnowledgeSheet isOpen={true} onClose={vi.fn()} campaignId={9} />);

    await waitFor(() => {
      expect(screen.getByText('Schwachstellen beim R1 RN19 Motor')).toBeInTheDocument();
    });

    expect(screen.getByText('Ventilspielprüfung')).toBeInTheDocument();
    expect(screen.getByText(/Recherchiere gründlich zu Yamaha R1 RN19/)).toBeInTheDocument();
    expect(screen.getByTestId('copy-brief-btn')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('copy-brief-btn'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Recherchiere gründlich zu Yamaha R1 RN19...');
  });

  it('classifies pasted answer and allows approving a claim', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        decision: 'lohnt sich',
        research_value: 'shallow',
        what_to_know: ['Schwachstellen'],
        brief: 'Recherche-Auftrag...',
        node_key: 'motorrad/supersport/yamaha-r1/rn19',
        existing_claims: [],
        pending_claims: [],
      }),
    });

    render(<KnowledgeSheet isOpen={true} onClose={vi.fn()} campaignId={9} />);

    await waitFor(() => {
      expect(screen.getByTestId('classify-btn')).toBeInTheDocument();
    });

    // Enter answer in textarea
    const textarea = screen.getByPlaceholderText(/Antwort deiner KI hier einfügen|Paste the response of your AI/);
    fireEvent.change(textarea, { target: { value: '## Bekannte Schwächen\n- Lima Rotor Defekt https://motorrad.de' } });

    // Mock classify POST
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        claims: [
          {
            id: 42,
            node_key: 'motorrad/supersport/yamaha-r1/rn19',
            kind: 'weakness',
            statement: 'Lima Rotor Defekt',
            sources: ['https://motorrad.de'],
            approved: false,
          },
        ],
      }),
    });

    fireEvent.click(screen.getByTestId('classify-btn'));

    await waitFor(() => {
      expect(screen.getByText('Lima Rotor Defekt')).toBeInTheDocument();
    });

    expect(screen.getByTestId('approve-claim-42')).toBeInTheDocument();

    // Mock approve POST
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, id: 42 }),
    });

    fireEvent.click(screen.getByTestId('approve-claim-42'));

    await waitFor(() => {
      expect(screen.queryByTestId('approve-claim-42')).toBeNull();
    });
  });
});
