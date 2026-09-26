import React from 'react';
import { Sheet } from '../components/surface';
import { HuntEditor } from '../components/hunt/HuntEditor';
import { useTranslation } from '../hooks/useTranslation';
import { useHuntDocument } from '../hooks/useHuntDocument';

export interface RequirementsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  huntId: number | null;
  /** Called once a save lands; the verdicts change on the next read.
   * `crawlChanged`: a must the site filters changed, so crawl again. */
  onSaved?: (crawlChanged: boolean) => void;
}

/** What the buyer wants of each target and of all: the conditions alone. */
export const RequirementsSheet: React.FC<RequirementsSheetProps> = ({ isOpen, onClose, huntId, onSaved }) => {
  const { t } = useTranslation();
  const { doc, setDoc, error, save, saving, saveError } = useHuntDocument(isOpen ? huntId : null);

  const submit = async () => {
    const saved = await save();
    if (saved) {
      onSaved?.(saved.crawl_changed);
      onClose();
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('surface.requirements')}
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={saving || !doc}
          data-testid="requirements-save"
          className="w-full min-h-[40px] rounded bg-[#E4D6BE] hover:bg-[#d8c8af] text-[#011F1F] text-sm font-semibold disabled:opacity-40 transition-colors cursor-pointer"
        >
          {saving ? t('surface.saving') : t('surface.saveRequirements')}
        </button>
      }
    >
      {(error || saveError) && <p className="text-sm text-[#E87967] mb-3" role="alert">{error || saveError}</p>}
      {!doc && !error && <p className="text-sm text-[#8FA6A1]">{t('surface.loading')}</p>}
      {doc && <HuntEditor doc={doc} onChange={setDoc} conditionsOnly />}
    </Sheet>
  );
};

export default RequirementsSheet;
