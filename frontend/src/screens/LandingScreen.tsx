import React from 'react';
import { Plus, Settings } from 'lucide-react';
import { Bar, SearchRow, Pill, EmptyLine } from '../components/surface';
import { useTranslation } from '../hooks/useTranslation';
import { useKept } from '../hooks/useKept';
import type { HuntSummary } from '../types/hunt';
import { formatFreshness } from '../utils/freshness';
import { whereLabel } from '../utils/whereLabel';

export interface LandingScreenProps {
  hunts: HuntSummary[];
  error?: string | null;
  onOpenHunt: (hunt: HuntSummary) => void;
  onCreateHunt: () => void;
  onOpenKept: () => void;
  onOpenApp: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({ hunts, error, onOpenHunt, onCreateHunt, onOpenApp, onOpenKept }) => {
  const { t } = useTranslation();
  const { kept } = useKept();

  return (
    <div className="min-h-screen bg-[#011F1F] text-[#F2F5F4] flex flex-col w-full">
      <Bar
        title={t('surface.searches')}
        actions={
          <>
            <Pill data-testid="create-campaign-btn" icon={<Plus className="w-3.5 h-3.5" />} label={t('surface.newSearch')} onClick={onCreateHunt} />
            <Pill data-testid="open-app-btn" icon={<Settings className="w-3.5 h-3.5" />} label={t('surface.app')} onClick={onOpenApp} />
          </>
        }
      />

      <main className="w-full max-w-3xl mx-auto flex-1 flex flex-col">
        {error && <p className="px-4 py-3 text-sm text-[#E87967]" role="alert">{error}</p>}
        {hunts.map((h) => (
          <SearchRow
            key={h.id}
            id={h.id}
            name={h.name}
            // What fits: the number the results screen opens on.
            count={h.counts.fit}
            locationLabel={[h.targets.join(' · '), whereLabel(h, t)].filter(Boolean).join(' — ')}
            freshnessLabel={h.newest ? formatFreshness(h.newest.first_seen_at, t)?.label ?? null : null}
            imageUrl={h.newest?.image ?? null}
            onClick={() => onOpenHunt(h)}
          />
        ))}

        {/* Kept finds, wherever they were found. */}
        {kept.size > 0 && (
          <SearchRow
            id={-1}
            name={t('surface.kept')}
            count={kept.size}
            locationLabel={t('surface.acrossAllSearches')}
            freshnessLabel={null}
            imageUrl={null}
            onClick={onOpenKept}
          />
        )}

        {hunts.length === 0 && !error && (
          <EmptyLine
            message={t('surface.noSearches')}
            actions={<Pill data-testid="create-campaign-empty-btn" label={t('surface.newSearch')} onClick={onCreateHunt} />}
          />
        )}
      </main>
    </div>
  );
};

export default LandingScreen;
