import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConditionAdder } from '../hunt/ConditionAdder';

const zustand = {
  id: 'zustand',
  label: 'Zustand',
  type: 'enum' as const,
  unit: null,
  site_filter: null,
  options: [
    { value: 'like_new', label: 'Sehr Gut' },
    { value: 'good', label: 'Gut' },
  ],
};

describe('ConditionAdder', () => {
  it('stores the labels of picked options, as the readers do, not their site values', () => {
    const onAdd = vi.fn();
    render(<ConditionAdder attributes={[zustand]} onAdd={onAdd} />);
    fireEvent.click(screen.getByTestId('condition-add-open'));
    fireEvent.click(screen.getByRole('button', { name: 'Sehr Gut' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gut' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gut' }));
    fireEvent.click(screen.getByTestId('condition-add'));
    expect(onAdd).toHaveBeenCalledWith({ attr_id: 'zustand', label: 'Zustand', op: 'in', value: ['Sehr Gut'], importance: 'must' });
  });
});
