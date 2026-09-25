import React from 'react';
import { Bar } from '../components/surface';
import { HuntEditor } from '../components/hunt/HuntEditor';
import { useTranslation } from '../hooks/useTranslation';
import { useHuntDocument } from '../hooks/useHuntDocument';
import type { HuntDocument } from '../types/hunt';
import { HuntAiEdit } from './edit/HuntAiEdit';

export interface EditScreenProps {
  huntId: number | null;
  onBack: () => void;
  /** Stored; `searchChanged` when Kleinanzeigen has to be asked again. */
  onSaved?: (stored: HuntDocument, searchChanged: boolean) => void;
  onDelete?: (huntId: number) => void;
}

/** What goes into the crawl: targets and frame. A new name or condition does not. */
function searchKey(doc: HuntDocument): string {
  return JSON.stringify([doc.targets.map((t) => t.node_id ?? t.typed), doc.frame]);
}

/** The hunt as stored, changed by hand or in words, saved with PUT. */
export const EditScreen: React.FC<EditScreenProps> = ({ huntId, onBack, onSaved, onDelete }) => {
  const { t } = useTranslation();
  const { doc, setDoc, error, save, saving, saveError } = useHuntDocument(huntId);
  const [loadedKey, setLoadedKey] = React.useState<string | null>(null);
  if (doc && loadedKey === null) setLoadedKey(searchKey(doc));

  const store = async (next?: HuntDocument) => {
    const stored = await save(next);
    if (stored) onSaved?.(stored, searchKey(stored) !== loadedKey);
    return Boolean(stored);
  };

  const handleDelete = () => {
    if (huntId && window.confirm(t('surface.deleteConfirmSearch'))) onDelete?.(huntId);
  };

  return (
    <div className="min-h-screen bg-[#011F1F] text-[#F2F5F4] flex flex-col font-sans w-full overflow-x-hidden">
      <Bar
        measure="max-w-xl"
        title={t('surface.setupTitle', { name: doc?.name || '' })}
        onBack={onBack}
        backLabel={t('surface.back')}
        actions={
          <button
            type="button"
            disabled={saving || !doc?.name.trim() || !doc?.targets.length}
            onClick={() => store()}
            data-testid="edit-save-btn"
            className="px-3 py-1.5 rounded text-xs font-semibold bg-[#E4D6BE] text-[#011F1F] hover:bg-[#d8c8af] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? t('surface.saving') : t('surface.save')}
          </button>
        }
      />

      <main className="w-full max-w-xl mx-auto px-4 py-6 flex-1 flex flex-col gap-6">
        {error && <p className="text-sm text-[#E87967]" role="alert">{error}</p>}
        {!doc && !error && <p className="text-sm text-[#8FA6A1]">{t('surface.loading')}</p>}

        {doc && (
          <>
            <HuntAiEdit doc={doc} onApply={store} />
            <HuntEditor doc={doc} onChange={setDoc} />

            <section className="space-y-2" data-testid="hunt-crawl">
              <h2 className="text-xs font-medium text-[#8FA6A1]">{t('huntEdit.howSearched')}</h2>
              {doc.crawl && doc.crawl.length > 0 ? (
                <ul className="space-y-1">
                  {doc.crawl.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3 text-sm">
                      <span className="text-[#F2F5F4]">{c.label}</span>
                      <span className="text-[#8FA6A1] num">{c.searches === 1 ? t('huntEdit.searchesOne') : t('huntEdit.searches', { count: c.searches })}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#8FA6A1]">{t('huntEdit.noCrawl')}</p>
              )}
            </section>

            {saveError && <p className="text-sm text-[#E87967] font-semibold" role="alert">{saveError}</p>}

            <div className="pt-10 pb-6">
              <button
                type="button"
                onClick={handleDelete}
                className="w-full px-4 py-2.5 rounded border border-[#0E4A40] text-sm text-[#8FA6A1] hover:text-[#F2F5F4] hover:border-[#8FA6A1] transition-colors cursor-pointer bg-transparent"
              >
                {t('surface.deleteSearch')}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default EditScreen;
