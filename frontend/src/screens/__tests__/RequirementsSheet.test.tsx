import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RequirementsSheet } from '../RequirementsSheet';
import { mockApi } from '../../test/mockApi';
import { huntDoc } from '../../test/huntFixtures';
import type { HuntDocument } from '../../types/hunt';

afterEach(() => vi.unstubAllGlobals());

describe('RequirementsSheet', () => {
  it('edits only the conditions and saves the whole hunt with PUT; no judge call', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const { calls } = mockApi({ 'GET /api/hunts/11': huntDoc(), 'PUT /api/hunts/11': (b: unknown) => b });
    render(<RequirementsSheet isOpen huntId={11} onClose={onClose} onSaved={onSaved} />);
    expect(await screen.findByText('Kilometerstand bis 5000')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Supersportler')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add target')).not.toBeInTheDocument();

    const rows = screen.getAllByTestId('condition-row');
    fireEvent.click(rows[0].querySelector('button')!); // must -> wish
    fireEvent.click(screen.getAllByLabelText('Remove')[1]); // the one for all
    fireEvent.click(screen.getByTestId('requirements-save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const body = calls.find((c) => c.method === 'PUT')!.body as HuntDocument;
    expect(body.targets[0].conditions[0].importance).toBe('wish');
    expect(body.conditions).toEqual([]);
    expect(body.name).toBe('Supersportler');
    expect(calls.some((c) => c.url.includes('judge'))).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the sheet open and says why when saving fails', async () => {
    mockApi({ 'GET /api/hunts/11': huntDoc(), 'PUT /api/hunts/11': { status: 400, body: { error: '„Kilometerstand“ braucht eine Zahl.' } } });
    const onClose = vi.fn();
    render(<RequirementsSheet isOpen huntId={11} onClose={onClose} />);
    await screen.findByText('Kilometerstand bis 5000');
    fireEvent.click(screen.getByTestId('requirements-save'));
    expect(await screen.findByRole('alert')).toHaveTextContent('braucht eine Zahl');
    expect(onClose).not.toHaveBeenCalled();
  });
});
