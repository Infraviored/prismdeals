import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { HuntType, HuntRequirement, ProposedModel } from '../../types';
import DetailsFeatures from './DetailsFeatures';
import { ArrowLeft, ArrowRight, Plus, X, Check, Loader2 } from 'lucide-react';

export interface StepDetailsProps {
  huntType: HuntType;
  models: string[];
  onChangeModels: (models: string[]) => void;
  proposedModels: ProposedModel[];
  isLoadingProposals: boolean;
  onToggleProposedModel: (index: number) => void;
  musts: HuntRequirement[];
  onChangeMusts: (musts: HuntRequirement[]) => void;
  prefs: HuntRequirement[];
  onChangePrefs: (prefs: HuntRequirement[]) => void;
  sizes: string[];
  onChangeSizes: (sizes: string[]) => void;
  styles: string[];
  onChangeStyles: (styles: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export const StepDetails: React.FC<StepDetailsProps> = ({
  huntType,
  models,
  onChangeModels,
  proposedModels,
  isLoadingProposals,
  onToggleProposedModel,
  musts,
  onChangeMusts,
  prefs,
  onChangePrefs,
  sizes,
  onChangeSizes,
  styles,
  onChangeStyles,
  onNext,
  onBack,
}) => {
  const { t } = useTranslation();
  const [inputVal, setInputVal] = useState('');

  // Shortlist handlers
  const handleAddModel = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = inputVal.trim();
    if (!val) return;
    if (!models.some((m) => m.toLowerCase() === val.toLowerCase())) {
      onChangeModels([...models, val]);
    }
    setInputVal('');
  };

  const handleRemoveModel = (idx: number) => {
    onChangeModels(models.filter((_, i) => i !== idx));
  };

  // Fit sizes handlers
  const handleAddSize = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = inputVal.trim();
    if (!val) return;
    if (!sizes.some((s) => s.toLowerCase() === val.toLowerCase())) {
      onChangeSizes([...sizes, val]);
    }
    setInputVal('');
  };

  const handleRemoveSize = (idx: number) => {
    onChangeSizes(sizes.filter((_, i) => i !== idx));
  };

  // Taste styles handlers
  const handleAddStyle = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = inputVal.trim();
    if (!val) return;
    if (!styles.some((s) => s.toLowerCase() === val.toLowerCase())) {
      onChangeStyles([...styles, val]);
    }
    setInputVal('');
  };

  const handleRemoveStyle = (idx: number) => {
    onChangeStyles(styles.filter((_, i) => i !== idx));
  };

  return (
    <div className="w-full flex flex-col space-y-6">
      <div className="space-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8FA6A1]">
          {t('hunt.step3Title')}
        </h2>
        <p className="text-xs text-[#8FA6A1]/80">
          {t('hunt.step3Subtitle')}
        </p>
      </div>

      {/* Shortlist Hunt Type */}
      {huntType === 'shortlist' && (
        <div className="space-y-4">
          <form onSubmit={handleAddModel} className="flex gap-2">
            <input
              type="text"
              data-testid="hunt-shortlist-input"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={t('hunt.shortlistAddPlaceholder')}
              className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#8FA6A1] text-sm"
            />
            <button
              type="submit"
              data-testid="hunt-shortlist-add-btn"
              disabled={!inputVal.trim()}
              className="px-3.5 py-2.5 rounded-lg bg-[#0E4A40] hover:bg-[#135d50] text-[#E4D6BE] text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {models.map((model, idx) => (
              <span
                key={model}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#00100F] border border-[#0E4A40] text-sm text-[#F2F5F4]"
              >
                <span>{model}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveModel(idx)}
                  className="hover:text-[#E87967] transition-colors p-0.5 cursor-pointer"
                  aria-label={`Remove ${model}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            {models.length === 0 && (
              <p className="text-xs text-[#8FA6A1] italic py-2">
                {t('hunt.shortlistEmpty')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Class Hunt Type */}
      {huntType === 'class' && (
        <div className="space-y-4">
          {isLoadingProposals && (
            <div className="flex items-center space-x-2 text-xs text-[#E4D6BE] py-3">
              <Loader2 className="w-4 h-4 animate-spin text-[#E4D6BE]" />
              <span>{t('hunt.classProposalsLoading')}</span>
            </div>
          )}

          {!isLoadingProposals && proposedModels.length === 0 && (
            <p className="text-xs text-[#8FA6A1] italic py-2">
              {t('hunt.classProposalsEmpty')}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {proposedModels.map((item, idx) => {
              const isChecked = item.selected !== false;
              return (
                <button
                  key={item.model}
                  type="button"
                  data-testid={`proposed-model-${idx}`}
                  onClick={() => onToggleProposedModel(idx)}
                  className={`p-3 rounded-lg border text-left flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                    isChecked
                      ? 'bg-[#00100F] border-[#E4D6BE]/70'
                      : 'bg-[#00100F]/40 border-[#0E4A40] opacity-60'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[#F2F5F4] truncate">
                      {item.model}
                    </div>
                    <div className="text-xs text-[#8FA6A1] flex items-center gap-2 mt-0.5 font-mono tabular-nums">
                      {item.years && <span>{item.years}</span>}
                      {item.total !== undefined && item.total > 0 && (
                        <span>· {item.total} {t('hunt.marketRungHits')}</span>
                      )}
                      {item.median ? <span>· ~{item.median} €</span> : null}
                    </div>
                  </div>
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 ${
                      isChecked
                        ? 'border-[#E4D6BE] bg-[#E4D6BE] text-[#011F1F]'
                        : 'border-[#0E4A40] bg-transparent'
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Features Hunt Type */}
      {huntType === 'features' && (
        <DetailsFeatures
          musts={musts}
          onChangeMusts={onChangeMusts}
          prefs={prefs}
          onChangePrefs={onChangePrefs}
        />
      )}

      {/* Fit Hunt Type */}
      {huntType === 'fit' && (
        <div className="space-y-4">
          <form onSubmit={handleAddSize} className="flex gap-2">
            <input
              type="text"
              data-testid="hunt-size-input"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={t('hunt.fitSizeAddPlaceholder')}
              className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#8FA6A1] text-sm"
            />
            <button
              type="submit"
              disabled={!inputVal.trim()}
              className="px-3.5 py-2.5 rounded-lg bg-[#0E4A40] hover:bg-[#135d50] text-[#E4D6BE] text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            {sizes.map((size, idx) => (
              <span
                key={size}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#00100F] border border-[#0E4A40] text-sm text-[#F2F5F4]"
              >
                <span>{size}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSize(idx)}
                  className="hover:text-[#E87967] transition-colors p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Taste Hunt Type */}
      {huntType === 'taste' && (
        <div className="space-y-4">
          <form onSubmit={handleAddStyle} className="flex gap-2">
            <input
              type="text"
              data-testid="hunt-style-input"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={t('hunt.tasteStyleAddPlaceholder')}
              className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#8FA6A1] text-sm"
            />
            <button
              type="submit"
              disabled={!inputVal.trim()}
              className="px-3.5 py-2.5 rounded-lg bg-[#0E4A40] hover:bg-[#135d50] text-[#E4D6BE] text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            {styles.map((style, idx) => (
              <span
                key={style}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#00100F] border border-[#0E4A40] text-sm text-[#F2F5F4]"
              >
                <span>{style}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveStyle(idx)}
                  className="hover:text-[#E87967] transition-colors p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Opportunity Hunt Type */}
      {huntType === 'opportunity' && (
        <div className="p-4 rounded-lg bg-[#00100F] border border-[#0E4A40] text-sm text-[#8FA6A1] leading-relaxed">
          {t('hunt.opportunityHint')}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          data-testid="hunt-step3-back-btn"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm text-[#8FA6A1] hover:text-[#F2F5F4] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('hunt.back')}</span>
        </button>
        <button
          type="button"
          data-testid="hunt-step3-next-btn"
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

export default StepDetails;
