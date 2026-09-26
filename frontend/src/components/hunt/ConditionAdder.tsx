import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { Attribute, Condition, Importance, Op } from '../../types/hunt';
import { opsFor } from '../../utils/huntDoc';
import { choice } from './choice';

const OWN = '__own';
const OWN_OPS: Op[] = ['present', 'absent', 'max', 'min', 'eq'];

const field =
  'bg-[#00100F] border border-[#0E4A40] rounded px-2.5 py-1.5 text-sm text-[#F2F5F4] focus:outline-none focus:border-[#8FA6A1]';

export interface ConditionAdderProps {
  attributes: Attribute[];
  onAdd: (condition: Condition) => void;
}

/** One new condition: a known attribute of the target, or the buyer's own word. */
export const ConditionAdder: React.FC<ConditionAdderProps> = ({ attributes, onAdd }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [attrId, setAttrId] = useState<string>(attributes[0]?.id ?? OWN);
  const [ownLabel, setOwnLabel] = useState('');
  const attribute = attributes.find((a) => a.id === attrId);
  const ops = attribute ? opsFor(attribute.type) : OWN_OPS;
  const [op, setOp] = useState<Op>(ops[0]);
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [importance, setImportance] = useState<Importance>('must');

  const reset = () => {
    setOpen(false);
    setOwnLabel('');
    setValue('');
    setPicked([]);
    setImportance('must');
  };

  const chooseAttribute = (id: string) => {
    setAttrId(id);
    const next = attributes.find((a) => a.id === id);
    setOp((next ? opsFor(next.type) : OWN_OPS)[0]);
    setValue('');
    setPicked([]);
  };

  const label = attribute ? attribute.label : ownLabel.trim();
  const numeric = op === 'min' || op === 'max' || (op === 'eq' && attribute?.type === 'number');
  const list = op === 'in' || op === 'not_in';
  const needsValue = op !== 'present' && op !== 'absent';
  const ready =
    Boolean(label) &&
    (!needsValue || (list ? picked.length > 0 : value.trim() !== '' && (!numeric || !isNaN(Number(value)))));

  const add = () => {
    if (!ready) return;
    const v: Condition['value'] = !needsValue ? null : list ? picked : numeric ? Number(value) : value.trim();
    onAdd({ ...(attribute ? { attr_id: attribute.id } : {}), label, op, value: v, importance });
    reset();
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-xs text-[#E4D6BE] hover:text-[#F2F5F4] cursor-pointer" data-testid="condition-add-open">
        {t('huntEdit.addCondition')}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-[#0E4A40] p-3" data-testid="condition-adder">
      <div className="flex flex-wrap gap-2">
        <select aria-label={t('huntEdit.attribute')} value={attrId} onChange={(e) => chooseAttribute(e.target.value)} className={`${field} min-w-0 flex-1`}>
          {attributes.map((a) => (
            <option key={a.id} value={a.id}>{a.label}{a.unit ? ` (${a.unit})` : ''}</option>
          ))}
          <option value={OWN}>{t('huntEdit.ownAttribute')}</option>
        </select>
        <select aria-label={t('huntEdit.operator')} value={op} onChange={(e) => setOp(e.target.value as Op)} className={field}>
          {ops.map((o) => (
            <option key={o} value={o}>{t(`huntEdit.opName_${o}` as 'huntEdit.opName_min')}</option>
          ))}
        </select>
      </div>
      {!attribute && (
        <input type="text" value={ownLabel} onChange={(e) => setOwnLabel(e.target.value)} placeholder={t('huntEdit.ownPlaceholder')} className={field} aria-label={t('huntEdit.ownAttribute')} />
      )}
      {needsValue && list && attribute?.options && (
        <div className="flex flex-wrap gap-1.5">
          {/* The label is what is stored, as the readers store it ("Sehr Gut", not like_new). */}
          {attribute.options.map((o) => (
            <button key={o.value} type="button" className={choice(picked.includes(o.label))}
              onClick={() => setPicked((p) => (p.includes(o.label) ? p.filter((x) => x !== o.label) : [...p, o.label]))}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {needsValue && !(list && attribute?.options) && (
        <input type={numeric ? 'number' : 'text'} inputMode={numeric ? 'numeric' : undefined} value={value}
          onChange={(e) => setValue(e.target.value)} placeholder={t('huntEdit.value')} aria-label={t('huntEdit.value')}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} className={field} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={choice(importance === 'must')} onClick={() => setImportance('must')}>{t('huntEdit.must')}</button>
        <button type="button" className={choice(importance === 'wish')} onClick={() => setImportance('wish')}>{t('huntEdit.wish')}</button>
        <span className="flex-1" />
        <button type="button" onClick={reset} className="px-3 py-1.5 text-xs text-[#8FA6A1] cursor-pointer">{t('huntEdit.cancel')}</button>
        <button type="button" onClick={add} disabled={!ready} data-testid="condition-add"
          className="px-3 py-1.5 rounded text-xs font-semibold bg-[#E4D6BE] text-[#011F1F] disabled:opacity-40 cursor-pointer">
          {t('huntEdit.add')}
        </button>
      </div>
    </div>
  );
};

export default ConditionAdder;
