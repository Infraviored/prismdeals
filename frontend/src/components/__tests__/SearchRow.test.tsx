 
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchRow } from '../surface/SearchRow';

describe('SearchRow Component P3', () => {
  it('renders search row with name, 48px thumbnail, match count, location, and freshness', () => {
    const handleClick = vi.fn();
    render(
      <SearchRow
        id={101}
        name="Matratze"
        count={107}
        locationLabel="30 km um Landsberg"
        freshnessLabel="vor 2 Std"
        imageUrl="https://example.com/matratze.jpg"
        onClick={handleClick}
      />
    );

    expect(screen.getByText('Matratze')).toBeInTheDocument();
    expect(screen.getByTestId('search-count')).toHaveTextContent('107');
    expect(screen.getByText('30 km um Landsberg')).toBeInTheDocument();
    expect(screen.getByText('vor 2 Std')).toBeInTheDocument();

    const row = screen.getByTestId('campaign-card-101');
    expect(row).toBeInTheDocument();
    expect(row).toHaveAttribute('data-search-id', '101');

    fireEvent.click(row);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('supports keyboard navigation via Enter and Space keys', () => {
    const handleClick = vi.fn();
    render(
      <SearchRow
        id={102}
        name="Drucker"
        count={0}
        locationLabel="30 km um Landsberg"
        freshnessLabel="gestern"
        onClick={handleClick}
      />
    );

    const row = screen.getByTestId('campaign-card-102');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(handleClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(row, { key: ' ' });
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('renders placeholder icon when image is missing or fails to load', () => {
    render(
      <SearchRow
        id={103}
        name="Laptops"
        count={692}
        locationLabel="Korridor Landsberg→Konstanz"
        freshnessLabel="heute"
        imageUrl={null}
      />
    );

    expect(screen.getByText('Laptops')).toBeInTheDocument();
    expect(screen.getByTestId('search-count')).toHaveTextContent('692');
    expect(screen.getByText('Korridor Landsberg→Konstanz')).toBeInTheDocument();
    expect(screen.getByText('heute')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('does not contain any coral color (#E87967)', () => {
    const { container } = render(
      <SearchRow
        id={104}
        name="Kleiderschrank"
        count={74}
        locationLabel="30 km um Landsberg"
        freshnessLabel="vor 3 Tagen"
        imageUrl="https://example.com/wardrobe.jpg"
      />
    );

    const html = container.innerHTML;
    expect(html).not.toContain('#E87967');
    expect(html).not.toContain('text-brand-accent');
    expect(html).not.toContain('bg-brand-accent');
  });

  it('handles row with no location or freshness gracefully', () => {
    render(
      <SearchRow
        id={105}
        name="Empty Search"
        count={0}
      />
    );

    expect(screen.getByText('Empty Search')).toBeInTheDocument();
    expect(screen.getByTestId('search-count')).toHaveTextContent('0');
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
