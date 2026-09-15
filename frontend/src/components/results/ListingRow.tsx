/**
 * ListingRow — one row in the results list.
 *
 * Responsibility: render exactly one listing entry. No state, no fetch.
 * All decisions about visibility or ordering happen in the parent.
 */
import { useTranslation } from '../../hooks/useTranslation';
import type { RouteListingGeo } from '../RouteCorridorMap';
import { cn } from '../../utils/cn';

interface ListingRowProps {
  listing: RouteListingGeo;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function formatLocation(loc: string | null | undefined): string {
  if (!loc) return '';
  const dashIndex = loc.indexOf(' - ');
  if (dashIndex !== -1) return loc.slice(dashIndex + 3).trim();
  return loc;
}

export default function ListingRow({ listing: l, isSelected, onSelect }: ListingRowProps) {
  const { t } = useTranslation();
  const firstImg = l.images && l.images.length > 0 ? l.images[0] : null;

  return (
    <a
      key={l.id}
      href={l.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onSelect(l.id)}
      className={cn(
        'group min-h-[76px] p-2.5 sm:p-3 rounded-2xl border transition-all flex items-center gap-3 cursor-pointer no-underline',
        isSelected
          ? 'bg-bg-surface-hover border-border-brand ring-1 ring-border-brand shadow-lg'
          : 'bg-bg-surface border-border-subtle hover:bg-bg-surface-hover hover:border-border-brand'
      )}
    >
      {/* 56 px Thumbnail */}
      {firstImg ? (
        <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-border-subtle bg-bg-input">
          <img
            src={firstImg}
            alt={l.title}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="w-14 h-14 rounded-xl shrink-0 border border-border-subtle bg-bg-input flex items-center justify-center text-text-muted font-mono text-2xs">
          {t('common.noImage')}
        </div>
      )}

      {/* Title + matched-model badge + location */}
      <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
        <h3 className="text-sm font-semibold text-text-primary line-clamp-2 group-hover:text-brand-accent transition-colors leading-snug break-words">
          {l.title}
        </h3>

        {l.matched_terms && l.matched_terms.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {l.matched_terms.map((mt) => (
              <span
                key={mt.id}
                data-testid="matched-term-badge"
                className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-brand-accent/15 text-brand-accent border border-border-brand truncate max-w-[200px]"
                title={mt.label}
              >
                {mt.label}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-2xs text-text-muted truncate mt-1">
          <span className="truncate">{formatLocation(l.location)}</span>
          {l.offroute_km !== null && (
            <span className="font-mono text-text-muted shrink-0">
              · {l.offroute_km.toFixed(1)} km
            </span>
          )}
          {l.llm_processed && l.niceness_score !== null && (
            <span className="font-mono font-bold text-text-secondary bg-bg-input border border-border-subtle px-1.5 py-0.5 rounded text-2xs shrink-0 ml-1">
              ★ {l.niceness_score}
            </span>
          )}
        </div>
      </div>

      {/* Detour + price column */}
      <div className="shrink-0 flex flex-col items-end justify-center text-right pl-1 min-w-[52px]">
        {l.detour_min !== null ? (
          l.detour_min < 1 ? (
            <span className="text-xs font-bold text-brand-accent font-mono leading-none">
              {t('routeResults.onRouteShort')}
            </span>
          ) : (
            <span className="text-base font-extrabold text-brand-accent font-mono tracking-tight leading-none">
              +{Math.round(l.detour_min)}m
            </span>
          )
        ) : (
          <span className="text-2xs text-text-muted font-mono leading-none">
            {l.geo_status === 'too_far'
              ? t('routeResults.offCorridor')
              : l.geo_status === 'failed'
                ? t('routeResults.detourUnknown')
                : t('routeResults.noCoordinates')}
          </span>
        )}

        <span className="text-sm font-semibold text-text-secondary font-mono mt-1 leading-none">
          {l.price?.trim() || t('routeResults.noPrice')}
        </span>
      </div>
    </a>
  );
}
