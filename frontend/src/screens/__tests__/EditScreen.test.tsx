import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditScreen from '../EditScreen';
import { mockApi } from '../../test/mockApi';
import { huntDoc } from '../../test/huntFixtures';
import type { HuntDocument } from '../../types/hunt';

afterEach(() => vi.unstubAllGlobals());

const echo = (body: unknown) => body;

describe('EditScreen', () => {
  it('shows the stored hunt: targets, conditions, frame and how it is searched, read-only', async () => {
    mockApi({ 'GET /api/hunts/11': huntDoc() });
    render(<EditScreen huntId={11} onBack={vi.fn()} />);
    expect(await screen.findByDisplayValue('Supersportler')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Honda CBR 1000 RR SC59')).toBeInTheDocument();
    expect(screen.getByText('Kilometerstand bis 5000')).toBeInTheDocument();
    expect(screen.getByText('Kilometerstand bis 30000')).toBeInTheDocument();
    const crawl = screen.getByTestId('hunt-crawl');
    expect(crawl).toHaveTextContent('Honda CBR 1000 RR');
    expect(crawl).toHaveTextContent('1 search');
    expect(crawl).toHaveTextContent('3 searches');
    expect(crawl.querySelector('input')).toBeNull();
  });

  it('a condition changed is not a new crawl; a renamed target is, and is placed again', async () => {
    const onSaved = vi.fn();
    const { calls } = mockApi({ 'GET /api/hunts/11': huntDoc(), 'PUT /api/hunts/11': echo });
    render(<EditScreen huntId={11} onBack={vi.fn()} onSaved={onSaved} />);
    await screen.findByDisplayValue('Supersportler');

    // A new condition for all: km at least 1000, as a wish.
    fireEvent.click(screen.getAllByTestId('condition-add-open')[2]);
    fireEvent.change(screen.getByLabelText('Comparison'), { target: { value: 'min' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wish' }));
    fireEvent.click(screen.getByTestId('condition-add'));
    fireEvent.click(screen.getByTestId('edit-save-btn'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const first = calls.find((c) => c.method === 'PUT')!.body as HuntDocument;
    expect(first.conditions[1]).toEqual({ attr_id: 'km', label: 'Kilometerstand', op: 'min', value: 1000, importance: 'wish' });
    expect(onSaved.mock.calls[0][1]).toBe(false);

    fireEvent.change(screen.getByDisplayValue('Honda CBR 1000 RR SC59'), { target: { value: 'Honda CBR 1000 RR SC57' } });
    fireEvent.click(screen.getByTestId('edit-save-btn'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
    const second = calls.filter((c) => c.method === 'PUT')[1].body as HuntDocument;
    expect(second.targets[0].node_id).toBeUndefined();
    expect(second.targets[0].typed).toBe('Honda CBR 1000 RR SC57');
    expect(second.targets[1].node_id).toBe(168);
    expect(onSaved.mock.calls[1][1]).toBe(true);
  });

  it('changes the hunt in words: shows the changes, saves only on confirm', async () => {
    const changed = { ...huntDoc(), conditions: [] };
    const onSaved = vi.fn();
    const { calls } = mockApi({
      'GET /api/hunts/11': huntDoc(),
      'POST /api/hunts/edit': { document: changed, changes: ['Für alle: entfernt – Kilometerstand bis 30000'] },
      'PUT /api/hunts/11': echo,
    });
    render(<EditScreen huntId={11} onBack={vi.fn()} onSaved={onSaved} />);
    await screen.findByDisplayValue('Supersportler');
    fireEvent.change(screen.getByLabelText('Change with AI'), { target: { value: 'ohne km-Grenze für alle' } });
    fireEvent.click(screen.getByTestId('hunt-ai-run'));
    expect(await screen.findByTestId('hunt-ai-proposal')).toHaveTextContent('entfernt – Kilometerstand bis 30000');
    expect(calls.find((c) => c.url === '/api/hunts/edit')!.body).toMatchObject({ instruction: 'ohne km-Grenze für alle', document: { id: 11 } });
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    fireEvent.click(screen.getByTestId('hunt-ai-apply'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect((calls.find((c) => c.method === 'PUT')!.body as HuntDocument).conditions).toEqual([]);
  });

  it('deletes only after confirming', async () => {
    mockApi({ 'GET /api/hunts/11': huntDoc() });
    const onDelete = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<EditScreen huntId={11} onBack={vi.fn()} onDelete={onDelete} />);
    await screen.findByDisplayValue('Supersportler');
    fireEvent.click(screen.getByText('Delete search'));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Delete search'));
    expect(onDelete).toHaveBeenCalledWith(11);
    confirm.mockRestore();
  });
});
