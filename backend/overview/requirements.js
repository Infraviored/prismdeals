// Playbook field labels and units for computing human-readable requirement summaries.
const FIELD_INFO = {
  generation: { label: 'Generation', unit: '' },
  formFactor: { label: 'Bauform', unit: '' },
  stickCount: { label: 'Anzahl Module', unit: 'Module' },
  gbPerStick: { label: 'GB je Modul', unit: 'GB' },
  totalGb: { label: 'GB gesamt', unit: 'GB' },
  speedMhz: { label: 'Taktung', unit: 'MHz' },
  casLatency: { label: 'CAS-Latenz', unit: '' },
  isKit: { label: 'Matched Kit', unit: '' },
  hasFunctionalDefect: { label: 'Defekt', unit: '' },
  sealed: { label: 'Ungeöffnet', unit: '' },
  conditionGrade: { label: 'Zustand', unit: '' },
  productLine: { label: 'Produktlinie', unit: '' },
};

function formatRequirementText(field) {
  const fid = field.id;
  const wants = field.buyer_wants || {};
  // A requirement in the buyer's own words has no playbook entry: its label
  // is the words ("own_innenraum" stood in the aside).
  const info = FIELD_INFO[fid] || { label: field.label || fid, unit: '' };
  // An exact wish is either a match or a range that collapses to one value.
  const exact = wants.match ?? (wants.min !== undefined && wants.min === wants.max ? wants.min : undefined);

  if (fid === 'stickCount') {
    const words = { 1: 'Ein Riegel', 2: 'Zwei Riegel', 4: 'Vier Riegel' };
    if (words[exact]) return words[exact];
    if (exact !== undefined) return `${exact} Riegel`;
    if (wants.min !== undefined) return `mind. ${wants.min} Riegel`;
    if (wants.max !== undefined) return `höchstens ${wants.max} Riegel`;
  }
  if (fid === 'gbPerStick') {
    if (exact !== undefined) return `${exact} GB je Riegel`;
  }
  if (fid === 'generation') {
    if (wants.match) return String(wants.match).toUpperCase();
    if (Array.isArray(wants.preferred)) return wants.preferred.map(g => g.toUpperCase()).join(' / ');
  }
  if (fid === 'formFactor') {
    if (wants.match) return String(wants.match).toUpperCase();
    if (Array.isArray(wants.preferred)) return wants.preferred.map(f => f.toUpperCase()).join(' / ');
  }
  if (fid === 'speedMhz') {
    if ('match' in wants) return `mindestens ${wants.match} MHz`;
    if (wants.min !== undefined) return `ab ${wants.min} MHz`;
  }
  if (fid === 'casLatency') {
    const maxVal = wants.max ?? wants.match;
    if (maxVal !== undefined) return `CL${maxVal} oder schneller`;
  }
  if (fid === 'hasFunctionalDefect') {
    if (wants.match === false) return 'kein Defekt';
    if (wants.match === true) return 'Defekt';
  }
  if (fid === 'productLine') {
    if (wants.present) return 'Produktlinie angegeben';
  }

  // Generic fallback
  if ('match' in wants) {
    if (typeof wants.match === 'boolean') return `${info.label}: ${wants.match ? 'ja' : 'nein'}`;
    return `${info.label}: ${wants.match}`;
  }
  if (wants.min !== undefined && wants.max !== undefined) {
    return wants.min === wants.max
      ? `${info.label} ${wants.min}${info.unit ? ' ' + info.unit : ''}`
      : `${info.label} ${wants.min}–${wants.max}${info.unit ? ' ' + info.unit : ''}`;
  }
  if (wants.min !== undefined) return `${info.label} ab ${wants.min}${info.unit ? ' ' + info.unit : ''}`;
  if (wants.max !== undefined) return `${info.label} bis ${wants.max}${info.unit ? ' ' + info.unit : ''}`;
  if (Array.isArray(wants.preferred)) return `${info.label}: ${wants.preferred.join(' / ')}`;
  if (Array.isArray(wants.excluded)) return `${info.label}: nicht ${wants.excluded.join(' / ')}`;
  return info.label;
}

function contradicts(wants, value) {
  if (value === null || value === undefined) return false;
  if ('match' in wants) {
    if (typeof value === 'boolean') {
      return value !== Boolean(wants.match);
    }
    if (typeof value === 'number') {
      return Number(value) !== Number(wants.match);
    }
    if (typeof value === 'string') {
      return String(value).trim().toLowerCase() !== String(wants.match).trim().toLowerCase();
    }
    return value !== wants.match;
  }
  if ('min' in wants && typeof value === 'number' && value < wants.min) {
    return true;
  }
  if ('max' in wants && typeof value === 'number' && value > wants.max) {
    return true;
  }
  if (Array.isArray(wants.preferred) && typeof value === 'string') {
    const lower = value.toLowerCase();
    return !wants.preferred.some(p => String(p).toLowerCase() === lower);
  }
  if (Array.isArray(wants.excluded) && typeof value === 'string') {
    const lower = value.toLowerCase();
    return wants.excluded.some(e => String(e).toLowerCase() === lower);
  }
  return false;
}

/**
 * Normalizes rejection reasons so variations (e.g. 3000 MHz vs 2666 MHz)
 * group together into meaningful aggregate buckets.
 */
function normalizeReason(raw) {
  if (!raw) return 'Ohne Begründung';
  const str = String(raw).trim();

  if (/sodimm.*statt.*dimm/i.test(str)) {
    return 'SODIMM statt DIMM';
  }

  // "Taktung 3000 MHz statt mind. 3200 MHz" -> "Taktung unter mind. 3200 MHz"
  const minMatch = str.match(/^(.+?)\s+[\d\.,]+\s*(\w+)?\s+statt\s+(mind\..+)$/);
  if (minMatch) {
    return `${minMatch[1]} unter ${minMatch[3]}`;
  }

  // "CAS-Latenz 18 statt höchstens 16" -> "CAS-Latenz über höchstens 16"
  const maxMatch = str.match(/^(.+?)\s+[\d\.,]+\s*(\w+)?\s+statt\s+(höchstens.+)$/);
  if (maxMatch) {
    return `${maxMatch[1]} über ${maxMatch[3]}`;
  }

  return str;
}

function computeRequirementStats(factsList, requirementFields) {
  return requirementFields.map(f => {
    const fid = f.id;
    const wants = f.buyer_wants || {};
    const info = FIELD_INFO[fid] || { label: f.label || fid, unit: '' };

    let passed = 0;
    let contradictedCount = 0;
    let missing = 0;

    for (const facts of factsList) {
      const val = facts[fid];
      if (val === undefined || val === null) {
        missing++;
      } else if (contradicts(wants, val)) {
        contradictedCount++;
      } else {
        passed++;
      }
    }

    const evalTotal = factsList.length;
    return {
      id: fid,
      label: info.label,
      unit: info.unit || null,
      text: formatRequirementText(f),
      buyer_wants: wants,
      survivors: evalTotal - contradictedCount,
      passed,
      contradicted: contradictedCount,
      missing,
      total: evalTotal,
    };
  });
}

function aggregateRejections(rejectionMap, exactRejectionMap) {
  const rejections = [...rejectionMap.entries()]
    .map(([reason, data]) => ({
      reason,
      count: data.count,
      examples: [...data.examples.entries()].map(([ex, c]) => (c > 1 ? `${ex} (${c})` : ex)),
    }))
    .sort((a, b) => b.count - a.count);

  const exactRejections = [...exactRejectionMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return { rejections, exactRejections };
}

module.exports = {
  FIELD_INFO,
  formatRequirementText,
  contradicts,
  normalizeReason,
  computeRequirementStats,
  aggregateRejections,
};
