/**
 * MapPane — the map column of the results view.
 *
 * Responsibility: render the route corridor map and, on mobile, the floating
 * card for the selected listing. Nothing else.
 */
import { useTranslation } from '../../hooks/useTranslation';
import RouteCorridorMap from '../RouteCorridorMap';
import type { RouteCircle, RouteListingGeo } from '../RouteCorridorMap';
import { X } from 'lucide-react';

interface RouteGeometry {
  polyline: [number, number][];
  circles: RouteCircle[];
  origin: string;
  destination: string;
}

interface MapPaneProps {
  geometry: RouteGeometry;
  listings: RouteListingGeo[];
  selectedListingId: string | null;
  onSelectListing: (id: string | null) => void;
  isDesktop: boolean;
}

function formatLocation(loc: string | null | undefined): string {
  if (!loc) return '';
  const dashIndex = loc.indexOf(' - ');
  if (dashIndex !== -1) return loc.slice(dashIndex + 3).trim();
  return loc;
}

export default function MapPane({
  geometry,
  listings,
  selectedListingId,
  onSelectListing,
  isDesktop,
}: MapPaneProps) {
  const { t } = useTranslation();
  const selectedListing = selectedListingId
    ? listings.find((l) => l.id === selectedListingId) ?? null
    : null;

  return (
    <div
      className={`w-full relative ${
        isDesktop
          ? 'lg:col-span-6 xl:col-span-7 h-[calc(100vh-250px)] lg:sticky lg:top-20 z-10'
          : 'h-[calc(100vh-280px)] min-h-[460px]'
      }`}
    >
      <RouteCorridorMap
        polyline={geometry.polyline}
        circles={geometry.circles}
        listings={listings}
        selectedListingId={selectedListingId}
        onSelectListing={(id: string) => onSelectListing(id)}
        originName={geometry.origin}
        destinationName={geometry.destination}
      />

      {/* Floating card for the selected listing on mobile */}
      {!isDesktop && selectedListing && (
        <div className="absolute bottom-4 left-3 right-3 z-[500] animate-fadeIn">
          <div className="bg-bg-surface/95 backdrop-blur-md p-3 rounded-2xl border border-border-brand shadow-2xl flex items-center gap-3">
            {selectedListing.images && selectedListing.images.length > 0 ? (
              <img
                src={selectedListing.images[0]}
                alt={selectedListing.title}
                className="w-14 h-14 rounded-xl object-cover shrink-0 border border-border-subtle bg-bg-input"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl shrink-0 border border-border-subtle bg-bg-input flex items-center justify-center text-text-muted text-2xs">
                {t('common.noImage')}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-brand-accent font-mono">
                  {selectedListing.detour_min !== null
                    ? selectedListing.detour_min < 1
                      ? t('routeResults.onRouteShort')
                      : `+${Math.round(selectedListing.detour_min)}m`
                    : ''}
                </span>
                <span className="text-xs font-semibold text-text-secondary font-mono">
                  {selectedListing.price}
                </span>
              </div>
              <h4 className="text-xs font-bold text-text-primary line-clamp-2 mt-0.5 leading-snug">
                {selectedListing.title}
              </h4>
              {selectedListing.matched_terms && selectedListing.matched_terms.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedListing.matched_terms.map((mt) => (
                    <span
                      key={mt.id}
                      className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-brand-accent/15 text-brand-accent border border-border-brand truncate max-w-[160px]"
                    >
                      {mt.label}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-2xs text-text-muted truncate mt-0.5">
                {formatLocation(selectedListing.location)}
                {selectedListing.offroute_km !== null ? ` · ${selectedListing.offroute_km.toFixed(1)} km` : ''}
              </p>
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectListing(null);
                }}
                className="p-1 text-text-muted hover:text-text-primary rounded-lg"
                aria-label={t('routeResults.closeCard')}
              >
                <X className="w-4 h-4" />
              </button>
              <a
                href={selectedListing.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 text-2xs font-bold rounded-lg bg-brand-accent text-white shadow hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                {t('routeResults.viewOnPlatform')} ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
