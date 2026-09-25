import React, { useCallback, useEffect, useState } from 'react';
import { Sheet, Pill } from '../components/surface';
import { useTranslation } from '../hooks/useTranslation';

/** One question the category can answer, as the playbook names it. */
export interface AskableField {
  id: string;
  type: 'number' | 'enum' | 'boolean';
  label: string;
  description?: string;
  unit?: string;
  options?: string[];
}

interface StoredRequirement {
  id: string;
  buyer_wants: Record<string, unknown>;
  label?: string;
  importance?: string;
  own?: boolean;
  [key: string]: unknown;
}

/** A must or wish in the buyer's own words ("ABS"), read as words by the judge. */
export function ownRequirement(label: string, importance: 'high' | 'low'): StoredRequirement {
  const clean = label.trim();
  const slug = clean.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '_').replace(/^_|_$/g, '');
  return { id: `own_${slug}`, label: clean, importance, own: true, buyer_wants: { present: true } };
}

export interface RequirementsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: number | null;
  /** Called once a save lands, so the results can be judged again. */
  onSaved?: () => void;
}

/**
 * What the buyer wants, beyond what the site can filter on.
 *
 * Kleinanzeigen narrows a search to "memory, up to 150 EUR". It cannot say
 * "two sticks of sixteen gigabytes, DDR4, at least 3200 MHz" -- and that is
 * the whole difference between fifty offers and the nine worth opening. The
 * store and the sieve for this existed on both ends; there was simply nowhere
 * to type it, so Evaluate answered "set your requirements first" and the buyer
 * could search the entire app without finding a place to do so.
 */
export const RequirementsSheet: React.FC<RequirementsSheetProps> = ({
  isOpen,
  onClose,
  campaignId,
  onSaved,
}) => {
  const { t } = useTranslation();
  const [fields, setFields] = useState<AskableField[]>([]);
  const [wants, setWants] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchCount, setSearchCount] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [configuredFieldIds, setConfiguredFieldIds] = useState<Set<string>>(new Set());
  // Everything stored, so a save keeps importance and labels it does not edit.
  const [stored, setStored] = useState<Record<string, StoredRequirement>>({});
  const [own, setOwn] = useState<StoredRequirement[]>([]);
  const [ownText, setOwnText] = useState('');

  useEffect(() => {
    if (!isOpen || !campaignId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setShowMore(false);

    fetch(`/api/campaigns/${campaignId}/requirements`, { credentials: 'same-origin' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { fields: AskableField[]; requirements: StoredRequirement[]; searches: number }) => {
        if (cancelled) return;
        setFields(data.fields || []);
        setSearchCount(data.searches || 0);
        const stored: Record<string, Record<string, unknown>> = {};
        const configured = new Set<string>();
        for (const requirement of data.requirements || []) {
          if (requirement.buyer_wants && Object.keys(requirement.buyer_wants).length > 0) {
            stored[requirement.id] = requirement.buyer_wants;
            configured.add(requirement.id);
          }
        }
        setWants(stored);
        setConfiguredFieldIds(configured);
        const askable = new Set((data.fields || []).map(f => f.id));
        const all: Record<string, StoredRequirement> = {};
        const mine: StoredRequirement[] = [];
        for (const requirement of data.requirements || []) {
          all[requirement.id] = requirement;
          if (requirement.own || requirement.id.startsWith('own_') || !askable.has(requirement.id)) {
            mine.push(requirement);
          }
        }
        setStored(all);
        setOwn(mine);
      })
      .catch(() => !cancelled && setError(t('surface.requirementsLoadFailed')))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [isOpen, campaignId, t]);

  const setWant = useCallback((fieldId: string, next: Record<string, unknown> | null) => {
    setWants(prev => {
      const copy = { ...prev };
      if (next === null || Object.keys(next).length === 0) delete copy[fieldId];
      else copy[fieldId] = next;
      return copy;
    });
  }, []);

  const save = useCallback(async () => {
    if (!campaignId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/requirements`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          requirements: [
            ...Object.entries(wants)
              .filter(([id]) => !own.some(o => o.id === id))
              .map(([id, buyer_wants]) => ({ ...(stored[id] || {}), id, buyer_wants })),
            ...own,
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body && body.error) || String(res.status));
      }
      // New wants, same offers: judge again (and compare), but do not ask
      // Kleinanzeigen again -- nothing about the search changed.
      await fetch(`/api/campaigns/${campaignId}/judge`, { method: 'POST' }).catch(() => {});
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('surface.requirementsSaveFailed'));
    } finally {
      setSaving(false);
    }
  }, [campaignId, wants, own, stored, onSaved, onClose, t]);

  const addOwn = (importance: 'high' | 'low') => {
    if (!ownText.trim()) return;
    const next = ownRequirement(ownText, importance);
    setOwn(prev => [...prev.filter(o => o.id !== next.id), next]);
    setOwnText('');
  };

  const numberInput = (
    field: AskableField,
    operator: 'min' | 'max',
    placeholder: string
  ) => {
    const current = wants[field.id]?.[operator];
    return (
      <label className="flex items-center gap-2 text-xs text-[#8FA6A1]">
        <span className="w-10 shrink-0">{placeholder}</span>
        <input
          type="number"
          inputMode="numeric"
          value={current === undefined ? '' : String(current)}
          onChange={event => {
            const raw = event.target.value;
            const next = { ...(wants[field.id] || {}) };
            if (raw === '') delete next[operator];
            else next[operator] = Number(raw);
            setWant(field.id, next);
          }}
          className="w-full min-w-0 bg-[#00100F] border border-[#0E4A40] rounded px-2.5 py-1.5 text-sm text-[#F2F5F4] [font-variant-numeric:tabular-nums] focus:outline-none focus:border-[#8FA6A1]"
        />
        {field.unit && <span className="shrink-0">{field.unit}</span>}
      </label>
    );
  };

  const renderField = (field: AskableField) => (
    <div key={field.id} className="flex flex-col gap-2">
      <div className="text-sm font-medium text-[#F2F5F4]">
        {field.label}
        {field.unit ? ` (${field.unit})` : ''}
      </div>

      {field.type === 'number' && (
        <div className="flex gap-3">
          {numberInput(field, 'min', t('surface.atLeast'))}
          {numberInput(field, 'max', t('surface.atMost'))}
        </div>
      )}

      {field.type === 'enum' && (
        <div className="flex flex-wrap gap-1.5">
          {(field.options || []).map(option => {
            const chosen = ((wants[field.id]?.preferred as string[]) || []).includes(
              option
            );
            return (
              <Pill
                key={option}
                label={option.toUpperCase()}
                active={chosen}
                onClick={() => {
                  const list = [...((wants[field.id]?.preferred as string[]) || [])];
                  const at = list.indexOf(option);
                  if (at === -1) list.push(option);
                  else list.splice(at, 1);
                  setWant(field.id, list.length ? { preferred: list } : {});
                }}
              />
            );
          })}
        </div>
      )}

      {field.type === 'boolean' && (
        <div className="flex gap-1.5">
          {[true, false].map(value => (
            <Pill
              key={String(value)}
              label={value ? t('surface.yes') : t('surface.no')}
              active={wants[field.id]?.match === value}
              onClick={() =>
                setWant(
                  field.id,
                  wants[field.id]?.match === value ? {} : { match: value }
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );

  const storedFields = fields.filter(f => configuredFieldIds.has(f.id));
  const suggestionFields = fields.filter(f => !configuredFieldIds.has(f.id));

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('surface.requirements')}
      footer={
        <button
          type="button"
          onClick={save}
          disabled={saving || loading}
          className="w-full min-h-[40px] rounded bg-[#E4D6BE] hover:bg-[#d8c8af] text-[#011F1F] text-sm font-semibold disabled:opacity-40 transition-colors cursor-pointer"
        >
          {saving ? t('surface.saving') : t('surface.saveRequirements')}
        </button>
      }
    >
      {error && <p className="text-sm text-[#E87967] mb-3">{error}</p>}

      {loading && <p className="text-sm text-[#8FA6A1]">{t('surface.loading')}</p>}

      {!loading && fields.length === 0 && (
        <p className="text-sm text-[#8FA6A1]">{t('surface.requirementsNoFields')}</p>
      )}

      {!loading && fields.length > 0 && (
        <>
          <p className="text-xs text-[#8FA6A1] mb-4">
            {t('surface.requirementsIntro', { searches: searchCount })}
          </p>

          <div className="flex flex-col gap-5">
            {/* The buyer's own words: "ABS" as a wish lifts the score, as a
                must it decides. */}
            <div className="flex flex-col gap-2" data-testid="own-requirements">
              <div className="text-sm font-medium text-[#F2F5F4]">{t('surface.ownTitle')}</div>
              {own.map(o => (
                <div key={o.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 text-[#F2F5F4]">
                    {o.label || o.id}
                    <span className="ml-2 text-xs text-[#8FA6A1]">
                      {o.importance === 'high' || o.hard ? t('surface.ownMust') : t('surface.ownWish')}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setOwn(prev => prev.filter(x => x.id !== o.id))}
                    className="shrink-0 text-xs text-[#8FA6A1] hover:text-[#F2F5F4] cursor-pointer"
                  >
                    {t('surface.ownRemove')}
                  </button>
                </div>
              ))}
              <input
                type="text"
                value={ownText}
                onChange={e => setOwnText(e.target.value)}
                placeholder={t('surface.ownPlaceholder')}
                className="w-full bg-[#00100F] border border-[#0E4A40] rounded px-3 py-2 text-sm text-[#F2F5F4] placeholder-[#8FA6A1]/60 focus:outline-none focus:border-[#8FA6A1]"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => addOwn('low')} disabled={!ownText.trim()}
                  className="px-3 py-1.5 rounded border border-[#0E4A40] text-sm text-[#E4D6BE] disabled:opacity-40 cursor-pointer">
                  {t('surface.ownAddWish')}
                </button>
                <button type="button" onClick={() => addOwn('high')} disabled={!ownText.trim()}
                  className="px-3 py-1.5 rounded border border-[#0E4A40] text-sm text-[#E4D6BE] disabled:opacity-40 cursor-pointer">
                  {t('surface.ownAddMust')}
                </button>
              </div>
            </div>

            {storedFields.length === 0 && own.length === 0 && (
              <p className="text-sm text-[#8FA6A1]">{t('surface.requirementsEmpty')}</p>
            )}
            {storedFields.map(renderField)}

            {suggestionFields.length > 0 && (
              <div className="flex flex-col gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => setShowMore(prev => !prev)}
                  className="w-full py-2.5 px-3 text-xs font-medium text-[#8FA6A1] hover:text-[#F2F5F4] border border-[#0E4A40] hover:border-[#8FA6A1] rounded text-center transition-colors cursor-pointer bg-transparent"
                >
                  {showMore ? t('surface.fewerCriteria') : t('surface.moreCriteria')}
                </button>
                {showMore && (
                  <div className="flex flex-col gap-5 pt-1" data-testid="suggestion-fields">
                    {suggestionFields.map(renderField)}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
};
