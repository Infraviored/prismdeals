import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StepLocation from '../StepLocation';

describe('StepLocation', () => {
  const defaultProps = {
    place: {
      name: 'München',
      label: 'München (80331)',
      qualifier: '',
      state: 'Bayern',
      postal_code: '80331',
      lat: 48.13,
      lon: 11.58,
    },
    locationId: '6441',
    radius: 30,
    maxPrice: 800,
    categoryId: '278',
    attributes: [],
    intentQuery: 'ThinkPad',
    onPlaceChange: vi.fn(),
    onRadiusChange: vi.fn(),
    onMaxPriceChange: vi.fn(),
    onCategoryChange: vi.fn(),
    onAttributesChange: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
  };

  it('renders location, radius, and max price controls', () => {
    render(<StepLocation {...defaultProps} />);

    expect(screen.getByDisplayValue('München (80331)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('800')).toBeInTheDocument();
    expect(screen.getByTestId('hunt-step4-next-btn')).toBeInTheDocument();
  });

  it('triggers onNext and onBack callbacks on button click', () => {
    const handleNext = vi.fn();
    const handleBack = vi.fn();
    render(<StepLocation {...defaultProps} onNext={handleNext} onBack={handleBack} />);

    fireEvent.click(screen.getByTestId('hunt-step4-back-btn'));
    expect(handleBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('hunt-step4-next-btn'));
    expect(handleNext).toHaveBeenCalledTimes(1);
  });
});
