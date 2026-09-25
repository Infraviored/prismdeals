import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { HuntDocument } from '../../utils/huntDocument';

export interface HuntAiEditProps {
  doc: HuntDocument;
  /** The changed document, once the buyer took the proposal. */
  onApply: (doc: HuntDocument) => void;
}

/**
 * The hunt changed in the buyer's words: "Bei der CBR nur SC59, unter 5000 km".
 * The answer is shown as a list of changes first; taking it fills the form,
 * and only "Speichern" stores it.
 */
export const HuntAiEdit: React.FC<HuntAiEditProps> = ({ doc, onApply }) => {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ document: HuntDocument; changes: string[] } | null>(null);
  const [applied, setApplied] = useState(false);

  const ask = async () => {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    setProposal(null);
    setApplied(false);
    try {
      const res = await fetch('/api/hunt/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: doc, instruction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('surface.editAiFailed'));
        return;
      }
      setProposal({ document: data.document, changes: data.changes || [] });
    } catch {
      setError(t('surface.editAiFailed'));
    } finally {
      setBusy(false);
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
        {busy ? t('surface.editAiRunning') : t('surface.editAiRun')}
      </button>
      {error && <p className="text-sm text-[#C9A227]" role="alert">{error}</p>}
      {proposal && !applied && (
        <div className="rounded border border-[#0E4A40] p-3 space-y-2" data-testid="hunt-ai-proposal">
          {proposal.changes.length ? (
            <ul className="space-y-0.5">
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
                onClick={() => {
                  onApply(proposal.document);
                  setApplied(true);
                  setInstruction('');
                }}
                className="px-3 py-1.5 rounded text-sm font-semibold bg-[#E4D6BE] text-[#011F1F] cursor-pointer"
                data-testid="hunt-ai-apply"
              >
                {t('surface.editAiApply')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setProposal(null)}
              className="px-3 py-1.5 rounded text-sm border border-[#0E4A40] text-[#8FA6A1] cursor-pointer"
            >
              {t('surface.editAiDiscard')}
            </button>
          </div>
        </div>
      )}
      {applied && <p className="text-sm text-[#4E8C6A]">{t('surface.editAiApplied')}</p>}
    </section>
  );
};

export default HuntAiEdit;
