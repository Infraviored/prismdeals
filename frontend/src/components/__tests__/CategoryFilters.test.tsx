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
    // Asserted by what is never asked, not by what is not on screen yet. The
    // suggestion is 400ms behind a debounce, so a bare queryByText passes
    // before the timer has even fired -- it stayed green with the guard
    // deleted, which is the same as having no test at all.
    const fetchMock = mockFetch({
      '/api/taxonomy/suggest': { suggestions: [SUGGESTION] },
      '/api/taxonomy/categories/225': { id: '225', name: 'PC-Zubehör', filters: [] },
    });
    globalThis.fetch = fetchMock as never;

    render(
      <CategoryFilters
        categoryId="225"
        attributes={[]}
        term="Laserdrucker"
        onCategoryChange={vi.fn()}
        onAttributesChange={vi.fn()}
      />
    );

    // The chosen category is fetched, which proves the component ran at all.
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('/categories/225'))
      ).toBe(true);
    });

    // Well past the 400ms debounce.
    await new Promise(resolve => setTimeout(resolve, 700));

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/taxonomy/suggest'))
    ).toEqual([]);
    expect(screen.queryByText(/Drucker & Scanner/)).not.toBeInTheDocument();
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

  it('renders attribute_range filters with min and max inputs and updates attributes', async () => {
    const fetchMock = mockFetch({
      '/api/taxonomy/categories/305': {
        id: '305',
        name: 'Motorräder & Motorroller',
        filters: [
          {
            key: 'motorraeder_roller.km_i',
            label: 'Kilometerstand',
            type: 'attribute_range',
            location: 'tail',
          },
        ],
      },
    });
    globalThis.fetch = fetchMock as never;
    const onAttributesChange = vi.fn();

    render(
      <CategoryFilters
        categoryId="305"
        attributes={[]}
        term="R1"
        onCategoryChange={vi.fn()}
        onAttributesChange={onAttributesChange}
      />
    );

    expect(await screen.findByText('Kilometerstand')).toBeInTheDocument();
    const minInput = screen.getByPlaceholderText(/from|ab/i);
    const maxInput = screen.getByPlaceholderText(/to|bis/i);

    fireEvent.change(minInput, { target: { value: '5000' } });
    expect(onAttributesChange).toHaveBeenCalledWith(['motorraeder_roller.km_i:5000,']);

    fireEvent.change(maxInput, { target: { value: '50000' } });
    expect(onAttributesChange).toHaveBeenCalledWith(['motorraeder_roller.km_i:,50000']);
  });
});

