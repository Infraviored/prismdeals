import React, { useState } from 'react';
import { Sheet } from '../components/surface';
import PlaceInput, { type Place } from '../components/PlaceInput';
import { useTranslation } from '../hooks/useTranslation';

export interface CorridorNow {
  origin: string;
  destination: string;
  half_width_km: number;
}

export interface FundeCorridorSheetProps {
  isOpen: boolean;
  onClose: () => void;
  familyId: number | null;
  current: CorridorNow | null;
  /** Called after the hunt now searches somewhere else; crawl from here. */
  onChanged: () => void;
}

const WIDTHS = [5, 10, 20];

/** A corridor for a hunt that already runs.
 *
 * "I drive to Konstanz anyway" is often decided after the hunt is made. The
 * hunt keeps what it knows -- terms, requirements, verdicts -- and only the
 * places it searches change.
 */
export const FundeCorridorSheet: React.FC<FundeCorridorSheetProps> = ({
  isOpen,
  onClose,
  familyId,
  current,
  onChanged,
}) => {
  const { t } = useTranslation();
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [width, setWidth] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (method: 'PUT' | 'DELETE') => {
    if (!familyId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/search-families/${familyId}/route`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:
          method === 'PUT'
            ? JSON.stringify({
                origin: from?.postal_code,
                destination: to?.postal_code,
                radius_km: Math.max(10, width * 2),
                corridor_km: width,
              })
            : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pill = (selected: boolean) =>
    `px-3 py-2 rounded border text-sm ${
      selected ? 'border-[var(--lampe)] text-[var(--lampe)]' : 'border-[var(--kante)] text-[var(--kalk)]'
    }`;

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={t('surface.corridorTitle')}>
      <div className="flex flex-col gap-4 p-1">
        <p className="text-sm text-[var(--kalk)]">{t('surface.corridorHint')}</p>
        {current && (
          <p className="text-sm text-[var(--lampe)]" data-testid="corridor-current">
            {t('surface.corridorCurrent', {
              from: current.origin,
              to: current.destination,
              km: Math.round(current.half_width_km),
            })}
          </p>
        )}
        <PlaceInput
          label={t('surface.corridorFrom')}
          placeholder={t('surface.corridorFromPlaceholder')}
          value={from}
          onChange={setFrom}
          emptyHint={t('common.routeNoMatches')}
        />
        <PlaceInput
          label={t('surface.corridorTo')}
          placeholder={t('surface.corridorToPlaceholder')}
          value={to}
          onChange={setTo}
          emptyHint={t('common.routeNoMatches')}
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('surface.corridorWidth', { km: width })}>
          {WIDTHS.map((km) => (
            <button key={km} type="button" className={pill(width === km)} aria-pressed={width === km} onClick={() => setWidth(km)}>
              {t('surface.corridorWidth', { km })}
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-[var(--messing)]" role="alert">{error}</p>}
        <button
          type="button"
          className="btn"
          disabled={!from || !to || busy}
          onClick={() => send('PUT')}
          data-testid="corridor-save"
        >
          {busy ? t('surface.corridorPlanning') : t('surface.corridorSave')}
        </button>
        {current && (
          <button type="button" className="btn" disabled={busy} onClick={() => send('DELETE')}>
            {t('surface.corridorRemove')}
          </button>
        )}
      </div>
    </Sheet>
  );
};

export default FundeCorridorSheet;
