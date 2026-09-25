import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { HuntRequirement } from '../../types';
import { Plus, X } from 'lucide-react';

export interface DetailsFeaturesProps {
  musts: HuntRequirement[];
  onChangeMusts: (musts: HuntRequirement[]) => void;
  prefs: HuntRequirement[];
  onChangePrefs: (prefs: HuntRequirement[]) => void;
}

export const DetailsFeatures: React.FC<DetailsFeaturesProps> = ({
  musts,
  onChangeMusts,
  prefs,
  onChangePrefs,
}) => {
  const { t } = useTranslation();
  const [mustInputVal, setMustInputVal] = useState('');
  const [prefInputVal, setPrefInputVal] = useState('');

  const handleAddMust = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = mustInputVal.trim();
    if (!val) return;
    if (!musts.some((m) => (m.label || m.id).toLowerCase() === val.toLowerCase())) {
      onChangeMusts([...musts, { id: val, label: val, want: { text: val }, type: 'text' }]);
    }
    setMustInputVal('');
  };

  const handleRemoveMust = (idx: number) => {
    onChangeMusts(musts.filter((_, i) => i !== idx));
  };

  const handleAddPref = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = prefInputVal.trim();
    if (!val) return;
    if (!prefs.some((p) => (p.label || p.id).toLowerCase() === val.toLowerCase())) {
      onChangePrefs([...prefs, { id: val, label: val, want: { text: val }, type: 'text' }]);
    }
    setPrefInputVal('');
  };

  const handleRemovePref = (idx: number) => {
    onChangePrefs(prefs.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      {/* Musts */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[#8FA6A1]">
          {t('hunt.featuresMustTitle')}
        </label>
        <form onSubmit={handleAddMust} className="flex gap-2">
          <input
            type="text"
            data-testid="hunt-must-input"
            value={mustInputVal}
            onChange={(e) => setMustInputVal(e.target.value)}
            placeholder={t('hunt.featuresMustAddPlaceholder')}
            className="flex-1 px-3.5 py-2 rounded-lg bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#8FA6A1] text-sm"
          />
          <button
            type="submit"
            disabled={!mustInputVal.trim()}
            className="px-3 py-2 rounded-lg bg-[#0E4A40] hover:bg-[#135d50] text-[#E4D6BE] text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>
        <div className="flex flex-wrap gap-2 pt-1">
          {musts.map((must, idx) => (
            <span
              key={must.id || idx}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00100F] border border-[#0E4A40] text-xs font-medium text-[#E4D6BE]"
            >
              <span>{must.label || must.id}</span>
              <button
                type="button"
                onClick={() => handleRemoveMust(idx)}
                className="hover:text-[#E87967] transition-colors p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Prefs */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[#8FA6A1]">
          {t('hunt.featuresPrefTitle')}
        </label>
        <form onSubmit={handleAddPref} className="flex gap-2">
          <input
            type="text"
            data-testid="hunt-pref-input"
            value={prefInputVal}
            onChange={(e) => setPrefInputVal(e.target.value)}
            placeholder={t('hunt.featuresPrefAddPlaceholder')}
            className="flex-1 px-3.5 py-2 rounded-lg bg-[#00100F] border border-[#0E4A40] text-[#F2F5F4] placeholder-[#8FA6A1]/40 focus:outline-none focus:border-[#8FA6A1] text-sm"
          />
          <button
            type="submit"
            disabled={!prefInputVal.trim()}
            className="px-3 py-2 rounded-lg bg-[#0E4A40] hover:bg-[#135d50] text-[#E4D6BE] text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>
        <div className="flex flex-wrap gap-2 pt-1">
          {prefs.map((pref, idx) => (
            <span
              key={pref.id || idx}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00100F] border border-[#0E4A40]/70 text-xs text-[#8FA6A1]"
            >
              <span>{pref.label || pref.id}</span>
              <button
                type="button"
                onClick={() => handleRemovePref(idx)}
                className="hover:text-[#E87967] transition-colors p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DetailsFeatures;
