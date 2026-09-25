import React from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import type { Knowledge } from '../types/hunt';

const KIND_COLOR: Record<string, string> = {
  weakness: 'text-[#E87967] border-[#E87967]/30 bg-[#E87967]/10',
  warning_sign: 'text-[#C9A227] border-[#C9A227]/30 bg-[#C9A227]/10',
  maintenance: 'text-[#4E8C6A] border-[#4E8C6A]/30 bg-[#4E8C6A]/10',
  value_driver: 'text-[#4E8C6A] border-[#4E8C6A]/30 bg-[#4E8C6A]/10',
};
const KIND_KEY = {
  weakness: 'kindWeakness',
  warning_sign: 'kindWarningSign',
  maintenance: 'kindMaintenance',
  check: 'kindCheck',
  value_driver: 'kindValueDriver',
  seller_question: 'kindSellerQuestion',
  retrofit: 'kindRetrofit',
  benchmark: 'kindBenchmark',
} as const;
const PATH_KEY = { text: 'checkPathText', photo: 'checkPathPhoto', ask: 'checkPathAsk', on_site: 'checkPathOnSite' } as const;

export interface KnowledgeCardProps {
  item: Knowledge;
  /** Actions on the right of the badges (approve, reject). */
  actions?: React.ReactNode;
  proposed?: boolean;
}

/** One fact: kind, how to check it, the statement, the node it hangs at, its source. */
export const KnowledgeCard: React.FC<KnowledgeCardProps> = ({ item, actions, proposed = false }) => {
  const { t } = useTranslation();
  const kind = KIND_KEY[item.kind as keyof typeof KIND_KEY];
  const path = PATH_KEY[item.check_path as keyof typeof PATH_KEY];
  const source = item.sources?.[0] || null;
  const badge = 'badge px-1.5 py-0.5 rounded text-2xs border';

  return (
    <div className={`p-2.5 rounded bg-[#00100F] border text-xs space-y-1.5 ${proposed ? 'border-[#C9A227]/40' : 'border-[#0E4A40]'}`} data-testid="knowledge-card">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`${badge} ${KIND_COLOR[item.kind] || 'text-[#8FA6A1] border-[#8FA6A1]/30 bg-[#8FA6A1]/10'}`}>
          {kind ? t(`surface.${kind}`) : item.kind}
        </span>
        {path && <span className={`${badge} text-[#8FA6A1] bg-[#012828] border-[#0E4A40]`}>{t(`surface.${path}`)}</span>}
        {item.weight === 'dealbreaker' && (
          <span className={`${badge} text-[#E87967] bg-[#E87967]/10 border-[#E87967]/40`}>{t('surface.claimDealbreaker')}</span>
        )}
        <span className="flex-1" />
        {actions}
      </div>
      <p className="text-[#F2F5F4] leading-relaxed">{item.statement}</p>
      <p className="text-2xs text-[#8FA6A1]">{item.node}</p>
      {source ? (
        <div className="flex items-center gap-1 text-2xs text-[#8FA6A1] min-w-0">
          <span className="shrink-0">{t('surface.claimSource')}</span>
          <a href={source} target="_blank" rel="noopener noreferrer" className="hover:text-[#F2F5F4] inline-flex items-center gap-0.5 truncate underline decoration-[#0E4A40]">
            <span className="truncate">{source.replace(/^https?:\/\/(?:www\.)?/, '')}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
          </a>
        </div>
      ) : (
        proposed && <span className="text-2xs text-[#E87967]">{t('surface.unsourcedWarning')}</span>
      )}
    </div>
  );
};

export default KnowledgeCard;
