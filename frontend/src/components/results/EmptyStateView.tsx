/**
 * EmptyStateView — shown when no listings have been found yet.
 *
 * Covers two sub-states:
 *   - never_searched: corridor is set up but the scraper has never run
 *   - empty (non-crawled family): family is configured but has not crawled
 *
 * Responsibility: show a helpful icon/headline/CTA. No diagnosis logic (that
 * belongs to ZeroInRadiusView). No map, no filter bar.
 *
 * Acceptance rule: the word "corridor" only appears when a route exists.
 */
import { useTranslation } from '../../hooks/useTranslation';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import RouteCorridorMap from '../RouteCorridorMap';
import type { RouteCircle } from '../RouteCorridorMap';
import { Navigation, Layers } from 'lucide-react';
import type { SearchFamilyTerm } from '../../types';

const MAX_MODELS_SHOWN = 5;

interface EmptyStateViewProps {
  /** Terms from the search family (may be empty for plain corridor searches). */
  familyTerms: SearchFamilyTerm[];
  /** Whether the campaign has a route corridor (circles). */
  hasCorridor: boolean;
  circles: RouteCircle[];
  polyline: [number, number][];
  origin: string;
  destination: string;
  isScraping: boolean;
  onStartScrape: () => void;
  /** Whether we are in desktop layout (map is always shown alongside empty card). */
  isDesktop: boolean;
}

export default function EmptyStateView({
  familyTerms,
  hasCorridor,
  circles,
  polyline,
  origin,
  destination,
  isScraping,
  onStartScrape,
  isDesktop,
}: EmptyStateViewProps) {
  const { t } = useTranslation();

  const isFamily = familyTerms.length > 0;
  const headline = isFamily
    ? t('searchFamily.emptyHeadline')
    : t('routeResults.emptyHeadline');

  const explanation = isFamily
    ? t('searchFamily.emptyExplanation', { count: familyTerms.length })
    : t('routeResults.emptyExplanation', { count: circles.length });

  // Only show "Search corridor now" label when a corridor exists.
  const ctaLabel = isScraping
    ? t('routeResults.scrapingInProgress')
    : isFamily
    ? t('searchFamily.emptyAction')
    : hasCorridor
    ? t('routeResults.emptyAction')
    : t('routeResults.startScrape');

  const shownTerms = familyTerms.slice(0, MAX_MODELS_SHOWN);
  const overflowCount = familyTerms.length - shownTerms.length;

  return (
    <div
      className={`grid grid-cols-1 ${hasCorridor ? 'lg:grid-cols-12' : 'max-w-md mx-auto'} gap-5 items-start`}
    >
      {/* Map column — only when a corridor exists */}
      {hasCorridor && isDesktop && (
        <div className="rounded-2xl overflow-hidden lg:col-span-7 h-[420px]">
          <RouteCorridorMap
            polyline={polyline}
            circles={circles}
            listings={[]}
            selectedListingId={null}
            onSelectListing={() => {}}
            originName={origin}
            destinationName={destination}
          />
        </div>
      )}

      {/* Empty card */}
      <div className={hasCorridor && isDesktop ? 'lg:col-span-5' : 'w-full'}>
        <Card className="p-8 text-center space-y-4 border-border-subtle bg-bg-surface">
          <div className="w-12 h-12 rounded-2xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center mx-auto text-brand-accent">
            {isFamily ? (
              <Layers className="w-6 h-6" />
            ) : (
              <Navigation className="w-6 h-6" />
            )}
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base font-extrabold text-text-primary">{headline}</h3>
            <p className="text-xs text-text-muted leading-relaxed font-semibold">
              {explanation}
            </p>
          </div>

          {/* Model list — capped at MAX_MODELS_SHOWN to avoid overflow */}
          {isFamily && (
            <div className="pt-2 pb-1 text-left">
              <p className="text-2xs font-semibold text-text-muted uppercase tracking-wider mb-2 text-center">
                {t('searchFamily.configuredModels', { count: familyTerms.length })}
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center max-h-36 overflow-y-auto p-1">
                {shownTerms.map((term) => (
                  <span
                    key={term.id ?? term.term}
                    className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-bg-base/60 text-text-secondary border border-border-subtle"
                  >
                    {term.label || term.term}
                  </span>
                ))}
                {overflowCount > 0 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-bg-base/60 text-text-muted border border-border-subtle">
                    {t('routeResults.modelsOverflow', { n: overflowCount })}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="pt-3">
            <Button
              id="btn-empty-scrape"
              variant="primary"
              size="md"
              onClick={onStartScrape}
              disabled={isScraping}
              className="w-full py-3 text-base font-bold"
            >
              {ctaLabel}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
