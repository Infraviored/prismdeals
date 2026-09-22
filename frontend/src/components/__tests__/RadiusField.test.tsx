import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadiusField } from '../RadiusField';

describe('RadiusField', () => {
  it('shows the clamped value, not the rejected one', () => {
    // At the maximum, clamping produces the value the parent already holds, so
    // onChange is a no-op and the resync effect never fires. The box kept
    // reading 999 while the search saved at 200.
    const onChange = vi.fn();
    render(<RadiusField value={200} onChange={onChange} />);

    const box = screen.getByRole('spinbutton');
    fireEvent.change(box, { target: { value: '999' } });
    fireEvent.blur(box);

    expect(box).toHaveValue(200);
  });

  it('clamps upwards at the low end too', () => {
    const onChange = vi.fn();
    render(<RadiusField value={2} onChange={onChange} />);
    const box = screen.getByRole('spinbutton');
    fireEvent.change(box, { target: { value: '0' } });
    fireEvent.blur(box);
    expect(box).toHaveValue(2);
  });

  it('passes a value inside the range straight through', () => {
    const onChange = vi.fn();
    render(<RadiusField value={30} onChange={onChange} />);
    const box = screen.getByRole('spinbutton');
    fireEvent.change(box, { target: { value: '57' } });
    fireEvent.blur(box);
    expect(onChange).toHaveBeenCalledWith(57);
  });

  it('restores the current value when the field is left unreadable', () => {
    render(<RadiusField value={30} onChange={vi.fn()} />);
    const box = screen.getByRole('spinbutton');
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.blur(box);
    expect(box).toHaveValue(30);
  });
});
