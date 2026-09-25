import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { KnowledgeChecklist } from '../KnowledgeChecklist';
import { mockApi } from '../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const known = {
  id: 3, node_id: 176, node: 'Honda CBR 1000 RR SC59', kind: 'weakness', statement: 'Regler brennt durch',
  check_path: 'ask', weight: 'dealbreaker', sources: ['https://www.example.com/regler'], approved: true,
};

describe('KnowledgeChecklist', () => {
  it('renders nothing when nothing is known', async () => {
    const { calls } = mockApi({ 'GET /api/listings/123/knowledge': { node: null, knowledge: [] } });
    const { container } = render(<KnowledgeChecklist listingId="123" />);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(container.firstChild).toBeNull();
  });

  it('shows what is known about the listing product, with its node, kind and source', async () => {
    mockApi({ 'GET /api/listings/123/knowledge': { node: 'Honda CBR 1000 RR SC59', knowledge: [known] } });
    render(<KnowledgeChecklist listingId="123" />);
    expect(await screen.findByText('Regler brennt durch')).toBeInTheDocument();
    expect(screen.getByTestId('knowledge-checklist')).toHaveTextContent('Honda CBR 1000 RR SC59');
    expect(screen.getByText('example.com/regler')).toBeInTheDocument();
  });
});
