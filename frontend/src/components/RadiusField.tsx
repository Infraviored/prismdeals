import React, { useState, useEffect } from 'react';

export interface RadiusFieldProps {
  value: number;
  onChange: (km: number) => void;
  min?: number;
  max?: number;
}

/** How far you are willing to drive, as a distance rather than a menu.
 *
 * Four preset pills said 10, 30, 50 or 100 km, which are not the distances
 * people live at -- Landsberg to Augsburg is 38, to Munich 57. The slider
 * covers the range and the number beside it takes a typed answer, so both the
 * rough gesture and the exact figure work.
 */
export const RadiusField: React.FC<RadiusFieldProps> = ({
  value,
  onChange,
  min = 2,
  max = 200,
}) => {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    // Resync here rather than leaving it to the effect. When the clamp lands on
    // the value the parent already holds, onChange changes nothing, React bails
    // out and the effect never runs -- so at the 200 km maximum, typing 999 and
    // leaving the field kept 999 on screen while the search saved at 200.
    setDraft(String(clamped));
    onChange(clamped);
  };

  return (
    <div className="flex items-center gap-4">
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        aria-label="Radius"
        className="flex-1 h-9 cursor-pointer"
      />
      <div className="flex items-baseline gap-1 shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-14 px-2 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#F2F5F4] focus:outline-none focus:border-white/30 text-sm tabular-nums text-right transition-colors"
        />
        <span className="text-sm text-[#9FB3B0]">km</span>
      </div>
    </div>
  );
};
