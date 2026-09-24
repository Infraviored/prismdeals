import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { MarketPicture as MarketPictureType, ProbeRung, HuntType } from '../../types';
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react';

export interface MarketPictureProps {
  isProbing: boolean;
  rungs: ProbeRung[];
  marketPicture: MarketPictureType | null;
  error: string | null;
  selectedBudgetMax: number | null;
  effectiveLikelyCount: number;
  relaxedMusts: Set<string>;
  huntType?: HuntType;
  onRelaxMust: (mustIdOrLabel: string) => void;
  onSelectBudget: (budgetMax: number | null) => void;
  onRetry?: () => void;
  onStop?: () => void;
}

export const MarketPicture: React.FC<MarketPictureProps> = ({
  isProbing,
  rungs,
  marketPicture,
  error,
  selectedBudgetMax,
  effectiveLikelyCount,
  relaxedMusts,
  huntType = 'features',
  onRelaxMust,
  onSelectBudget,
  onRetry,
  onStop,
}) => {
  const { t } = useTranslation();

  const isExact = huntType === 'exact';
  const hasRungs = rungs.length > 0;
  const estimate = marketPicture?.estimate;
  const perBudget = marketPicture?.per_budget || [];
  const relaxList = marketPicture?.relax || [];

  return (
    <div className="w-full flex flex-col space-y-5" data-testid="market-picture-container">
      {/* 1. Hero Numbers Banner */}
      <div className="p-4 rounded-xl bg-[#00100F] border border-[#0E4A40] flex items-center justify-between shadow-sm">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8FA6A1] flex items-center gap-2 mb-1">
            <span>{t('hunt.marketHeroLikely')}</span>
            <span className="px-1.5 py-0.5 rounded bg-[#0E4A40]/80 text-[#E4D6BE] text-[10px] lowercase">
              {t('hunt.marketEstimateBadge')}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              data-testid="market-hero-likely-count"
              className="text-3xl sm:text-4xl font-bold font-mono text-[#E4D6BE] tabular-nums"
            >
              {isProbing && !marketPicture ? (
                <span className="inline-flex items-center gap-1.5 text-xl font-normal text-[#8FA6A1]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#E4D6BE]" />
                  <span>{t('hunt.marketProbing')}</span>
                </span>
              ) : (
                effectiveLikelyCount
              )}
            </span>
            {selectedBudgetMax && (
              <span className="text-xs text-[#8FA6A1] font-mono">
                (≤ {selectedBudgetMax} €)
              </span>
            )}
          </div>
        </div>

        {estimate?.median_price !== null && estimate?.median_price !== undefined && (
          <div className="text-right shrink-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8FA6A1] mb-1">
              {t('hunt.marketHeroMedian')}
            </div>
            <div
              data-testid="market-hero-median-price"
              className="text-2xl sm:text-3xl font-bold font-mono text-[#E87967] tabular-nums"
            >
              {estimate.median_price} €
            </div>
          </div>
        )}
      </div>

      {/* Probing Status / Stop Bar */}
      {isProbing && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0E4A40]/30 border border-[#0E4A40] text-xs text-[#E4D6BE]">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E4D6BE]" />
            <span>{t('hunt.marketProbing')}</span>
          </div>
          {onStop && (
            <button
              type="button"
              onClick={onStop}
              className="text-xs text-[#8FA6A1] hover:text-[#F2F5F4] transition-colors cursor-pointer"
            >
              {t('hunt.marketStop')}
            </button>
          )}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-red-950/40 border border-[#E87967]/50 text-xs text-[#E87967]">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0E4A40] text-[#E4D6BE] font-medium shrink-0 ml-2 hover:bg-[#135d50] cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{t('hunt.marketRetry')}</span>
            </button>
          )}
        </div>
      )}

      {/* 2. Budget Threshold Steps (Plan §6: ≤ 500 € 2 · ≤ 800 € 11 · ≤ 1000 € 19) */}
      {!isExact && perBudget.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8FA6A1]">
            {t('hunt.marketBudgetTitle')}
          </div>
          <div className="flex flex-wrap gap-2">
            {perBudget.map((step) => {
              const isSelected = selectedBudgetMax === step.max;
              return (
                <button
                  key={step.max}
                  type="button"
                  data-testid={`market-budget-btn-${step.max}`}
                  onClick={() => onSelectBudget(isSelected ? null : step.max)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono tabular-nums transition-colors cursor-pointer border flex items-center gap-2 ${
                    isSelected
                      ? 'bg-[#E4D6BE] text-[#011F1F] border-[#E4D6BE] font-bold shadow-sm'
                      : 'bg-[#00100F] text-[#F2F5F4] border-[#0E4A40] hover:border-[#8FA6A1]'
                  }`}
                >
                  <span>≤ {step.max} €</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[11px] ${
                      isSelected ? 'bg-[#011F1F] text-[#E4D6BE]' : 'bg-[#0E4A40] text-[#E4D6BE]'
                    }`}
                  >
                    {step.likely}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Requirement Relax Signals (Plan §6: without "32 GB": 23 at ≤ 500 € [relax]) */}
      {!isExact && relaxList.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8FA6A1]">
            {t('hunt.marketRelaxTitle')}
          </div>
          <div className="space-y-1.5">
            {relaxList.map((r) => {
              const isRelaxed = relaxedMusts.has(r.must) || relaxedMusts.has(r.label);
              return (
                <div
                  key={r.must}
                  data-testid={`market-relax-row-${r.must}`}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[#00100F] border border-[#0E4A40] text-xs gap-3"
                >
                  <span className="text-[#8FA6A1] min-w-0 truncate">
                    {t('hunt.marketRelaxWithout', {
                      label: r.label,
                      count: r.likely_without,
                    })}
                  </span>
                  {isRelaxed ? (
                    <span className="px-2 py-0.5 rounded bg-[#0E4A40]/40 text-[#8FA6A1] font-medium shrink-0">
                      {t('hunt.marketRelaxedBadge')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-testid={`market-relax-btn-${r.must}`}
                      onClick={() => onRelaxMust(r.must)}
                      className="px-2.5 py-1 rounded bg-[#0E4A40] hover:bg-[#135d50] text-[#E4D6BE] font-semibold text-xs transition-colors shrink-0 cursor-pointer"
                    >
                      {t('hunt.marketRelaxAction')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Rung Rows (Plan §6: Numbers are hero; text ≤ 1 line per row) */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8FA6A1]">
          {t('hunt.marketRungsTitle')}
        </div>

        <div className="divide-y divide-[#0E4A40]/40 rounded-xl bg-[#00100F] border border-[#0E4A40] overflow-hidden">
          {rungs.map((rung, idx) => (
            <div
              key={`${rung.term}-${idx}`}
              data-testid={`market-rung-row-${idx}`}
              className="flex items-center justify-between px-3.5 py-2.5 text-xs hover:bg-[#0E4A40]/10 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                <span className="truncate text-[#F2F5F4] font-medium font-sans">
                  {rung.label || rung.term}
                </span>
                {rung.kept ? (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0E4A40] text-[#8FA6A1] font-mono shrink-0">
                    {t('hunt.marketRungKept')}
                  </span>
                ) : (
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-950/50 text-[#E87967]/80 font-mono shrink-0">
                    {t('hunt.marketRungDropped')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0 font-mono text-xs tabular-nums text-right">
                <span className="text-[#8FA6A1]">
                  <strong className="text-[#F2F5F4] font-bold text-sm">{rung.total}</strong>{' '}
                  <span className="hidden sm:inline">{t('hunt.marketRungHits')}</span>
                </span>
                <span className="text-[#8FA6A1]/40">·</span>
                <span className="text-[#E4D6BE]">
                  <strong className="text-[#E4D6BE] font-bold text-sm">{rung.likely}</strong>{' '}
                  <span className="hidden sm:inline">{t('hunt.marketRungLikely')}</span>
                </span>
                {rung.new_likely > 0 && (
                  <>
                    <span className="text-[#8FA6A1]/40">·</span>
                    <span className="text-[#8FA6A1]">
                      <strong className="text-[#F2F5F4] font-bold text-sm">+{rung.new_likely}</strong>{' '}
                      <span className="hidden sm:inline">{t('hunt.marketRungNew')}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}

          {!hasRungs && !isProbing && (
            <div className="px-4 py-6 text-center text-xs text-[#8FA6A1] italic">
              {t('hunt.marketNoResults')}
            </div>
          )}
        </div>
      </div>

      {/* Summary Footer Line */}
      {marketPicture && (
        <div className="text-[11px] text-[#8FA6A1]/70 font-mono flex items-center justify-between pt-1">
          <span>
            {t('hunt.marketRequestsSeconds', {
              requests: marketPicture.requests,
              seconds: marketPicture.seconds,
            })}
          </span>
          {marketPicture.partial && (
            <span className="text-[#E87967]">Partial results (capped)</span>
          )}
        </div>
      )}
    </div>
  );
};

export default MarketPicture;
