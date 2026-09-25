import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StepDetails from '../StepDetails';

describe('StepDetails', () => {
  const defaultProps = {
    huntType: 'features' as const,
    models: ['ThinkPad T14'],
    onChangeModels: vi.fn(),
    proposedModels: [
      { model: 'Yamaha YZF-R1', years: '2004-2008', total: 15, median: 6500, selected: true },
      { model: 'Honda CBR1000RR', years: '2006-2010', total: 20, median: 6000, selected: false },
    ],
    isLoadingProposals: false,
    onToggleProposedModel: vi.fn(),
    musts: [{ id: 'ram', label: '32 GB' }],
    onChangeMusts: vi.fn(),
    prefs: [{ id: 'screen', label: 'OLED' }],
    onChangePrefs: vi.fn(),
    sizes: ['14 Zoll'],
    onChangeSizes: vi.fn(),
    styles: ['minimalistisch'],
    onChangeStyles: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
  };

  it('renders shortlist editor and handles adding models', () => {
    const handleModels = vi.fn();
    render(<StepDetails {...defaultProps} huntType="shortlist" onChangeModels={handleModels} />);

    expect(screen.getByText('ThinkPad T14')).toBeInTheDocument();

    const input = screen.getByTestId('hunt-shortlist-input');
    fireEvent.change(input, { target: { value: 'ThinkPad X1 Carbon' } });

    const addBtn = screen.getByTestId('hunt-shortlist-add-btn');
    fireEvent.click(addBtn);

    expect(handleModels).toHaveBeenCalledWith(['ThinkPad T14', 'ThinkPad X1 Carbon']);
  });

  it('renders class candidate proposals and handles toggling', () => {
    const handleToggle = vi.fn();
    render(
      <StepDetails
        {...defaultProps}
        huntType="class"
        onToggleProposedModel={handleToggle}
      />
    );

    expect(screen.getByText('Yamaha YZF-R1')).toBeInTheDocument();
    expect(screen.getByText('Honda CBR1000RR')).toBeInTheDocument();

    const modelBtn = screen.getByTestId('proposed-model-0');
    fireEvent.click(modelBtn);

    expect(handleToggle).toHaveBeenCalledWith(0);
  });

  it('renders features editor with musts and prefs', () => {
    const handleMusts = vi.fn();
    render(<StepDetails {...defaultProps} huntType="features" onChangeMusts={handleMusts} />);

    expect(screen.getByText('32 GB')).toBeInTheDocument();
    expect(screen.getByText('OLED')).toBeInTheDocument();

    const input = screen.getByTestId('hunt-must-input');
    fireEvent.change(input, { target: { value: 'RTX 4060' } });
    fireEvent.submit(input.closest('form')!);

    expect(handleMusts).toHaveBeenCalled();
  });

  it('renders fit sizes editor', () => {
    render(<StepDetails {...defaultProps} huntType="fit" />);
    expect(screen.getByText('14 Zoll')).toBeInTheDocument();
    expect(screen.getByTestId('hunt-size-input')).toBeInTheDocument();
  });

  it('renders taste style words editor', () => {
    render(<StepDetails {...defaultProps} huntType="taste" />);
    expect(screen.getByText('minimalistisch')).toBeInTheDocument();
    expect(screen.getByTestId('hunt-style-input')).toBeInTheDocument();
  });

  it('renders opportunity category hint', () => {
    render(<StepDetails {...defaultProps} huntType="opportunity" />);
    expect(screen.getByText(/category|Kategorie/i)).toBeInTheDocument();
  });
});
