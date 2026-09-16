/**
 * ZeroInRadiusView — shown when `has_crawled === true` and count === 0.
 *
 * Responsibility: diagnosis card + radius-expansion options. This is the
 * "Ausweg" (way out) that the owner asked for. Nothing else renders here —
 * no map, no filter bar, no action buttons duplicated from the header.
 *
 * Acceptance rules:
 *   - "nothing found" appears exactly once (the badge is the single statement)
 *   - the ISO timestamp `last_crawled_at` is rendered as "vor 2 Stunden"
 *   - the word "Korridor" never appears here (no route info)
 *   - Family settings entry point: one link (text button next to model heading)
 */
import { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { AlertCircle, Compass, Check, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import type { RadiusDiagnosis, SearchFamilyTerm } from '../../types';

const MAX_MODELS_SHOWN = 5;

/** Convert an ISO/SQL timestamp to a human-readable "X ago" string. */
function formatAge(iso: string | null | undefined, t: (key: string, r?: Record<string, string | number>) => string): string | null {
  if (!iso) return null;
  // Accept both ISO ("2026-09-15T00:40:57Z") and SQL ("2026-09-15 00:40:57")
  const normalized = iso.replace(' ', 'T').replace(/(\d{2}:\d{2}:\d{2})$/, '$1Z');
  const ms = Date.parse(normalized);
  if (isNaN(ms)) return null;
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 60) return t('routeResults.ageSinceMinutes', { n: diffMin });
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return t('routeResults.ageSinceHours', { n: diffH });
  const diffD = Math.round(diffH / 24);
  if (diffD < 14) return t('routeResults.ageSinceDays', { n: diffD });
  return t('routeResults.ageSinceWeeks', { n: Math.round(diffD / 7) });
}

interface ZeroInRadiusViewProps {
  familyTerms: SearchFamilyTerm[];
  radiusDiagnosis: RadiusDiagnosis | null;
  diagnosing: boolean;
  diagnoseError: string | null;
  applyingRadius: number | null;
  radiusSuccessMsg: string | null;
  isScraping: boolean;
  currentRadius: number;
  locationName: string;
  lastCrawledAt: string | null | undefined;
  onDiagnose: () => void;
  onApplyRadius: (radius: number) => void;
  onStartScrape: () => void;
  /** One settings entry point — a text link next to "Checked models". */
  onEditFamily?: () => void;
}

export default function ZeroInRadiusView({
  familyTerms,
  radiusDiagnosis,
  diagnosing,
  diagnoseError,
  applyingRadius,
  radiusSuccessMsg,
  isScraping,
  currentRadius,
  locationName,
  lastCrawledAt,
  onDiagnose,
  onApplyRadius,
  onStartScrape,
  onEditFamily,
}: ZeroInRadiusViewProps) {
  const { t } = useTranslation();
  const [showTermDetails, setShowTermDetails] = useState(false);

  const ageLabel = formatAge(lastCrawledAt, t as (key: string, r?: Record<string, string | number>) => string);

  const shownTerms = familyTerms.slice(0, MAX_MODELS_SHOWN);
  const overflowCount = familyTerms.length - shownTerms.length;

  return (
    <div className="max-w-2xl mx-auto w-full space-y-5" data-testid="zero-in-radius-view">
      {/* Diagnosis / Zero-in-radius header card */}
      <Card className="p-6 sm:p-7 border-border-subtle bg-bg-surface space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Single "0 listings" statement — only one on this screen */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-status-amber/15 text-status-amber border border-status-amber/30 w-fit">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{t('searchFamily.zeroInRadiusBadge')}</span>
          </div>

          {/* Human-readable timestamp — no raw ISO string */}
          {ageLabel && (
            <span className="text-2xs font-semibold text-text-muted">{ageLabel}</span>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
            {t('searchFamily.zeroInRadiusExplanation', {
              count: familyTerms.length,
              radius: currentRadius,
              location: locationName,
            })}
          </p>
        </div>

        {/* Model chips */}
        <div className="pt-2 border-t border-border-subtle/60 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-2xs font-bold uppercase tracking-wider text-text-muted">
              {t('searchFamily.configuredModelsChecked', { count: familyTerms.length })}
            </p>
            {/* Exactly one entry point to family settings */}
            {onEditFamily && (
              <button
                type="button"
                onClick={onEditFamily}
                className="text-2xs font-semibold text-brand-accent hover:underline"
              >
                {t('searchFamily.editFamily')}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 p-1 scrollbar-thin">
            {shownTerms.map((term) => {
              const termDiag = radiusDiagnosis?.terms?.find(
                (td) => td.id === term.id || td.term === term.term
              );
              const hitCount =
                termDiag?.counts?.[String(currentRadius)] ?? (term.listings ?? 0);
              return (
                <span
                  key={term.id ?? term.term}
                  data-testid="term-chip"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-bg-input text-text-secondary border border-border-subtle"
                >
                  <span className="truncate max-w-[200px]">{term.label || term.term}</span>
                  <span
                    className={`font-mono text-2xs px-1.5 py-0.5 rounded ${
                      hitCount > 0
                        ? 'bg-brand-accent/20 text-brand-accent font-bold'
                        : 'bg-bg-surface text-text-muted border border-border-subtle'
                    }`}
                  >
                    {hitCount}
                  </span>
                </span>
              );
            })}
            {overflowCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-bg-input text-text-muted border border-border-subtle">
                {t('routeResults.modelsOverflow', { n: overflowCount })}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Radius expansion card */}
      <Card className="p-6 sm:p-7 border-border-brand/40 bg-gradient-to-br from-bg-surface to-bg-surface-hover space-y-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center text-brand-accent shrink-0 mt-0.5">
            <Compass className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-extrabold text-text-primary">
              {t('searchFamily.diagnosisCardTitle')}
            </h4>
            <p className="text-xs text-text-muted leading-relaxed">
              {t('searchFamily.diagnosisCardSubtitle')}
            </p>
          </div>
        </div>

        {radiusSuccessMsg && (
          <div className="p-3.5 bg-status-emerald/10 border border-status-emerald/30 rounded-xl text-status-emerald text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{radiusSuccessMsg}</span>
            </div>
            <Button
              variant="primary"
              size="xs"
              onClick={onStartScrape}
              disabled={isScraping}
              className="font-bold shrink-0"
            >
              {t('searchFamily.scrapeNewRadiusNow', { radius: currentRadius })}
            </Button>
          </div>
        )}

        {diagnoseError && (
          <div className="p-3 bg-status-danger/10 border border-status-danger/30 rounded-xl text-status-danger text-xs font-semibold">
            {diagnoseError}
          </div>
        )}

        {radiusDiagnosis ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {radiusDiagnosis.options.map((opt) => {
                const isCurrent = opt.radius === currentRadius;
                const isRecommended = !isCurrent && opt.radius === 200;
                return (
                  <div
                    key={opt.radius}
                    data-testid={`radius-option-${opt.radius}`}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 transition-all ${
                      isCurrent
                        ? 'bg-bg-input/60 border-border-subtle opacity-75'
                        : isRecommended
                        ? 'bg-brand-accent/10 border-brand-accent shadow-sm'
                        : 'bg-bg-surface border-border-subtle hover:border-border-brand'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text-primary">
                        {opt.radius} km
                      </span>
                      {isCurrent && (
                        <span className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-bg-surface text-text-muted border border-border-subtle">
                          {t('searchFamily.currentRadiusTag')}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-extrabold text-text-primary">
                      {opt.count === 1
                        ? t('searchFamily.listingCountSingular')
                        : t('searchFamily.listingCount', { count: opt.count })}
                    </div>
                    {!isCurrent && (
                      <Button
                        variant={isRecommended ? 'primary' : 'secondary'}
                        size="xs"
                        disabled={applyingRadius !== null || isScraping}
                        onClick={() => onApplyRadius(opt.radius)}
                        className="w-full text-2xs font-bold mt-1"
                      >
                        {applyingRadius === opt.radius
                          ? t('searchFamily.applyingRadius')
                          : t('searchFamily.selectRadiusOption', { radius: opt.radius })}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Primary CTA to best radius */}
            {radiusDiagnosis.options.some(
              (o) => o.radius > currentRadius && o.count > 0
            ) && (
              <div className="pt-1">
                {(() => {
                  const bestOpt = [...radiusDiagnosis.options]
                    .filter((o) => o.radius > currentRadius && o.count > 0)
                    .sort((a, b) => b.radius - a.radius)[0];
                  if (!bestOpt) return null;
                  return (
                    <Button
                      id="btn-apply-best-radius"
                      variant="primary"
                      size="md"
                      disabled={applyingRadius !== null || isScraping}
                      onClick={() => onApplyRadius(bestOpt.radius)}
                      className="w-full py-2.5 text-sm font-bold flex items-center justify-center gap-2"
                    >
                      {applyingRadius === bestOpt.radius
                        ? t('searchFamily.applyingRadius')
                        : t('searchFamily.applyRadiusAction', {
                            radius: bestOpt.radius,
                            count: bestOpt.count,
                          })}
                    </Button>
                  );
                })()}
              </div>
            )}

            {/* Term breakdown toggle */}
            <div className="pt-2 border-t border-border-subtle/50 flex flex-col gap-2">
              <div className="flex items-center justify-between text-2xs">
                <button
                  type="button"
                  onClick={() => setShowTermDetails((v) => !v)}
                  className="inline-flex items-center gap-1 font-semibold text-brand-accent hover:underline py-1"
                >
                  {showTermDetails ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>{t('searchFamily.hideTermBreakdown')}</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>{t('searchFamily.showTermBreakdown')}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={diagnosing}
                  onClick={onDiagnose}
                  className="inline-flex items-center gap-1 font-semibold text-text-muted hover:text-text-primary"
                >
                  <RefreshCw className={`w-3 h-3 ${diagnosing ? 'animate-spin' : ''}`} />
                  <span>{t('searchFamily.reDiagnoseRadiusBtn')}</span>
                </button>
              </div>

              {showTermDetails && radiusDiagnosis.terms && (
                <div className="mt-1 border border-border-subtle rounded-xl overflow-x-auto bg-bg-surface text-2xs">
                  <table className="w-full text-left">
                    <thead className="bg-bg-input/80 border-b border-border-subtle text-text-muted font-bold">
                      <tr>
                        <th className="p-2">{t('searchFamily.termTableHeader')}</th>
                        {radiusDiagnosis.options.map((o) => (
                          <th key={o.radius} className="p-2 text-right">
                            {o.radius} km
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle/40">
                      {radiusDiagnosis.terms.map((term) => (
                        <tr key={term.id ?? term.term} className="hover:bg-bg-surface-hover/50">
                          <td className="p-2 font-medium text-text-primary truncate max-w-[160px]">
                            {term.label || term.term}
                          </td>
                          {radiusDiagnosis.options.map((o) => {
                            const c = term.counts?.[String(o.radius)] ?? 0;
                            return (
                              <td
                                key={o.radius}
                                className={`p-2 text-right font-mono ${
                                  c > 0 ? 'text-brand-accent font-bold' : 'text-text-muted'
                                }`}
                              >
                                {c}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              id="btn-diagnose-radius"
              variant="primary"
              size="md"
              disabled={diagnosing}
              onClick={onDiagnose}
              className="w-full py-2.5 text-sm font-bold flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${diagnosing ? 'animate-spin' : ''}`} />
              <span>
                {diagnosing
                  ? t('searchFamily.diagnosingRadius')
                  : t('searchFamily.diagnoseRadiusBtn')}
              </span>
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
