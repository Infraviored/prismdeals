import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { HuntDocument } from '../../types/hunt';
import { addTarget, removeTarget, renameTarget, setConditions, setTargetWeight, sharedAttributes } from '../../utils/huntDoc';
import { ConditionList } from './ConditionList';
import { FrameFields } from './FrameFields';

const label = 'block text-xs font-medium text-[#8FA6A1]';
const input =
  'w-full px-3.5 py-2.5 rounded bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#8FA6A1] text-sm transition-colors';

export interface HuntEditorProps {
  doc: HuntDocument;
  onChange: (doc: HuntDocument) => void;
  /** Only the conditions: the requirements sheet. */
  conditionsOnly?: boolean;
}

/** A hunt as the buyer changes it: what (targets), what it must have
 * (conditions per target and for all), where and for how much (frame). The
 * setup, the edit screen and the requirements sheet all show this one. */
export const HuntEditor: React.FC<HuntEditorProps> = ({ doc, onChange, conditionsOnly = false }) => {
  const { t } = useTranslation();
  const [newTarget, setNewTarget] = useState('');
  // One key per target that survives renaming it (a rename drops node_id):
  // a key from node_id remounted the row and lost the focus on each keystroke.
  const [keys, setKeys] = useState<{ ids: number[]; next: number }>(() => ({
    ids: doc.targets.map((_, i) => i),
    next: doc.targets.length,
  }));
  if (keys.ids.length !== doc.targets.length) {
    // Added at the end, or the document replaced: keep the keys by position.
    const ids = keys.ids.slice(0, doc.targets.length);
    let next = keys.next;
    while (ids.length < doc.targets.length) ids.push(next++);
    setKeys({ ids, next });
  }

  const remove = (index: number) => {
    setKeys((k) => ({ ...k, ids: k.ids.filter((_, i) => i !== index) }));
    onChange(removeTarget(doc, index));
  };

  const add = () => {
    onChange(addTarget(doc, newTarget));
    setNewTarget('');
  };

  return (
    <div className="flex flex-col gap-6" data-testid="hunt-editor">
      {!conditionsOnly && (
        <div className="space-y-2">
          <label htmlFor="hunt-name" className={label}>{t('huntEdit.name')}</label>
          <input id="hunt-name" type="text" value={doc.name} onChange={(e) => onChange({ ...doc, name: e.target.value })} className={input} />
          {doc.category_name && <p className="text-xs text-[#8FA6A1]">{t('huntEdit.category', { name: doc.category_name })}</p>}
        </div>
      )}

      <section className="space-y-3" aria-label={t('huntEdit.targets')}>
        <h2 className={label}>{t('huntEdit.targets')}</h2>
        {doc.targets.map((target, i) => (
          <div key={keys.ids[i] ?? `pending-${i}`} className="rounded border border-[#0E4A40] p-3 space-y-3" data-testid="hunt-target">
            <div className="flex items-center gap-2">
              {conditionsOnly ? (
                <h3 className="flex-1 text-sm font-semibold text-[#E4D6BE]">{target.name || target.typed}</h3>
              ) : (
                <input
                  type="text"
                  aria-label={t('huntEdit.targetName')}
                  value={target.node_id ? target.name || target.typed : target.typed}
                  onChange={(e) => onChange(renameTarget(doc, i, e.target.value))}
                  className="min-w-0 flex-1 bg-transparent border-b border-[#0E4A40] focus:border-[#8FA6A1] focus:outline-none py-1 text-sm font-semibold text-[#E4D6BE]"
                />
              )}
              {target.years && (
                <span className="shrink-0 text-xs text-[#8FA6A1] num">
                  {target.years[0]}–{target.years[1] ?? ''}
                </span>
              )}
              {/* Preference among targets: only a choice when there is more than one. */}
              {doc.targets.length > 1 && (
                <span className="stars" role="group" aria-label={t('huntEdit.preference')} data-testid="target-stars">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      data-on={(target.weight ?? 0) >= n}
                      aria-pressed={(target.weight ?? 0) === n}
                      aria-label={t('huntEdit.preferenceStars', { count: n })}
                      title={t('huntEdit.preferenceStars', { count: n })}
                      // The chosen star again: no preference.
                      onClick={() => onChange(setTargetWeight(doc, i, (target.weight ?? 0) === n ? 0 : n))}
                    >
                      ★
                    </button>
                  ))}
                </span>
              )}
              {!conditionsOnly && doc.targets.length > 1 && (
                <button type="button" onClick={() => remove(i)} className="shrink-0 text-xs text-[#8FA6A1] hover:text-[#E87967] cursor-pointer">
                  {t('huntEdit.remove')}
                </button>
              )}
            </div>
            {!target.node_id && !conditionsOnly && <p className="text-xs text-[#8FA6A1]">{t('huntEdit.placedOnSave')}</p>}
            <ConditionList
              conditions={target.conditions}
              attributes={target.attributes || []}
              onChange={(conditions) => onChange(setConditions(doc, i, conditions))}
            />
          </div>
        ))}
        {!conditionsOnly && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
              placeholder={t('huntEdit.addTargetPlaceholder')}
              aria-label={t('huntEdit.addTarget')}
              className={input}
            />
            <button type="button" onClick={add} disabled={!newTarget.trim()} className="shrink-0 px-3 rounded border border-[#0E4A40] text-sm text-[#E4D6BE] disabled:opacity-40 cursor-pointer">
              {t('huntEdit.add')}
            </button>
          </div>
        )}
      </section>

      {(doc.targets.length > 1 || doc.conditions.length > 0) && (
        <section className="space-y-2" aria-label={t('huntEdit.forAll')}>
          <h2 className={label}>{t('huntEdit.forAll')}</h2>
          <ConditionList
            conditions={doc.conditions}
            attributes={sharedAttributes(doc.targets)}
            onChange={(conditions) => onChange(setConditions(doc, null, conditions))}
            emptyText={t('huntEdit.none')}
          />
        </section>
      )}

      {!conditionsOnly && <FrameFields frame={doc.frame} onChange={(frame) => onChange({ ...doc, frame })} />}
    </div>
  );
};

export default HuntEditor;
