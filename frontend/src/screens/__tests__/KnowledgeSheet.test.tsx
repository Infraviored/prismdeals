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
    mockApi({ 'GET /api/hunts/11/brief': brief, 'GET /api/hunts/11/knowledge': { knowledge: [] } });
    render(<KnowledgeSheet isOpen onClose={vi.fn()} huntId={11} />);
    expect(await screen.findByText('Schwachstellen beim R1 RN19 Motor')).toBeInTheDocument();
    expect(screen.getByText('Yamaha R1 RN19')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('copy-brief-btn'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(brief.brief);
  });

  it('files a pasted answer as proposed knowledge, then approves and rejects it, reading the list again', async () => {
    let stored = [fact(1, true)];
    const { calls } = mockApi({
      'GET /api/hunts/11/brief': brief,
      'GET /api/hunts/11/knowledge': () => ({ knowledge: stored }),
      'POST /api/hunts/11/knowledge': () => {
        stored = [...stored, fact(7, false), fact(8, false)];
        return [];
      },
      'POST /api/knowledge/*': (_: unknown, url: string) => {
        const id = Number(url.split('/')[3]);
        stored = url.endsWith('approve') ? stored.map((k) => (k.id === id ? { ...k, approved: true } : k)) : stored.filter((k) => k.id !== id);
        return { ok: true };
      },
    });
    render(<KnowledgeSheet isOpen onClose={vi.fn()} huntId={11} />);
    await screen.findByText('Fakt 1');
    fireEvent.change(screen.getByLabelText(/paste/i), { target: { value: 'Antwort der Recherche' } });
    fireEvent.click(screen.getByTestId('classify-btn'));
    await screen.findByTestId('proposed-claims-section');
    expect(calls.find((c) => c.method === 'POST' && c.url === '/api/hunts/11/knowledge')!.body).toEqual({ text: 'Antwort der Recherche' });
    fireEvent.click(screen.getByTestId('approve-claim-7'));
    await waitFor(() => expect(screen.getByTestId('approved-claims-section')).toHaveTextContent('Fakt 7'));
    fireEvent.click(screen.getByTestId('reject-claim-8'));
    await waitFor(() => expect(screen.queryByTestId('proposed-claims-section')).not.toBeInTheDocument());
    expect(screen.queryByText('Fakt 8')).not.toBeInTheDocument();
    expect(calls.map((c) => c.url)).toEqual(expect.arrayContaining(['/api/knowledge/7/approve', '/api/knowledge/8/reject']));
    // Read once on open, then after filing and after each decision.
    expect(calls.filter((c) => c.method === 'GET' && c.url === '/api/hunts/11/knowledge')).toHaveLength(4);
  });

  it('lists proposed and approved knowledge at the targets and their children, with the node each hangs at', async () => {
    mockApi({
      'GET /api/hunts/11/brief': brief,
      'GET /api/hunts/11/knowledge': {
        knowledge: [
          { ...fact(3, false), node_id: 170, node: 'Yamaha R1 RN19 2008' },
          { ...fact(4, true), kind: 'recognition' },
        ],
      },
    });
    render(<KnowledgeSheet isOpen onClose={vi.fn()} huntId={11} />);
    const proposed = await screen.findByTestId('proposed-claims-section');
    expect(proposed).toHaveTextContent('Fakt 3');
    expect(proposed).toHaveTextContent('Yamaha R1 RN19 2008');
    expect(screen.getByTestId('approved-claims-section')).toHaveTextContent('Recognition mark');
  });

  it('says the AI is unreachable and still shows what is known', async () => {
    mockApi({
      'GET /api/hunts/11/brief': { status: 503, body: { error: 'KI nicht erreichbar' } },
      'GET /api/hunts/11/knowledge': { knowledge: [fact(1, true)] },
    });
    render(<KnowledgeSheet isOpen onClose={vi.fn()} huntId={11} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('KI nicht erreichbar');
    expect(await screen.findByText('Fakt 1')).toBeInTheDocument();
  });
});
