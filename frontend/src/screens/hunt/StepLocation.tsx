import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import PlaceInput, { type Place } from '../../components/PlaceInput';
import { RadiusChoice } from '../../components/RadiusChoice';
import { MaxPriceField } from '../../components/MaxPriceField';
import CategoryFilters from '../../components/CategoryFilters';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export interface StepLocationProps {
  place: Place | null;
  locationId: string | null;
  radius: number | null;
  maxPrice: number | null;
  categoryId: string | null;
  attributes: string[];
  intentQuery: string;
  /** Named models: each becomes its own search with the filters below. */
  models?: string[];
  onPlaceChange: (place: Place | null) => void;
  onRadiusChange: (radius: number | null) => void;
  onMaxPriceChange: (price: number | null) => void;
  onCategoryChange: (catId: string | null) => void;
  onAttributesChange: (attrs: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export const StepLocation: React.FC<StepLocationProps> = ({
  place,
  locationId,
  radius,
  maxPrice,
  categoryId,
  attributes,
  intentQuery,
  models = [],
  onPlaceChange,
  onRadiusChange,
  onMaxPriceChange,
  onCategoryChange,
  onAttributesChange,
  onNext,
  onBack,
}) => {
  const { t } = useTranslation();

  return (
    <div className="w-full flex flex-col space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[#F2F5F4]">
          {t('hunt.step4Title')}
        </h2>
        <p className="text-xs text-[#8FA6A1]/80">
          {t('hunt.step4Subtitle')}
        </p>
      </div>

      <div className="space-y-5">
        {/* Location */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[#8FA6A1]">
            {t('surface.where')}
          </label>
          <PlaceInput
            label=""
            placeholder={t('surface.wherePlaceholder')}
            value={place}
            onChange={onPlaceChange}
            emptyHint={t('common.routeNoMatches')}
          />
        </div>

        {/* Radius */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[#8FA6A1]">
            {t('surface.howFar')}
          </label>
          <RadiusChoice
            hasPlace={Boolean(place || locationId)}
            radius={radius}
            onChange={onRadiusChange}
          />
        </div>

        {/* Max Price */}
        <div className="space-y-2">
          <label htmlFor="hunt-max-price" className="block text-xs font-medium text-[#8FA6A1]">
            {t('surface.maxPrice')}
          </label>
          <MaxPriceField value={maxPrice} onChange={onMaxPriceChange} />
        </div>

        {/* Several models: the filters go into every model's search, and a
            brand filter would empty the search of the other brand. */}
        {models.length > 1 && (
          <p data-testid="hunt-filters-apply-to-all" className="text-sm text-[#8FA6A1]">
            {t('hunt.filtersApplyToAll', { models: models.join(', ') })}
          </p>
        )}
        <CategoryFilters
          hideFilter={models.length > 1 ? key => /\.(marke|brand|model|modell)_s$/.test(key) : undefined}
          categoryId={categoryId}
          attributes={attributes}
          term={intentQuery}
          onCategoryChange={onCategoryChange}
          onAttributesChange={onAttributesChange}
        />
      </div>

      <div className="flex items-center justify-between pt-4">
        <button
          type="button"
          data-testid="hunt-step4-back-btn"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-[#8FA6A1] hover:text-[#F2F5F4] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('hunt.back')}</span>
        </button>
        <button
          type="button"
          data-testid="hunt-step4-next-btn"
          onClick={onNext}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#E4D6BE] text-[#011F1F] hover:bg-[#d8c8af] transition-colors cursor-pointer"
        >
          <span>{t('hunt.next')}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default StepLocation;
