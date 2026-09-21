import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Row } from '../surface/Row';

const LISTING = {
  id: 'abc',
  title: 'MacBook Air 13" 2014',
  price_eur: 109,
  location: 'Bayern - Landsberg (Lech)',
};

describe('keeping a find from the list', () => {
  it('marks and unmarks without opening the listing', () => {
    // A hunt through a thousand rows turns up three worth a second look.
    // Tapping the mark must not navigate away from the list.
    const onToggleKeep = vi.fn();
    const onClick = vi.fn();
    render(
      <Row listing={LISTING} isKept={false} onToggleKeep={onToggleKeep} onClick={onClick} />
    );

    fireEvent.click(screen.getByTestId('keep-toggle'));

    expect(onToggleKeep).toHaveBeenCalledWith('abc');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('says whether it is kept, for anyone not looking at the colour', () => {
    const { rerender } = render(
      <Row listing={LISTING} isKept={false} onToggleKeep={vi.fn()} />
    );
    expect(screen.getByTestId('keep-toggle')).toHaveAttribute('aria-pressed', 'false');

    rerender(<Row listing={LISTING} isKept onToggleKeep={vi.fn()} />);
    expect(screen.getByTestId('keep-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows no mark where keeping is not offered', () => {
    render(<Row listing={LISTING} />);
    expect(screen.queryByTestId('keep-toggle')).not.toBeInTheDocument();
  });
});
