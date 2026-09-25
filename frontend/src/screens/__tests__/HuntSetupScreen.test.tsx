import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HuntSetupScreen from '../HuntSetupScreen';
import { mockApi } from '../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const draft = {
  name: 'Leiser Büroventilator',
  text: 'Ventilator fürs Büro, leise, bis 25 Euro',
  category_code: '176',
  category_name: 'Elektronik > Haushaltsgeräte',
  frame: { max_price: 25 },
  targets: [{ typed: 'Ventilator', conditions: [{ label: 'Lautstärke', op: 'eq', value: 'leise', importance: 'must' }] }],
  conditions: [],
};

async function toDraft() {
  fireEvent.change(screen.getByTestId('hunt-intent-input'), { target: { value: draft.text } });
  fireEvent.click(screen.getByTestId('hunt-step1-next-btn'));
  await screen.findByTestId('hunt-editor');
}

describe('HuntSetupScreen', () => {
  it('drafts from words, lets the buyer change the draft, stores it and hands over the stored hunt', async () => {
    const onSaved = vi.fn();
    const { calls } = mockApi({
      'POST /api/hunts/draft': draft,
      'POST /api/hunts': (body: unknown) => ({ ...(body as object), id: 42 }),
    });
    render(<HuntSetupScreen onBack={vi.fn()} onSaved={onSaved} />);
    await toDraft();
    expect(calls[0].body).toEqual({ text: draft.text });
    expect(screen.getByDisplayValue('Leiser Büroventilator')).toBeInTheDocument();
    expect(screen.getByText('Lautstärke: leise')).toBeInTheDocument();
    expect(screen.getByText('Category: Elektronik > Haushaltsgeräte')).toBeInTheDocument();

    // A second target, and the condition becomes a wish.
    fireEvent.change(screen.getByLabelText('Add target'), { target: { value: 'Tischventilator' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Must' }));

    fireEvent.click(screen.getByTestId('hunt-save-btn'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = calls.find((c) => c.method === 'POST' && c.url === '/api/hunts')!.body as typeof draft;
    expect(saved.text).toBe(draft.text);
    expect(saved.targets.map((t) => t.typed)).toEqual(['Ventilator', 'Tischventilator']);
    expect(saved.targets[0].conditions[0].importance).toBe('wish');
    expect(onSaved.mock.calls[0][0].id).toBe(42);
  });

  it('says the AI is unreachable instead of guessing', async () => {
    mockApi({ 'POST /api/hunts/draft': { status: 503, body: { error: 'KI nicht erreichbar' } } });
    render(<HuntSetupScreen onBack={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByTestId('hunt-intent-input'), { target: { value: 'Ventilator' } });
    fireEvent.click(screen.getByTestId('hunt-step1-next-btn'));
    expect(await screen.findByRole('alert')).toHaveTextContent('KI nicht erreichbar');
    expect(screen.queryByTestId('hunt-editor')).not.toBeInTheDocument();
  });

  it('shows why the server refused to store it', async () => {
    mockApi({ 'POST /api/hunts/draft': draft, 'POST /api/hunts': { status: 400, body: { error: 'Eine Suche „X“ gibt es schon.' } } });
    const onSaved = vi.fn();
    render(<HuntSetupScreen onBack={vi.fn()} onSaved={onSaved} />);
    await toDraft();
    fireEvent.click(screen.getByTestId('hunt-save-btn'));
    expect(await screen.findByRole('alert')).toHaveTextContent('gibt es schon');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
