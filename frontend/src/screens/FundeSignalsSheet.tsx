import React, { useCallback, useEffect, useState } from 'react';
import { Sheet } from '../components/surface';
import { useTranslation } from '../hooks/useTranslation';
import type { HuntSignals, Signal } from '../types/hunt';
import { api } from '../utils/api';

export interface FundeSignalsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  huntId: number;
  /** Adds the signal as a wish to the hunt; true when it was stored. */
  onAdd: (signal: Signal) => Promise<boolean>;
}

/** What a yes/no signal is: something the buyer wants, or something that bothers. */
const isYesNo = (s: Signal) => s.polarity !== 'value' && s.type === 'boolean';

/**
 * What the offers of the hunt's product differ in, and how often an offer
 * states it (GET /api/hunts/:id/signals). A yes/no one becomes a wish with one
 * tap; a value is shown in the list anyway.
 */
export const FundeSignalsSheet: React.FC<FundeSignalsSheetProps> = ({ isOpen, onClose, huntId, onAdd }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<HuntSignals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<HuntSignals>(`/api/hunts/${huntId}/signals`)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch(() => setError(t('surface.signalsLoadFailed'))),
    [huntId, t]
  );

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const add = async (signal: Signal) => {
    if (adding) return;
    setAdding(signal.attr_id);
    try {
      if (await onAdd(signal)) await load();
    } finally {
      setAdding(null);
    }
  };

  const signals = data?.signals || [];

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={t('surface.signals')}>
      <div className="flex flex-col" data-testid="signals-sheet">
        {error && (
          <p className="text-xs text-[#E87967] pb-3" role="alert">
            {error}
          </p>
        )}
        {data && signals.length === 0 && <p className="text-sm text-[#8FA6A1]" data-testid="signals-empty">{t('surface.signalsEmpty')}</p>}
        {data?.node && signals.length > 0 && (
          <p className="text-xs text-[#8FA6A1] pb-2">{t('surface.signalsLead', { name: data.node.name })}</p>
        )}
        <ul className="flex flex-col">
          {signals.map((s) => (
            <li key={s.attr_id} className="flex items-center gap-3 py-2.5 border-b border-[#0E4A40]" data-testid="signal-row">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[#F2F5F4] break-words">
                  {t('surface.signalFrequency', { label: s.label, found: s.found, total: s.total })}
                </p>
                <p
                  className={`text-xs ${
                    !isYesNo(s) ? 'text-[#8FA6A1]' : s.polarity === 'minus' ? 'text-[#F0A193]' : 'text-[#9FD4B4]'
                  }`}
                >
                  {!isYesNo(s) ? t('surface.signalValue') : s.polarity === 'minus' ? t('surface.signalMinus') : t('surface.signalPlus')}
                </p>
              </div>
              {isYesNo(s) &&
                (s.in_hunt ? (
                  <span className="badge text-xs text-[#8FA6A1]">{t('surface.signalInHunt')}</span>
                ) : (
                  <button
                    type="button"
                    className="btn shrink-0"
                    disabled={adding !== null}
                    aria-label={t('surface.signalAddLabel', { label: s.label })}
                    onClick={() => add(s)}
                  >
                    {adding === s.attr_id ? t('surface.signalAdding') : t('surface.signalAdd')}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
};

export default FundeSignalsSheet;
