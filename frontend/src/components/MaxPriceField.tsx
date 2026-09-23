import React from 'react';

export interface MaxPriceFieldProps {
  value: number | null;
  onChange: (price: number | null) => void;
}

/** The most the buyer will pay, in whole euros. Empty means no limit. */
export const MaxPriceField: React.FC<MaxPriceFieldProps> = ({ value, onChange }) => (
    <div className="relative w-36">
      <input
        id="setup-price"
        type="number"
        min="0"
        step="5"
        value={value !== null && value !== undefined ? value : ''}
        onChange={(e) => {
          const val = e.target.value.trim();
          onChange(val ? parseInt(val, 10) : null);
        }}
        placeholder="150"
        className="w-full pl-3.5 pr-8 py-2.5 rounded bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#8FA6A1] text-sm tabular-nums text-right transition-colors"
      />
      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-[#8FA6A1] pointer-events-none font-medium">
        €
      </span>
    </div>
);

export default MaxPriceField;
