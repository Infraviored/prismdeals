import React from 'react';
import type { Chip } from '../../types/hunt';

export interface ChipsProps {
  chips?: Chip[] | null;
  className?: string;
}

/** A yes/no chip goes on the second line. The server says so with `kind`;
 * without it, what is good or bad about the offer goes there. */
const isFlag = (c: Chip) => (c.kind ? c.kind === 'yesno' : c.tone !== 'value');

const MARK: Record<Chip['tone'], string> = { good: '✓', bad: '✗', value: '' };

function ChipLine({ chips, kind }: { chips: Chip[]; kind: 'values' | 'flags' }) {
  if (chips.length === 0) return null;
  return (
    <p className={`chip-line ${kind}`} data-testid={`chips-${kind}`}>
      {chips.map((c, i) => (
        <span key={i} className={`chip ${c.tone}`} data-tone={c.tone} title={c.text}>
          {MARK[c.tone] && <span aria-hidden="true" className="mark">{MARK[c.tone]}</span>}
          {c.text}
        </span>
      ))}
    </p>
  );
}

/**
 * The chips the server computed for a listing (backend/db/chips.js): the same
 * in the row, the best find and the sheet. Values on the first line, yes/no
 * on the second; good ones marked ✓, bad ones ✗.
 */
export const Chips: React.FC<ChipsProps> = ({ chips, className = '' }) => {
  const list = (chips || []).filter((c) => c && typeof c.text === 'string' && c.text.trim());
  if (list.length === 0) return null;
  return (
    <div className={`chips ${className}`} data-testid="chips">
      <ChipLine chips={list.filter((c) => !isFlag(c))} kind="values" />
      <ChipLine chips={list.filter(isFlag)} kind="flags" />
    </div>
  );
};

export default Chips;
