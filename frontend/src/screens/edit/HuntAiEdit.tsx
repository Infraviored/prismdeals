import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { HuntDocument } from '../../types/hunt';
import { api } from '../../utils/api';

export interface HuntAiEditProps {
  doc: HuntDocument;
  /** Stores the changed document; resolves false when saving failed. */
  onApply: (doc: HuntDocument) => Promise<boolean>;
}

/**
 * The hunt changed in the buyer's words: "nur mit Rechnung, höchstens 300 €".
 * The answer is shown as a list of changes first; taking it saves it. A
 * proposal belongs to the hunt it was made from: changed by hand since, it is
 * dropped (taking it would overwrite those changes) and the buyer asks again.
 */
export const HuntAiEdit: React.FC<HuntAiEditProps> = ({ doc, onApply }) => {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<{ base: HuntDocument; document: HuntDocument; changes: string[] } | null>(null);
  const proposal = asked && asked.base === doc ? asked : null;
  const stale = Boolean(asked) && !proposal;
  const [applied, setApplied] = useState(false);

  const ask = async () => {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    setAsked(null);
    setApplied(false);
    const base = doc;
    try {
      const answer = await api<{ document: HuntDocument; changes: string[] }>('/api/hunts/edit', {
        method: 'POST',
        body: { document: base, instruction },
      });
      setAsked({ base, ...answer });
    } catch (e) {
      setError((e as Error).message || t('surface.editAiFailed'));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!proposal || busy) return;
    setBusy(true);
    const ok = await onApply(proposal.document);
    setBusy(false);
    if (ok) {
      setApplied(true);
      setAsked(null);
      setInstruction('');
    }
  };

  return (
    <section className="space-y-2" data-testid="hunt-ai-edit">
      <label htmlFor="hunt-ai-text" className="block text-xs font-medium text-[#8FA6A1]">
        {t('surface.editAiTitle')}
      </label>
      <textarea
        id="hunt-ai-text"
        rows={3}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={t('surface.editAiPlaceholder')}
        className="w-full p-3 rounded bg-[#00100F] border border-[#0E4A40] text-sm text-[#F2F5F4] placeholder-[#8FA6A1]/50 focus:outline-none focus:border-[#8FA6A1] resize-none"
      />
      <button
        type="button"
        onClick={ask}
        disabled={busy || !instruction.trim()}
        className="px-3.5 py-2 rounded border border-[#0E4A40] text-sm text-[#F2F5F4] bg-[#012828] hover:border-[#8FA6A1] disabled:opacity-40 cursor-pointer"
        data-testid="hunt-ai-run"
      >
        {busy && !proposal ? t('surface.editAiRunning') : t('surface.editAiRun')}
      </button>
      {error && <p className="text-sm text-[#C9A227]" role="alert">{error}</p>}
      {proposal && (
        <div className="rounded border border-[#0E4A40] p-3 space-y-2" data-testid="hunt-ai-proposal">
          {proposal.changes.length ? (
            <ul className="space-y-0.5 list-disc pl-4">
              {proposal.changes.map((c) => (
                <li key={c} className="text-sm text-[#F2F5F4]">{c}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#8FA6A1]">{t('surface.editAiNoChange')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {proposal.changes.length > 0 && (
              <button
                type="button"
                onClick={apply}
                disabled={busy}
                className="px-3 py-1.5 rounded text-sm font-semibold bg-[#E4D6BE] text-[#011F1F] disabled:opacity-40 cursor-pointer"
                data-testid="hunt-ai-apply"
              >
                {busy ? t('surface.saving') : t('surface.editAiApply')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setAsked(null)}
              className="px-3 py-1.5 rounded text-sm border border-[#0E4A40] text-[#8FA6A1] cursor-pointer"
            >
              {t('surface.editAiDiscard')}
            </button>
          </div>
        </div>
      )}
      {stale && (
        <p className="text-sm text-[#8FA6A1]" data-testid="hunt-ai-stale">
          {t('surface.editAiStale')}
        </p>
      )}
      {applied && <p className="text-sm text-[#4E8C6A]">{t('surface.editAiApplied')}</p>}
    </section>
  );
};

export default HuntAiEdit;
