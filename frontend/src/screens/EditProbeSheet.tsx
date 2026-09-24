import React, { useEffect } from 'react';
import { Sheet } from '../components/surface';
import { useTranslation } from '../hooks/useTranslation';
import { useProbe } from '../hooks/useProbe';
import MarketPicture from './hunt/MarketPicture';
import type { SearchFamilyTerm } from '../types';

export interface EditProbeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  terms: SearchFamilyTerm[];
  locationId: string | null;
  radius: number | null;
  maxPrice: number | null;
  categoryId: string | null;
}

export const EditProbeSheet: React.FC<EditProbeSheetProps> = ({
  isOpen,
  onClose,
  terms,
  locationId,
  radius,
  maxPrice,
  categoryId,
}) => {
  const { t } = useTranslation();
  const probe = useProbe();

  const handleLaunch = () => {
    const activeTerms = terms
      .filter((t) => t.enabled !== false)
      .map((t) => t.term || t.label);

    const payload = {
      category_code: categoryId ? `c${categoryId}` : null,
      location_id: locationId,
      radius_km: radius,
      price: maxPrice ? { min: null, max: maxPrice } : undefined,
      hunt_type: 'features',
      seed_terms: activeTerms,
      budget_steps: maxPrice
        ? [Math.round(maxPrice * 0.5), Math.round(maxPrice * 0.8), maxPrice]
        : undefined,
    };

    probe.startProbe(payload);
  };

  useEffect(() => {
    if (isOpen) {
      handleLaunch();
    } else {
      probe.stopProbe();
    }
  }, [isOpen]);

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('hunt.probeAgain')}
      side="right"
      className="w-full max-w-lg"
    >
      <div className="p-4 sm:p-6 overflow-y-auto">
        <MarketPicture
          isProbing={probe.isProbing}
          rungs={probe.rungs}
          marketPicture={probe.marketPicture}
          error={probe.error}
          selectedBudgetMax={probe.selectedBudgetMax}
          effectiveLikelyCount={probe.effectiveLikelyCount}
          relaxedMusts={probe.relaxedMusts}
          onRelaxMust={probe.relaxMust}
          onSelectBudget={probe.selectBudget}
          onRetry={handleLaunch}
          onStop={probe.stopProbe}
        />
      </div>
    </Sheet>
  );
};

export default EditProbeSheet;
