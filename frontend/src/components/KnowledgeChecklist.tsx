import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

export interface KnowledgeClaim {
  id: number;
  node_key: string;
  kind: string;
  axis?: string;
  statement: string;
  check_path?: string;
  weight?: string;
  sources?: string[];
  approved: boolean;
}

export interface KnowledgeChecklistProps {
  listingId: string | number;
  nodeKey?: string | null;
}

export const KnowledgeChecklist: React.FC<KnowledgeChecklistProps> = ({ listingId, nodeKey }) => {
  const { t } = useTranslation();
  const [claims, setClaims] = useState<KnowledgeClaim[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!listingId || typeof fetch === 'undefined') return;
    setLoading(true);
    fetch(`/api/listings/${listingId}/claims`)
      .then((res) => (res && res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        if (data?.claims && Array.isArray(data.claims)) {
          setClaims(data.claims);
        } else {
          setClaims([]);
        }
      })
      .catch(() => {
        if (active) setClaims([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [listingId]);

  if (loading || claims.length === 0) {
    return null;
  }

  const getKindBadge = (kind: string) => {
    switch (kind) {
      case 'weakness':
        return { label: t('surface.kindWeakness'), color: 'text-[#E87967] border-[#E87967]/30 bg-[#E87967]/10' };
      case 'warning_sign':
        return { label: t('surface.kindWarningSign'), color: 'text-[#C9A227] border-[#C9A227]/30 bg-[#C9A227]/10' };
      case 'maintenance':
        return { label: t('surface.kindMaintenance'), color: 'text-[#4E8C6A] border-[#4E8C6A]/30 bg-[#4E8C6A]/10' };
      case 'check':
        return { label: t('surface.kindCheck'), color: 'text-[#8FA6A1] border-[#8FA6A1]/30 bg-[#8FA6A1]/10' };
      case 'value_driver':
        return { label: t('surface.kindValueDriver'), color: 'text-[#4E8C6A] border-[#4E8C6A]/30 bg-[#4E8C6A]/10' };
      default:
        return { label: kind, color: 'text-[#8FA6A1] border-[#8FA6A1]/30 bg-[#8FA6A1]/10' };
    }
  };

  const getCheckPathLabel = (path?: string) => {
    switch (path) {
      case 'text':
        return t('surface.checkPathText');
      case 'photo':
        return t('surface.checkPathPhoto');
      case 'ask':
        return t('surface.checkPathAsk');
      case 'on_site':
        return t('surface.checkPathOnSite');
      default:
        return null;
    }
  };

  return (
    <div className="pt-3 border-t border-[#0E4A40] space-y-2.5" data-testid="knowledge-checklist">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-[#8FA6A1]">{t('surface.approvedClaims')}</span>
        {nodeKey && (
          <span className="text-2xs text-[#8FA6A1]/70 truncate max-w-[200px]" title={nodeKey}>
            {nodeKey}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {claims.map((claim) => {
          const kindInfo = getKindBadge(claim.kind);
          const checkPath = getCheckPathLabel(claim.check_path);
          const firstSource = claim.sources && claim.sources.length > 0 ? claim.sources[0] : null;

          return (
            <div
              key={claim.id}
              className="p-2.5 rounded bg-[#00100F] border border-[#0E4A40] text-xs space-y-1.5"
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-2xs border ${kindInfo.color}`}>
                  {kindInfo.label}
                </span>
                {checkPath && (
                  <span className="px-1.5 py-0.5 rounded text-2xs text-[#8FA6A1] bg-[#012828] border border-[#0E4A40]">
                    {checkPath}
                  </span>
                )}
                {claim.weight === 'dealbreaker' && (
                  <span className="px-1.5 py-0.5 rounded text-2xs text-[#E87967] bg-[#E87967]/10 border border-[#E87967]/40">
                    Dealbreaker
                  </span>
                )}
              </div>

              <p className="text-[#F2F5F4] leading-relaxed">{claim.statement}</p>

              {firstSource && (
                <div className="pt-0.5 flex items-center gap-1 text-2xs text-[#8FA6A1]">
                  <span>Quelle:</span>
                  <a
                    href={firstSource}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#F2F5F4] inline-flex items-center gap-0.5 truncate max-w-[240px] underline decoration-[#0E4A40]"
                  >
                    {firstSource.replace(/^https?:\/\/(?:www\.)?/, '')}
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
