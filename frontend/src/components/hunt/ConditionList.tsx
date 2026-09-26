import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { Attribute, Condition } from '../../types/hunt';
import { conditionText } from '../../utils/huntDoc';
import { ConditionAdder } from './ConditionAdder';
import { choice, DEFAULT_WISH_WEIGHT } from './choice';
import { WeightControl } from './WeightControl';

export interface ConditionListProps {
  conditions: Condition[];
  attributes: Attribute[];
  onChange: (conditions: Condition[]) => void;
  emptyText?: string;
}

/** The conditions of one target (or of all): must or wish, how much a wish
 * counts, removable, addable. */
export const ConditionList: React.FC<ConditionListProps> = ({ conditions, attributes, onChange, emptyText }) => {
  const { t } = useTranslation();
  const byId = new Map(attributes.map((a) => [a.id, a]));

  return (
    <div className="flex flex-col gap-2">
      {conditions.length === 0 && emptyText && <p className="text-sm text-[#8FA6A1]">{emptyText}</p>}
      {conditions.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {conditions.map((c, i) => {
            const update = (patch: Partial<Condition>) => onChange(conditions.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <li key={`${c.id ?? 'new'}-${i}`} className="flex flex-col gap-1" data-testid="condition-row">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-sm text-[#F2F5F4]">
                    {conditionText(c, t, c.attr_id ? byId.get(c.attr_id) : undefined)}
                  </span>
                  <button
                    type="button"
                    className={choice(c.importance === 'must')}
                    title={t('huntEdit.importanceToggle')}
                    onClick={() =>
                      // Back to a wish: the weight it had, or the default -- never a silent 0.
                      update(c.importance === 'must' ? { importance: 'wish', weight: c.weight || DEFAULT_WISH_WEIGHT } : { importance: 'must' })
                    }
                  >
                    {c.importance === 'must' ? t('huntEdit.must') : t('huntEdit.wish')}
                  </button>
                  <button
                    type="button"
                    aria-label={t('huntEdit.remove')}
                    onClick={() => onChange(conditions.filter((_, j) => j !== i))}
                    className="px-1.5 text-sm text-[#8FA6A1] hover:text-[#E87967] cursor-pointer"
                  >
                    ×
                  </button>
                </div>
                {c.importance === 'wish' && (
                  <WeightControl weight={c.weight ?? DEFAULT_WISH_WEIGHT} onChange={(weight) => update({ weight })} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConditionAdder attributes={attributes} onAdd={(c) => onChange([...conditions, c])} />
    </div>
  );
};

export default ConditionList;
