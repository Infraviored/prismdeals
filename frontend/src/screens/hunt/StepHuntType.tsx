import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { HuntType } from '../../types';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

export interface StepHuntTypeProps {
  selectedType: HuntType;
  onSelectType: (type: HuntType) => void;
  onNext: () => void;
  onBack: () => void;
}

interface HuntTypeOption {
  type: HuntType;
  titleKey: 'typeExact' | 'typeShortlist' | 'typeClass' | 'typeFeatures' | 'typeFit' | 'typeTaste' | 'typeOpportunity';
  descKey: 'typeExactDesc' | 'typeShortlistDesc' | 'typeClassDesc' | 'typeFeaturesDesc' | 'typeFitDesc' | 'typeTasteDesc' | 'typeOpportunityDesc';
}

const HUNT_TYPES: HuntTypeOption[] = [
  { type: 'exact', titleKey: 'typeExact', descKey: 'typeExactDesc' },
  { type: 'shortlist', titleKey: 'typeShortlist', descKey: 'typeShortlistDesc' },
  { type: 'class', titleKey: 'typeClass', descKey: 'typeClassDesc' },
  { type: 'features', titleKey: 'typeFeatures', descKey: 'typeFeaturesDesc' },
  { type: 'fit', titleKey: 'typeFit', descKey: 'typeFitDesc' },
  { type: 'taste', titleKey: 'typeTaste', descKey: 'typeTasteDesc' },
  { type: 'opportunity', titleKey: 'typeOpportunity', descKey: 'typeOpportunityDesc' },
];

export const StepHuntType: React.FC<StepHuntTypeProps> = ({
  selectedType,
  onSelectType,
  onNext,
  onBack,
}) => {
  const { t } = useTranslation();

  return (
    <div className="w-full flex flex-col space-y-6">
      <div className="space-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8FA6A1]">
          {t('hunt.step2Title')}
        </h2>
        <p className="text-xs text-[#8FA6A1]/80">
          {t('hunt.step2Subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {HUNT_TYPES.map((opt) => {
          const isSelected = selectedType === opt.type;
          return (
            <button
              key={opt.type}
              type="button"
              data-testid={`hunt-type-${opt.type}`}
              onClick={() => onSelectType(opt.type)}
              className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer flex items-start justify-between gap-3 ${
                isSelected
                  ? 'bg-[#00100F] border-[#E4D6BE] ring-1 ring-[#E4D6BE]/40 shadow-sm'
                  : 'bg-[#00100F]/60 border-[#0E4A40] hover:border-[#8FA6A1]/60'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm font-semibold mb-1 ${
                    isSelected ? 'text-[#E4D6BE]' : 'text-[#F2F5F4]'
                  }`}
                >
                  {t(`hunt.${opt.titleKey}`)}
                </div>
                <div className="text-xs text-[#8FA6A1] leading-relaxed">
                  {t(`hunt.${opt.descKey}`)}
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                  isSelected
                    ? 'border-[#E4D6BE] bg-[#E4D6BE] text-[#011F1F]'
                    : 'border-[#0E4A40] bg-transparent'
                }`}
              >
                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          data-testid="hunt-step2-back-btn"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-[#8FA6A1] hover:text-[#F2F5F4] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('hunt.back')}</span>
        </button>
        <button
          type="button"
          data-testid="hunt-step2-next-btn"
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

export default StepHuntType;
