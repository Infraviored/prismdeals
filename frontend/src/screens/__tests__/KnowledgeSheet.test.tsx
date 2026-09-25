import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KnowledgeSheet } from '../KnowledgeSheet';
import { mockApi } from '../../test/mockApi';

const brief = {
  decision: 'lohnt sich',
  research_value: 'shallow',
  what_to_know: ['Schwachstellen beim R1 RN19 Motor'],
  brief: 'Recherchiere zu Yamaha R1 RN19 …',
  targets: [{ node_id: 168, name: 'Yamaha R1 RN19' }],
  knowledge: [],
};
const fact = (id: number, approved: boolean) => ({
  id, node_id: 168, node: 'Yamaha R1 RN19', kind: 'check', statement: `Fakt ${id}`, sources: [], approved,
});

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
});
afterEach(() => vi.unstubAllGlobals());

describe('KnowledgeSheet', () => {
  it('shows what to know and the brief to copy', async () => {
    mockApi({ 'GET /api/hunts/11/brief': brief });
    render(<KnowledgeSheet isOpen onClose={vi.fn()} huntId={11} />);
    expect(await screen.findByText('Schwachstellen beim R1 RN19 Motor')).toBeInTheDocument();
    expect(screen.getByText('Yamaha R1 RN19')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('copy-brief-btn'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(brief.brief);
  });

  it('files a pasted answer as proposed knowledge, then approves and rejects it', async () => {
    const { calls } = mockApi({
      'GET /api/hunts/11/brief': { ...brief, knowledge: [fact(1, true)] },
      'POST /api/hunts/11/knowledge': [fact(7, false), fact(8, false)],
      'POST /api/knowledge/*': { ok: true },
    });
    render(<KnowledgeSheet isOpen onClose={vi.fn()} huntId={11} />);
    await screen.findByText('Fakt 1');
    fireEvent.change(screen.getByLabelText(/paste/i), { target: { value: 'Antwort der Recherche' } });
    fireEvent.click(screen.getByTestId('classify-btn'));
    await screen.findByTestId('proposed-claims-section');
    expect(calls.find((c) => c.url === '/api/hunts/11/knowledge')!.body).toEqual({ text: 'Antwort der Recherche' });
    fireEvent.click(screen.getByTestId('approve-claim-7'));
    fireEvent.click(screen.getByTestId('reject-claim-8'));
    await waitFor(() => expect(screen.queryByTestId('proposed-claims-section')).not.toBeInTheDocument());
    expect(screen.getByTestId('approved-claims-section')).toHaveTextContent('Fakt 7');
    expect(screen.queryByText('Fakt 8')).not.toBeInTheDocument();
    expect(calls.map((c) => c.url)).toEqual(expect.arrayContaining(['/api/knowledge/7/approve', '/api/knowledge/8/reject']));
  });

  it('says the AI is unreachable', async () => {
    mockApi({ 'GET /api/hunts/11/brief': { status: 503, body: { error: 'KI nicht erreichbar' } } });
    render(<KnowledgeSheet isOpen onClose={vi.fn()} huntId={11} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('KI nicht erreichbar');
  });
});
