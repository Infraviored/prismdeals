import { useTranslation } from '../hooks/useTranslation';

export interface FundeStripProps {
  total: number;
  onBack: () => void;
  onConfigure: () => void;
  onCorridor?: () => void;
  onTargets?: () => void;
  onFilter: () => void;
  onStartScrape?: () => void;
  isScraping: boolean;
  onCompare?: () => void;
  comparing: boolean;
  onKnowledge?: () => void;
}

/** The results screen's actions: a strip on the desktop, a row under the tabs on the phone. */
export function useFundeActions(p: FundeStripProps) {
  const { t } = useTranslation();
  const button = (key: string, label: string, onClick: () => void, extra = '', disabled = false, testId?: string) => (
    <button key={key} type="button" className={`edit cursor-pointer ${extra}`} onClick={onClick} disabled={disabled} data-testid={testId}>
      {label}
    </button>
  );

  const shared = (placement: string, phone: boolean) =>
    [
      p.onCorridor && button('corridor', t('surface.corridorSet'), p.onCorridor, placement),
      p.onTargets && button('targets', t('surface.models'), p.onTargets, placement, false, phone ? undefined : 'targets-btn'),
      button('filter', t('surface.filter'), p.onFilter, placement),
      p.onStartScrape &&
        button('scrape', p.isScraping ? t('surface.searching') : t('surface.fetchListings'), p.onStartScrape, placement, p.isScraping),
      // No compare button on the phone: the comparison runs after every crawl on its own.
      !phone && p.onCompare &&
        button('compare', p.comparing ? t('surface.comparing') : t('surface.compare'), p.onCompare, placement, p.comparing, 'compare-btn'),
      p.onKnowledge &&
        button('knowledge', t('surface.knowledge'), p.onKnowledge, `${placement} text-[#4E8C6A] border-[#4E8C6A]/50`, false, phone ? 'knowledge-btn-mobile' : 'knowledge-btn'),
    ].filter(Boolean);

  const strip = (
    <nav className="strip" aria-label="Navigation">
      <button type="button" data-testid="surface-bar-back" className="back" onClick={p.onBack}>
        {t('surface.allSearches')}
      </button>
      <span data-testid="surface-bar-count" className="sr-only">{p.total}</span>
      <span className="spacer" />
      {shared('hidden sm:inline-flex', false)}
      {button('configure', t('surface.editRequirements'), p.onConfigure)}
    </nav>
  );

  const phoneRow = (
    <div className="sm:hidden flex items-center gap-2 px-4 py-2 overflow-x-auto border-b border-[var(--kante)] bg-[var(--grube)] text-xs text-[var(--kalk)]">
      {shared('whitespace-nowrap', true)}
    </div>
  );

  return { strip, phoneRow };
}
