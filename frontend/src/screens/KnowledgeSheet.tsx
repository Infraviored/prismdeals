import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Check, Trash2, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { Sheet } from '../components/surface';
import { KnowledgeCard } from '../components/KnowledgeCard';
import { useTranslation } from '../hooks/useTranslation';
import type { HuntBrief, Knowledge } from '../types/hunt';
import { api } from '../utils/api';

export interface KnowledgeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  huntId: number;
}

/** What to know about the hunt's targets: the research brief to copy, the
 * pasted answer filed as proposed knowledge, and what is approved. */
export const KnowledgeSheet: React.FC<KnowledgeSheetProps> = ({ isOpen, onClose, huntId }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<HuntBrief | null>(null);
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [answer, setAnswer] = useState('');
  const [filing, setFiling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<HuntBrief>(`/api/hunts/${huntId}/brief`);
      setBrief(data);
      setKnowledge(data.knowledge || []);
    } catch (e) {
      setError((e as Error).message || t('surface.knowledgeLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [huntId, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) load();
  }, [isOpen, load]);

  const copy = () => {
    if (!brief?.brief) return;
    navigator.clipboard.writeText(brief.brief);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const file = async () => {
    if (!answer.trim() || filing) return;
    setFiling(true);
    setError(null);
    try {
      const filed = await api<Knowledge[]>(`/api/hunts/${huntId}/knowledge`, { method: 'POST', body: { text: answer } });
      setKnowledge((prev) => [...prev, ...filed]);
      setAnswer('');
    } catch (e) {
      setError((e as Error).message || t('surface.knowledgeClassifyFailed'));
    } finally {
      setFiling(false);
    }
  };

  const decide = async (id: number, approve: boolean) => {
    try {
      await api(`/api/knowledge/${id}/${approve ? 'approve' : 'reject'}`, { method: 'POST' });
      setKnowledge((prev) => (approve ? prev.map((k) => (k.id === id ? { ...k, approved: true } : k)) : prev.filter((k) => k.id !== id)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const proposed = knowledge.filter((k) => !k.approved);
  const approved = knowledge.filter((k) => k.approved);
  const small = 'px-2 py-0.5 rounded text-2xs font-medium border cursor-pointer';

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={t('surface.knowledge')}>
      <div className="p-4 space-y-6 text-[#F2F5F4] text-sm">
        {loading && <div className="py-12 text-center text-[#8FA6A1]">{t('common.loading')}</div>}
        {error && <div className="p-3 rounded bg-[#E87967]/10 border border-[#E87967]/40 text-xs text-[#E87967]" role="alert">{error}</div>}

        {brief && !loading && (
          <>
            {brief.targets.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-[#8FA6A1]">{t('surface.knowledgeNode')}</span>
                {brief.targets.map((tg) => (
                  <span key={tg.node_id} className="badge text-xs font-medium text-[#4E8C6A] bg-[#0E4A40]/40 px-2 py-0.5 rounded border border-[#0E4A40]">
                    {tg.name}
                  </span>
                ))}
              </div>
            )}

            {brief.decision === 'nicht nötig' ? (
              <div className="p-3.5 rounded bg-[#012828] border border-[#0E4A40] text-xs text-[#8FA6A1] space-y-1.5">
                <p className="font-medium text-[#F2F5F4]">{t('surface.researchNotNeeded')}</p>
                {brief.reason && <p>{brief.reason}</p>}
              </div>
            ) : (
              <>
                {brief.what_to_know.length > 0 && (
                  <div className="space-y-2 p-3.5 rounded bg-[#00100F] border border-[#0E4A40]">
                    <div className="text-xs font-semibold text-[#8FA6A1]">{t('surface.knowledgeTitle')}</div>
                    <ul className="space-y-1.5 text-xs text-[#F2F5F4]/90 list-disc list-inside">
                      {brief.what_to_know.map((item) => (
                        <li key={item} className="leading-relaxed">{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {brief.brief && (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#8FA6A1]">{t('surface.knowledgeBriefIntro')}</span>
                      <button type="button" onClick={copy} data-testid="copy-brief-btn"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#F2F5F4] bg-[#012828] hover:bg-[#0E4A40] border border-[#0E4A40] px-3 py-1.5 rounded transition-colors cursor-pointer">
                        {copied ? <Check className="w-3.5 h-3.5 text-[#4E8C6A]" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? t('surface.briefCopied') : t('surface.copyBrief')}</span>
                      </button>
                    </div>
                    <pre className="p-3 rounded bg-[#00100F] border border-[#0E4A40] text-xs text-[#8FA6A1] overflow-x-auto whitespace-pre-wrap max-h-48 leading-relaxed">
                      {brief.brief}
                    </pre>
                  </div>
                )}

                <div className="space-y-2.5 pt-2 border-t border-[#0E4A40]">
                  <label htmlFor="ai-answer-textarea" className="block text-xs font-semibold text-[#8FA6A1]">{t('surface.pasteAnswerTitle')}</label>
                  <textarea id="ai-answer-textarea" rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t('surface.pastePlaceholder')}
                    className="w-full p-3 rounded bg-[#00100F] border border-[#0E4A40] text-xs text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#4E8C6A] resize-none leading-relaxed" />
                  <button type="button" onClick={file} disabled={filing || !answer.trim()} data-testid="classify-btn"
                    className="w-full py-2 px-4 rounded bg-[#0E4A40] hover:bg-[#13594D] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-[#F2F5F4] transition-colors flex items-center justify-center gap-2 cursor-pointer">
                    <Sparkles className="w-3.5 h-3.5 text-[#4E8C6A]" />
                    <span>{filing ? t('surface.classifying') : t('surface.classifyButton')}</span>
                  </button>
                </div>
              </>
            )}

            {proposed.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-[#0E4A40]" data-testid="proposed-claims-section">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#C9A227] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {t('surface.proposedClaims')} ({proposed.length})
                  </span>
                  <button type="button" onClick={async () => { for (const k of proposed) await decide(k.id, true); }} className="text-2xs font-semibold text-[#4E8C6A] hover:underline cursor-pointer">
                    {t('surface.approveAll')}
                  </button>
                </div>
                {proposed.map((k) => (
                  <KnowledgeCard key={k.id} item={k} proposed actions={
                    <>
                      <button type="button" onClick={() => decide(k.id, true)} data-testid={`approve-claim-${k.id}`}
                        className={`${small} bg-[#4E8C6A]/20 hover:bg-[#4E8C6A]/30 text-[#4E8C6A] border-[#4E8C6A]/40`}>{t('surface.approveClaim')}</button>
                      <button type="button" onClick={() => decide(k.id, false)} data-testid={`reject-claim-${k.id}`}
                        className={`${small} bg-[#E87967]/10 hover:bg-[#E87967]/20 text-[#E87967] border-[#E87967]/30`}>{t('surface.rejectClaim')}</button>
                    </>
                  } />
                ))}
              </div>
            )}

            <div className="space-y-2.5 pt-3 border-t border-[#0E4A40]" data-testid="approved-claims-section">
              <span className="text-xs font-semibold text-[#8FA6A1] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#4E8C6A]" />
                {t('surface.approvedClaims')} ({approved.length})
              </span>
              {approved.length === 0 ? (
                <p className="text-xs text-[#8FA6A1]/60 py-2">{t('surface.noClaimsYet')}</p>
              ) : (
                approved.map((k) => (
                  <KnowledgeCard key={k.id} item={k} actions={
                    <button type="button" onClick={() => decide(k.id, false)} className="text-[#8FA6A1] hover:text-[#E87967] p-1 cursor-pointer transition-colors"
                      title={t('surface.rejectClaim')} aria-label={t('surface.rejectClaim')}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  } />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
};
