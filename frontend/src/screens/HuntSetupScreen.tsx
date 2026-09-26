import React from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { useHuntSetup } from '../hooks/useHuntSetup';
import { Bar } from '../components/surface';
import { HuntEditor } from '../components/hunt/HuntEditor';
import StepIntent from './hunt/StepIntent';
import type { HuntDocument } from '../types/hunt';

export interface HuntSetupScreenProps {
  onBack: () => void;
  onSaved: (saved: HuntDocument) => void;
}

/** A new hunt in two steps: say it in words, then check what the AI made of it. */
export const HuntSetupScreen: React.FC<HuntSetupScreenProps> = ({ onBack, onSaved }) => {
  const { t } = useTranslation();
  const setup = useHuntSetup({ onSaved });
  const { draft } = setup;

  const saveButton = (testId: string, big = false) => (
    <button
      type="button"
      data-testid={testId}
      disabled={setup.saving || !draft?.name.trim() || !draft?.targets.length}
      onClick={setup.save}
      className={`inline-flex items-center gap-1.5 rounded font-semibold bg-[#E4D6BE] text-[#011F1F] hover:bg-[#d8c8af] transition-colors cursor-pointer disabled:opacity-40 ${
        big ? 'px-5 py-2.5 text-sm' : 'px-3 py-1.5 text-xs'
      }`}
    >
      {setup.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
      <span>{setup.saving ? t('hunt.saving') : t('hunt.saveAndSearch')}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#011F1F] text-[#F2F5F4] flex flex-col font-sans w-full overflow-x-hidden">
      <Bar
        measure="max-w-xl"
        title={t('hunt.setupTitle')}
        onBack={draft ? setup.restart : onBack}
        backLabel={draft ? t('hunt.back') : t('surface.back')}
        actions={draft ? saveButton('hunt-top-save-btn') : undefined}
      />

      <main className="w-full max-w-xl mx-auto px-4 py-5 flex-1 flex flex-col gap-6">
        {!draft && (
          <StepIntent initialText={setup.text} isAnalyzing={setup.drafting} onNext={setup.submitText} />
        )}

        {draft && (
          <>
            <p className="text-sm text-[#8FA6A1]">{t('huntEdit.draftIntro')}</p>
            <HuntEditor doc={draft} onChange={setup.setDraft} />
          </>
        )}

        {setup.error && (
          <p className="text-sm text-[#E87967] font-semibold" role="alert">
            {setup.error}
          </p>
        )}

        {draft && <div className="flex justify-end pt-4 border-t border-[#0E4A40]/40">{saveButton('hunt-save-btn', true)}</div>}
      </main>
    </div>
  );
};

export default HuntSetupScreen;
