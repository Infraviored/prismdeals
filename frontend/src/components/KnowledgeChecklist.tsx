import React, { useEffect, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import type { Knowledge } from '../types/hunt';
import { KnowledgeCard } from './KnowledgeCard';

export interface KnowledgeChecklistProps {
  listingId: string | number;
}

/** What is known about the listing's product, to check before buying. */
export const KnowledgeChecklist: React.FC<KnowledgeChecklistProps> = ({ listingId }) => {
  const { t } = useTranslation();
  const [known, setKnown] = useState<{ node: string | null; knowledge: Knowledge[] } | null>(null);

  useEffect(() => {
    let active = true;
    if (!listingId) return;
    fetch(`/api/listings/${listingId}/knowledge`)
      .then((res) => (res && res.ok ? res.json() : null))
      .then((data) => active && setKnown(data && Array.isArray(data.knowledge) ? data : null))
      .catch(() => active && setKnown(null));
    return () => {
      active = false;
    };
  }, [listingId]);

  if (!known || known.knowledge.length === 0) return null;

  return (
    <div className="pt-3 border-t border-[#0E4A40] space-y-2.5" data-testid="knowledge-checklist">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-[#8FA6A1]">{t('surface.approvedClaims')}</span>
        {known.node && <span className="text-2xs text-[#8FA6A1]/70 truncate max-w-[200px]">{known.node}</span>}
      </div>
      <div className="space-y-2">
        {known.knowledge.map((k) => (
          <KnowledgeCard key={k.id} item={k} />
        ))}
      </div>
    </div>
  );
};
