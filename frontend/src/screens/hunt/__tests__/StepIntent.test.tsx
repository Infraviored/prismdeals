import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StepIntent from '../StepIntent';

describe('StepIntent', () => {
  it('renders input with initial text and placeholder', () => {
    render(
      <StepIntent
        initialText="Laptop 32GB"
        isAnalyzing={false}
        onNext={vi.fn()}
      />
    );

    const input = screen.getByTestId('hunt-intent-input') as HTMLTextAreaElement;
    expect(input.value).toBe('Laptop 32GB');
    expect(screen.getByTestId('hunt-step1-next-btn')).not.toBeDisabled();
  });

  it('disables submit when input is empty or whitespace', () => {
    render(
      <StepIntent
        initialText="   "
        isAnalyzing={false}
        onNext={vi.fn()}
      />
    );

    const btn = screen.getByTestId('hunt-step1-next-btn');
    expect(btn).toBeDisabled();
  });

  it('triggers onNext with trimmed text on submit', () => {
    const handleNext = vi.fn();
    render(
      <StepIntent
        initialText=""
        isAnalyzing={false}
        onNext={handleNext}
      />
    );

    const input = screen.getByTestId('hunt-intent-input');
    fireEvent.change(input, { target: { value: '  ThinkPad OLED  ' } });

    const btn = screen.getByTestId('hunt-step1-next-btn');
    fireEvent.click(btn);

    expect(handleNext).toHaveBeenCalledWith('ThinkPad OLED');
  });

  it('displays analyzing state when isAnalyzing is true', () => {
    render(
      <StepIntent
        initialText="ThinkPad"
        isAnalyzing={true}
        onNext={vi.fn()}
      />
    );

    expect(screen.getByTestId('hunt-intent-analyzing')).toBeInTheDocument();
    expect(screen.getByTestId('hunt-step1-next-btn')).toBeDisabled();
  });
});
