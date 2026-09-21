import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CategoryFilters } from '../CategoryFilters';

const SUGGESTION = {
  id: '225',
  name: 'PC-Zubehör & Software',
  parent_name: 'Elektronik',
  filter_count: 6,
  filter: 'pc_zubehoer_software.art_s:drucker_scanner',
  filter_label: 'Drucker & Scanner',
};

function mockFetch(handlers: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const key = Object.keys(handlers).find(k => String(url).includes(k));
    return Promise.resolve({
      ok: key !== undefined,
      status: key ? 200 : 404,
      json: () => Promise.resolve(key ? handlers[key] : {}),
    });
  });
}

describe('CategoryFilters', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('suggests a category from the word the buyer already typed', async () => {
    // Nobody browses 161 categories to say "printer", and the categories are
    // not called what people type: a printer lives under "PC-Zubehör".
    globalThis.fetch = mockFetch({ '/api/taxonomy/suggest': { suggestions: [SUGGESTION] } }) as never;

    render(
      <CategoryFilters
        categoryId={null}
        attributes={[]}
        term="Laserdrucker"
        onCategoryChange={vi.fn()}
        onAttributesChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Drucker & Scanner/)).toBeInTheDocument();
  });

  it('sets the category and the filter it matched on, together', async () => {
    // The suggestion is only worth offering because it carries the filter: a
    // printer search should arrive as "PC-Zubehör, type: printers", not as a
    // word in a title.
    globalThis.fetch = mockFetch({ '/api/taxonomy/suggest': { suggestions: [SUGGESTION] } }) as never;
    const onCategoryChange = vi.fn();
    const onAttributesChange = vi.fn();

    render(
      <CategoryFilters
        categoryId={null}
        attributes={[]}
        term="Laserdrucker"
        onCategoryChange={onCategoryChange}
        onAttributesChange={onAttributesChange}
      />
    );

    fireEvent.click(await screen.findByText(/Drucker & Scanner/));

    expect(onCategoryChange).toHaveBeenCalledWith('225');
    expect(onAttributesChange).toHaveBeenCalledWith([
      'pc_zubehoer_software.art_s:drucker_scanner',
    ]);
  });

  it('stops suggesting once a category is chosen', async () => {
    globalThis.fetch = mockFetch({
      '/api/taxonomy/suggest': { suggestions: [SUGGESTION] },
      '/api/taxonomy/categories/225': { id: '225', name: 'PC-Zubehör', filters: [] },
    }) as never;

    render(
      <CategoryFilters
        categoryId="225"
        attributes={[]}
        term="Laserdrucker"
        onCategoryChange={vi.fn()}
        onAttributesChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText(/Drucker & Scanner/)).not.toBeInTheDocument();
    });
  });

  it('says nothing when the word is too short to guess from', async () => {
    const fetchMock = mockFetch({ '/api/taxonomy/suggest': { suggestions: [] } });
    globalThis.fetch = fetchMock as never;

    render(
      <CategoryFilters
        categoryId={null}
        attributes={[]}
        term="ab"
        onCategoryChange={vi.fn()}
        onAttributesChange={vi.fn()}
      />
    );

    await new Promise(r => setTimeout(r, 500));
    const asked = fetchMock.mock.calls.some(c => String(c[0]).includes('suggest'));
    expect(asked).toBe(false);
  });
});
