import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StepHuntType from '../StepHuntType';

describe('StepHuntType', () => {
  it('renders all 7 hunt type options', () => {
    render(
      <StepHuntType
        selectedType="features"
        onSelectType={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByTestId('hunt-type-exact')).toBeInTheDocument();
    expect(screen.getByTestId('hunt-type-shortlist')).toBeInTheDocument();
    expect(screen.getByTestId('hunt-type-class')).toBeInTheDocument();
    expect(screen.getByTestId('hunt-type-features')).toBeInTheDocument();
    expect(screen.getByTestId('hunt-type-fit')).toBeInTheDocument();
    expect(screen.getByTestId('hunt-type-taste')).toBeInTheDocument();
    expect(screen.getByTestId('hunt-type-opportunity')).toBeInTheDocument();
  });

  it('calls onSelectType when a chip is clicked', () => {
    const handleSelect = vi.fn();
    render(
      <StepHuntType
        selectedType="features"
        onSelectType={handleSelect}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('hunt-type-shortlist'));
    expect(handleSelect).toHaveBeenCalledWith('shortlist');
  });

  it('triggers onNext and onBack on navigation buttons', () => {
    const handleNext = vi.fn();
    const handleBack = vi.fn();
    render(
      <StepHuntType
        selectedType="exact"
        onSelectType={vi.fn()}
        onNext={handleNext}
        onBack={handleBack}
      />
    );

    fireEvent.click(screen.getByTestId('hunt-step2-back-btn'));
    expect(handleBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('hunt-step2-next-btn'));
    expect(handleNext).toHaveBeenCalledTimes(1);
  });
});
