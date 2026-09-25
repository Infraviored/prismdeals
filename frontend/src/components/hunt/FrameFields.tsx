import React, { useEffect, useRef, useState } from 'react';
import PlaceInput, { type Place } from '../PlaceInput';
import { RadiusChoice } from '../RadiusChoice';
import { MaxPriceField } from '../MaxPriceField';
import { useTranslation } from '../../hooks/useTranslation';
import type { Frame } from '../../types/hunt';

const label = 'block text-xs font-medium text-[#8FA6A1]';

/** A stored place as the field shows it; only its name is kept in the frame. */
function placeOf(name: string | null | undefined): Place | null {
  return name ? { label: name, name, qualifier: '', state: '', postal_code: '', lat: 0, lon: 0 } : null;
}

export interface FrameFieldsProps {
  frame: Frame;
  onChange: (frame: Frame) => void;
}

/** Where and for how much: place, radius, highest price. */
export const FrameFields: React.FC<FrameFieldsProps> = ({ frame, onChange }) => {
  const { t } = useTranslation();
  const [place, setPlace] = useState<Place | null>(() => placeOf(frame.place));
  const [unresolved, setUnresolved] = useState(false);
  // A place set from outside (the AI's edit) is followed; one picked here is kept as picked.
  const [shownFor, setShownFor] = useState(frame.place ?? null);
  if ((frame.place ?? null) !== shownFor) {
    setShownFor(frame.place ?? null);
    setPlace(placeOf(frame.place));
  }
  const seq = useRef(0);
  const frameRef = useRef(frame);
  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  const choosePlace = async (next: Place | null) => {
    setPlace(next);
    setShownFor(next?.name ?? null);
    setUnresolved(false);
    const mine = ++seq.current;
    // The old town's id goes at once: kept while the new one resolves, a
    // failed lookup left the screen on one place and the search on another.
    onChange({ ...frameRef.current, place: next?.name ?? null, location_id: null, ...(next ? {} : { radius_km: null }) });
    if (!next) return;
    try {
      const res = await fetch(`/api/locations/resolve?postal_code=${encodeURIComponent(next.postal_code || next.name)}`);
      const data = res.ok ? await res.json() : null;
      if (mine !== seq.current) return;
      if (data?.location_id) onChange({ ...frameRef.current, place: next.name, location_id: Number(data.location_id) });
      else setUnresolved(true);
    } catch {
      if (mine === seq.current) setUnresolved(true);
    }
  };

  return (
    <>
      <div className="space-y-2">
        <span className={label}>{t('surface.where')}</span>
        <PlaceInput label="" placeholder={t('surface.wherePlaceholder')} value={place} onChange={choosePlace} emptyHint={t('common.routeNoMatches')} />
        {unresolved && <p className="text-sm text-[#C9A227]">{t('surface.placeUnresolved')}</p>}
      </div>
      <div className="space-y-2">
        <span className={label}>{t('surface.howFar')}</span>
        <RadiusChoice hasPlace={Boolean(place)} radius={frame.radius_km ?? null} onChange={(r) => onChange({ ...frame, radius_km: r })} />
      </div>
      <div className="space-y-2">
        <label htmlFor="setup-price" className={label}>{t('surface.maxPrice')}</label>
        <MaxPriceField value={frame.max_price} onChange={(p) => onChange({ ...frame, max_price: p })} />
      </div>
    </>
  );
};

export default FrameFields;
