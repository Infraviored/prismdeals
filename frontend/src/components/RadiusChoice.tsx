import React from 'react';
import { RadiusField } from './RadiusField';
import { useTranslation } from '../hooks/useTranslation';

export interface RadiusChoiceProps {
  /** Whether a place is set. A radius means nothing without one. */
  hasPlace: boolean;
  /** null: no limit. */
  radius: number | null;
  onChange: (radius: number | null) => void;
}

/** How far to search around a place, and whether to limit it at all.
 *
 * No limit until the buyer chooses one. A preset 30 km on a search without a
 * place was a limit nobody set, and it narrowed the hunt silently.
 */
export const RadiusChoice: React.FC<RadiusChoiceProps> = ({ hasPlace, radius, onChange }) => {
  const { t } = useTranslation();

  if (!hasPlace) {
    return <p className="text-sm text-[#8FA6A1]">{t('surface.radiusNoPlace')}</p>;
  }

  const option = (checked: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={`px-3 py-1.5 rounded border text-sm cursor-pointer transition-colors ${
        checked ? 'border-[#E4D6BE] text-[#F2F5F4]' : 'border-[#0E4A40] text-[#8FA6A1] hover:border-[#8FA6A1]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="radiogroup" aria-label={t('surface.howFar')}>
        {option(radius === null, t('surface.radiusUnlimited'), () => onChange(null))}
        {option(radius !== null, t('surface.radiusLimited'), () => onChange(radius ?? 50))}
      </div>
      {radius !== null && <RadiusField value={radius} onChange={onChange} />}
    </div>
  );
};

export default RadiusChoice;
