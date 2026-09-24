import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { MarketPicture as MarketPictureType, ProbeRung, HuntType } from '../../types';
import { Loader2 } from 'lucide-react';
import MarketTerms from './MarketTerms';

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

/**
 * What the market holds for this hunt, before anything is saved.
 *
 * Two numbers lead: offers whose title already shows they fit, and offers
 * nothing rules out yet -- for RAM or a wardrobe the second is nearly all of
 * it, because clock, latency and width are rarely in a title. The usual price
 * sits beside them in the body colour; coral stays reserved for a deal.
 */
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
  const estimate = marketPicture?.estimate;
  const perBudget = marketPicture?.per_budget || [];
  const relaxList = huntType === 'exact' ? [] : marketPicture?.relax || [];
  const selectedStep = perBudget.find(step => step.max === selectedBudgetMax);
  const openCount = selectedStep ? (selectedStep.unclear ?? 0) : (estimate?.union_unclear ?? 0);

  return (
    <div className="w-full flex flex-col gap-5" data-testid="market-picture-container">
      <section className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-5">
          <div>
            <div data-testid="market-hero-likely-count" className="num text-4xl leading-none text-[#E4D6BE]">
              {isProbing && !marketPicture ? (
                <Loader2 className="w-6 h-6 animate-spin text-[#8FA6A1]" />
              ) : (
                effectiveLikelyCount.toLocaleString('de-DE')
              )}
            </div>
            <div className="mt-1 text-xs text-[#8FA6A1]">{t('hunt.marketHeroLikely')}</div>
          </div>
          <div>
            <div data-testid="market-hero-open-count" className="num text-2xl leading-none text-[#F2F5F4]">
              {marketPicture ? openCount.toLocaleString('de-DE') : '–'}
            </div>
            <div className="mt-1 text-xs text-[#8FA6A1]">{t('hunt.marketHeroOpen')}</div>
          </div>
        </div>
        {estimate?.median_price != null && (
          <div className="text-right">
            <div data-testid="market-hero-median-price" className="num text-2xl leading-none text-[#F2F5F4]">
              {estimate.median_price} €
            </div>
            <div className="mt-1 text-xs text-[#8FA6A1]">{t('hunt.marketHeroMedian')}</div>
          </div>
        )}
      </section>

      <p className="text-xs text-[#8FA6A1] -mt-2">
        {selectedBudgetMax ? t('hunt.marketUpTo', { max: selectedBudgetMax }) + ' · ' : ''}
        {t('hunt.marketEstimateNote')}
      </p>

      {isProbing && (
        <div className="flex items-center justify-between text-xs text-[#8FA6A1]">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('hunt.marketProbing')}
          </span>
          {onStop && (
            <button type="button" onClick={onStop} className="hover:text-[#F2F5F4] cursor-pointer">
              {t('hunt.marketStop')}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 text-sm text-[#F2F5F4]">
          <span className="min-w-0">{error}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="shrink-0 underline text-[#E4D6BE] cursor-pointer">
              {t('hunt.marketRetry')}
            </button>
          )}
        </div>
      )}

      {perBudget.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-xs text-[#8FA6A1]">{t('hunt.marketBudgetTitle')}</h3>
          <div className="flex flex-wrap gap-2">
            {perBudget.map(step => {
              const on = selectedBudgetMax === step.max;
              return (
                <button
                  key={step.max}
                  type="button"
                  data-testid={`market-budget-btn-${step.max}`}
                  aria-pressed={on}
                  onClick={() => onSelectBudget(on ? null : step.max)}
                  className={`px-3 py-1.5 rounded border text-sm cursor-pointer transition-colors [font-variant-numeric:tabular-nums] ${
                    on
                      ? 'bg-[#E4D6BE] text-[#011F1F] border-[#E4D6BE]'
                      : 'bg-transparent text-[#F2F5F4] border-[#0E4A40] hover:border-[#8FA6A1]'
                  }`}
                >
                  {t('hunt.marketBudgetStep', {
                    max: step.max,
                    likely: step.likely,
                    open: step.unclear ?? 0,
                  })}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {relaxList.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-xs text-[#8FA6A1]">{t('hunt.marketRelaxTitle')}</h3>
          {relaxList.map(r => {
            const relaxed = relaxedMusts.has(r.must) || relaxedMusts.has(r.label);
            return (
              <div
                key={r.must}
                data-testid={`market-relax-row-${r.must}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 text-[#F2F5F4]">
                  {t('hunt.marketRelaxWithout', { label: r.label, count: r.likely_without })}
                </span>
                {relaxed ? (
                  <span className="shrink-0 text-xs text-[#8FA6A1]">{t('hunt.marketRelaxedBadge')}</span>
                ) : (
                  <button
                    type="button"
                    data-testid={`market-relax-btn-${r.must}`}
                    onClick={() => onRelaxMust(r.must)}
                    className="shrink-0 px-2.5 py-1 rounded border border-[#0E4A40] text-xs text-[#E4D6BE] hover:border-[#8FA6A1] cursor-pointer"
                  >
                    {t('hunt.marketRelaxAction')}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      <MarketTerms rungs={rungs} isProbing={isProbing} />

      {marketPicture && (
        <p className="text-xs text-[#8FA6A1]/80">
          {t('hunt.marketRequestsSeconds', {
            requests: marketPicture.requests,
            seconds: Math.round(marketPicture.seconds),
          })}
          {marketPicture.partial ? ` · ${t('hunt.marketPartial')}` : ''}
        </p>
      )}
    </div>
  );
};

export default MarketPicture;
