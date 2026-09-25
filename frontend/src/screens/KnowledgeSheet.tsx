import React, { useState, useEffect, useCallback } from 'react';
import { Sheet } from '../components/surface';
import { useTranslation } from '../hooks/useTranslation';
import { Copy, Check, ExternalLink, Trash2, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import type { KnowledgeClaim } from '../components/KnowledgeChecklist';

export interface KnowledgeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: number;
}

interface BriefResponse {
  decision: string;
  research_value: string;
  reason?: string;
  what_to_know: string[];
  brief: string;
  node_key: string;
  existing_claims: KnowledgeClaim[];
  pending_claims?: KnowledgeClaim[];
}

export const KnowledgeSheet: React.FC<KnowledgeSheetProps> = ({
  isOpen,
  onClose,
  campaignId,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [briefData, setBriefData] = useState<BriefResponse | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [classifying, setClassifying] = useState(false);
  const [proposedClaims, setProposedClaims] = useState<KnowledgeClaim[]>([]);
  const [approvedClaims, setApprovedClaims] = useState<KnowledgeClaim[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBrief = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/brief`);
      if (!res.ok) throw new Error('Failed to load brief');
      const data: BriefResponse = await res.json();
      setBriefData(data);
      setApprovedClaims(data.existing_claims || []);
      setProposedClaims(data.pending_claims || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading brief');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (isOpen) {
      loadBrief();
    }
  }, [isOpen, loadBrief]);

  const handleCopyBrief = () => {
    if (!briefData?.brief) return;
    navigator.clipboard.writeText(briefData.brief);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleClassify = async () => {
    if (!answerText.trim() || !briefData?.node_key || classifying) return;
    setClassifying(true);
    setError(null);
    try {
      const res = await fetch('/api/knowledge/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_key: briefData.node_key,
          answer_text: answerText,
        }),
      });
      if (!res.ok) throw new Error('Classification failed');
      const data = await res.json();
      const newClaims: KnowledgeClaim[] = data.claims || [];
      setProposedClaims((prev) => [...prev, ...newClaims]);
      setAnswerText('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error classifying answer');
    } finally {
      setClassifying(false);
    }
  };

  const handleApprove = async (claimId: number) => {
    try {
      const res = await fetch(`/api/claims/${claimId}/approve`, { method: 'POST' });
      if (!res.ok) return;
      const target = proposedClaims.find((c) => c.id === claimId);
      if (target) {
        setProposedClaims((prev) => prev.filter((c) => c.id !== claimId));
        setApprovedClaims((prev) => [{ ...target, approved: true }, ...prev]);
      }
    } catch (err) {
      console.error('Failed to approve claim:', err);
    }
  };

  const handleReject = async (claimId: number) => {
    try {
      const res = await fetch(`/api/claims/${claimId}/reject`, { method: 'POST' });
      if (!res.ok) return;
      setProposedClaims((prev) => prev.filter((c) => c.id !== claimId));
      setApprovedClaims((prev) => prev.filter((c) => c.id !== claimId));
    } catch (err) {
      console.error('Failed to reject claim:', err);
    }
  };

  const handleApproveAll = async () => {
    for (const c of proposedClaims) {
      await handleApprove(c.id);
    }
  };

  const getKindLabel = (kind: string) => {
    switch (kind) {
      case 'weakness':
        return t('surface.kindWeakness');
      case 'warning_sign':
        return t('surface.kindWarningSign');
      case 'maintenance':
        return t('surface.kindMaintenance');
      case 'check':
        return t('surface.kindCheck');
      case 'value_driver':
        return t('surface.kindValueDriver');
      case 'seller_question':
        return t('surface.kindSellerQuestion');
      case 'retrofit':
        return t('surface.kindRetrofit');
      case 'benchmark':
        return t('surface.kindBenchmark');
      default:
        return kind;
    }
  };

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={t('surface.knowledge')}>
      <div className="p-4 space-y-6 text-[#F2F5F4] text-sm">
        {loading && (
          <div className="py-12 text-center text-[#8FA6A1]">{t('common.loading')}</div>
        )}

        {error && (
          <div className="p-3 rounded bg-[#E87967]/10 border border-[#E87967]/40 text-xs text-[#E87967]">
            {error}
          </div>
        )}

        {briefData && !loading && (
          <>
            {/* 1. Header Node info */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-[#8FA6A1]">
                  Knoten
                </span>
                <span className="text-xs font-medium text-[#4E8C6A] bg-[#0E4A40]/40 px-2 py-0.5 rounded border border-[#0E4A40]">
                  {briefData.node_key}
                </span>
              </div>
            </div>

            {/* Decision explanation if research not needed */}
            {briefData.decision === 'nicht noetig' || briefData.research_value === 'none' ? (
              <div className="p-3.5 rounded bg-[#012828] border border-[#0E4A40] text-xs text-[#8FA6A1] space-y-1.5">
                <p className="font-medium text-[#F2F5F4]">
                  Hintergrundrecherche für diesen Preis und diese Kategorie nicht erforderlich.
                </p>
                {briefData.reason && <p>{briefData.reason}</p>}
              </div>
            ) : (
              <>
                {/* 2. Was zu wissen ist */}
                {briefData.what_to_know && briefData.what_to_know.length > 0 && (
                  <div className="space-y-2 p-3.5 rounded bg-[#00100F] border border-[#0E4A40]">
                    <div className="text-xs font-semibold text-[#8FA6A1]">
                      {t('surface.knowledgeTitle')}
                    </div>
                    <ul className="space-y-1.5 text-xs text-[#F2F5F4]/90 list-disc list-inside">
                      {briefData.what_to_know.map((item, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 3. Recherche-Auftrag kopieren */}
                {briefData.brief && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#8FA6A1]">
                        {t('surface.knowledgeBriefIntro')}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyBrief}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#F2F5F4] bg-[#012828] hover:bg-[#0E4A40] border border-[#0E4A40] px-3 py-1.5 rounded transition-colors cursor-pointer"
                        data-testid="copy-brief-btn"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#4E8C6A]" />
                            <span>{t('surface.briefCopied')}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>{t('surface.copyBrief')}</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="relative">
                      <pre className="p-3 rounded bg-[#00100F] border border-[#0E4A40] text-xs text-[#8FA6A1] overflow-x-auto whitespace-pre-wrap max-h-48 leading-relaxed">
                        {briefData.brief}
                      </pre>
                    </div>
                  </div>
                )}

                {/* 4. Antwort einfügen */}
                <div className="space-y-2.5 pt-2 border-t border-[#0E4A40]">
                  <label htmlFor="ai-answer-textarea" className="block text-xs font-semibold text-[#8FA6A1]">
                    {t('surface.pasteAnswerTitle')}
                  </label>
                  <textarea
                    id="ai-answer-textarea"
                    rows={4}
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder={t('surface.pastePlaceholder')}
                    className="w-full p-3 rounded bg-[#00100F] border border-[#0E4A40] text-xs text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#4E8C6A] resize-none leading-relaxed"
                  />
                  <button
                    type="button"
                    onClick={handleClassify}
                    disabled={classifying || !answerText.trim()}
                    className="w-full py-2 px-4 rounded bg-[#0E4A40] hover:bg-[#13594D] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-[#F2F5F4] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    data-testid="classify-btn"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#4E8C6A]" />
                    <span>{classifying ? t('surface.classifying') : t('surface.classifyButton')}</span>
                  </button>
                </div>
              </>
            )}

            {/* 5. Vorgeschlagene Fakten (Pending) */}
            {proposedClaims.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-[#0E4A40]" data-testid="proposed-claims-section">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#C9A227] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {t('surface.proposedClaims')} ({proposedClaims.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleApproveAll}
                    className="text-2xs font-semibold text-[#4E8C6A] hover:underline cursor-pointer"
                  >
                    {t('surface.approveAll')}
                  </button>
                </div>

                <div className="space-y-2">
                  {proposedClaims.map((claim) => (
                    <div
                      key={claim.id}
                      className="p-3 rounded bg-[#00100F] border border-[#C9A227]/40 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-1.5 py-0.5 rounded text-2xs bg-[#C9A227]/10 text-[#C9A227] border border-[#C9A227]/30">
                          {getKindLabel(claim.kind)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleApprove(claim.id)}
                            className="px-2 py-0.5 rounded text-2xs bg-[#4E8C6A]/20 hover:bg-[#4E8C6A]/30 text-[#4E8C6A] border border-[#4E8C6A]/40 font-medium cursor-pointer"
                            data-testid={`approve-claim-${claim.id}`}
                          >
                            {t('surface.approveClaim')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(claim.id)}
                            className="px-2 py-0.5 rounded text-2xs bg-[#E87967]/10 hover:bg-[#E87967]/20 text-[#E87967] border border-[#E87967]/30 font-medium cursor-pointer"
                            data-testid={`reject-claim-${claim.id}`}
                          >
                            {t('surface.rejectClaim')}
                          </button>
                        </div>
                      </div>

                      <p className="text-[#F2F5F4] leading-relaxed">{claim.statement}</p>

                      {claim.sources && claim.sources.length > 0 ? (
                        <div className="flex items-center gap-1 text-2xs text-[#8FA6A1] truncate">
                          <span>Quelle:</span>
                          <a
                            href={claim.sources[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-[#F2F5F4] inline-flex items-center gap-0.5 truncate underline decoration-[#0E4A40]"
                          >
                            {claim.sources[0]}
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-2xs text-[#E87967]">{t('surface.unsourcedWarning')}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. Bereits bekanntes Produktwissen */}
            <div className="space-y-2.5 pt-3 border-t border-[#0E4A40]" data-testid="approved-claims-section">
              <span className="text-xs font-semibold text-[#8FA6A1] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#4E8C6A]" />
                {t('surface.approvedClaims')} ({approvedClaims.length})
              </span>

              {approvedClaims.length === 0 ? (
                <p className="text-xs text-[#8FA6A1]/60 py-2">{t('surface.noClaimsYet')}</p>
              ) : (
                <div className="space-y-2">
                  {approvedClaims.map((claim) => (
                    <div
                      key={claim.id}
                      className="p-2.5 rounded bg-[#00100F] border border-[#0E4A40] space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-1.5 py-0.5 rounded text-2xs bg-[#012828] text-[#8FA6A1] border border-[#0E4A40]">
                          {getKindLabel(claim.kind)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleReject(claim.id)}
                          className="text-[#8FA6A1] hover:text-[#E87967] p-1 cursor-pointer transition-colors"
                          title={t('surface.rejectClaim')}
                          aria-label={t('surface.rejectClaim')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[#F2F5F4] leading-relaxed">{claim.statement}</p>
                      {claim.sources && claim.sources.length > 0 && (
                        <a
                          href={claim.sources[0]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-2xs text-[#8FA6A1] hover:text-[#F2F5F4] underline decoration-[#0E4A40] truncate max-w-full"
                        >
                          {claim.sources[0].replace(/^https?:\/\/(?:www\.)?/, '')}
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
};
