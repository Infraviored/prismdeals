import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';

const WEIGHTS = [-3, -2, -1, 0, 1, 2, 3] as const;

/** "-3" .. "+3" read as what they mean to the buyer. */
const MEANING: Record<number, string> = {
  [-3]: 'weightMinus3',
  [-2]: 'weightMinus2',
  [-1]: 'weightMinus1',
  0: 'weight0',
  1: 'weightPlus1',
  2: 'weightPlus2',
  3: 'weightPlus3',
};

export interface WeightControlProps {
  weight: number;
  onChange: (weight: number) => void;
}

/** How much a wish counts: from "bothers a lot" (−3) over "only show" (0) to
 * "important" (+3). Seven narrow steps and the meaning of the chosen one, on
 * one line of a phone. */
export const WeightControl: React.FC<WeightControlProps> = ({ weight, onChange }) => {
  const { t } = useTranslation();
  const meaning = (w: number) => t(`huntEdit.${MEANING[w]}` as 'huntEdit.weight0');
  return (
    <div className="weight" role="group" aria-label={t('huntEdit.weight')} data-testid="weight-control">
      <span className="steps">
        {WEIGHTS.map((w) => (
          <button
            key={w}
            type="button"
            className={`step ${w < 0 ? 'minus' : w > 0 ? 'plus' : 'zero'}`}
            aria-pressed={w === weight}
            aria-label={meaning(w)}
            title={meaning(w)}
            onClick={() => onChange(w)}
          >
            {w > 0 ? `+${w}` : w < 0 ? `−${-w}` : '0'}
          </button>
        ))}
      </span>
      <span className={`meaning ${weight < 0 ? 'minus' : weight > 0 ? 'plus' : 'zero'}`}>{meaning(weight)}</span>
    </div>
  );
};

export default WeightControl;
