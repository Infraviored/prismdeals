import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ConditionList } from '../hunt/ConditionList';
import { ConditionAdder } from '../hunt/ConditionAdder';
import { HuntEditor } from '../hunt/HuntEditor';
import { huntDoc } from '../../test/huntFixtures';

const abs = { id: 'abs', label: 'ABS', type: 'boolean' as const, unit: null, options: null, site_filter: null };

describe('how much a wish counts', () => {
  it('a wish carries a weight from "bothers a lot" to "important"; a must has none to set', () => {
    const onChange = vi.fn();
    render(
      <ConditionList
        attributes={[abs]}
        onChange={onChange}
        conditions={[
          { id: 1, attr_id: 'abs', label: 'ABS', op: 'present', value: null, importance: 'wish', weight: 2 },
          { id: 2, attr_id: 'abs', label: 'Unfall', op: 'absent', value: null, importance: 'must', weight: 0 },
        ]}
      />
    );
    const controls = screen.getAllByTestId('weight-control');
    expect(controls).toHaveLength(1);
    expect(within(controls[0]).getByRole('button', { name: 'wanted' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(controls[0]).getByRole('button', { name: 'bothers a lot' }));
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ label: 'ABS', importance: 'wish', weight: -3 });
    fireEvent.click(within(controls[0]).getByRole('button', { name: 'only show' }));
    expect(onChange.mock.calls[1][0][0].weight).toBe(0);
  });

  it('a new wish is added with the weight chosen for it', () => {
    const onAdd = vi.fn();
    render(<ConditionAdder attributes={[abs]} onAdd={onAdd} />);
    fireEvent.click(screen.getByTestId('condition-add-open'));
    fireEvent.click(screen.getByRole('button', { name: 'Wish' }));
    fireEvent.click(screen.getByRole('button', { name: 'important' }));
    fireEvent.click(screen.getByTestId('condition-add'));
    expect(onAdd).toHaveBeenCalledWith({ attr_id: 'abs', label: 'ABS', op: 'present', value: null, importance: 'wish', weight: 3 });
  });
});

describe('preference among targets', () => {
  it('no stars for a hunt with one target', () => {
    const doc = huntDoc();
    render(<HuntEditor doc={{ ...doc, targets: [doc.targets[0]] }} onChange={vi.fn()} />);
    expect(screen.queryByTestId('target-stars')).toBeNull();
  });

  it('stars per target when there are two; the chosen star again clears it', () => {
    const onChange = vi.fn();
    const doc = huntDoc();
    doc.targets[1].weight = 2;
    render(<HuntEditor doc={doc} onChange={onChange} />);
    const stars = screen.getAllByTestId('target-stars');
    expect(stars).toHaveLength(2);
    fireEvent.click(within(stars[0]).getByRole('button', { name: 'Preference 3 of 3' }));
    expect(onChange.mock.calls[0][0].targets.map((t: { weight?: number }) => t.weight)).toEqual([3, 2]);
    fireEvent.click(within(stars[1]).getByRole('button', { name: 'Preference 2 of 3' }));
    expect(onChange.mock.calls[1][0].targets[1].weight).toBe(0);
  });
});
