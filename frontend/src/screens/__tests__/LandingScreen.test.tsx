import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LandingScreen from '../LandingScreen';
import type { HuntSummary } from '../../types/hunt';

const hunts: HuntSummary[] = [
  {
    id: 11,
    name: 'Supersportler',
    targets: ['Honda CBR 1000 RR SC59', 'Yamaha R1 RN19'],
    frame: { max_price: 9000, location_id: 7074, place: 'Vilgertshofen', radius_km: 200 },
    route: null,
    counts: { all: 58, fit: 5, unclear: 3, no: 50 },
    newest: { id: 'x', title: 'R1', price: '7500 €', image: 'https://example.com/r1.jpg', first_seen_at: new Date().toISOString() },
  },
  {
    id: 12,
    name: 'Matratze',
    targets: ['Matratze'],
    frame: { max_price: 100 },
    route: { origin: 'Landsberg', destination: 'Konstanz' },
    counts: { all: 0, fit: 0, unclear: 0, no: 0 },
    newest: null,
  },
];

describe('LandingScreen', () => {
  it('lists every hunt with its fitting count, targets and where it searches', () => {
    const onOpenHunt = vi.fn();
    render(<LandingScreen hunts={hunts} onOpenHunt={onOpenHunt} onCreateHunt={vi.fn()} onOpenKept={vi.fn()} onOpenApp={vi.fn()} />);
    const first = screen.getByTestId('campaign-card-11');
    expect(first).toHaveTextContent('Supersportler');
    expect(first).toHaveTextContent('5');
    expect(first).toHaveTextContent('Honda CBR 1000 RR SC59 · Yamaha R1 RN19');
    expect(first).toHaveTextContent('Vilgertshofen');
    expect(screen.getByTestId('campaign-card-12')).toHaveTextContent('Landsberg → Konstanz');
    fireEvent.click(first);
    expect(onOpenHunt).toHaveBeenCalledWith(hunts[0]);
  });

  it('offers a new search when there is none, and says why the list could not be read', () => {
    const onCreateHunt = vi.fn();
    const { rerender } = render(<LandingScreen hunts={[]} onOpenHunt={vi.fn()} onCreateHunt={onCreateHunt} onOpenKept={vi.fn()} onOpenApp={vi.fn()} />);
    fireEvent.click(screen.getByTestId('create-campaign-empty-btn'));
    expect(onCreateHunt).toHaveBeenCalled();
    rerender(<LandingScreen hunts={[]} error="Die Suchen konnten nicht gelesen werden." onOpenHunt={vi.fn()} onCreateHunt={onCreateHunt} onOpenKept={vi.fn()} onOpenApp={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('nicht gelesen');
  });
});
