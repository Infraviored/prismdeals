/**
 * Mapping between category playbook fields and Kleinanzeigen taxonomy filters.
 *
 * Reads canonical mappings from data/playbook_filters.json.
 */

const fs = require('fs');
const path = require('path');

const MAPPINGS_FILE = path.join(__dirname, '..', 'data', 'playbook_filters.json');

let mappings = {};
try {
  if (fs.existsSync(MAPPINGS_FILE)) {
    const data = JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf8'));
    mappings = data.mappings || {};
  }
} catch {
  mappings = {};
}

const PLAYBOOK_FIELD_TO_FILTER = mappings;

const FILTER_TO_FIELD = {};
for (const [pbKey, fields] of Object.entries(PLAYBOOK_FIELD_TO_FILTER)) {
  FILTER_TO_FIELD[pbKey] = {};
  for (const [fieldId, filterKey] of Object.entries(fields)) {
    FILTER_TO_FIELD[pbKey][filterKey] = fieldId;
  }
}

function getTaxonomyFilteredFieldIds(playbookKey) {
  const fields = PLAYBOOK_FIELD_TO_FILTER[playbookKey];
  return fields ? new Set(Object.keys(fields)) : new Set();
}

function getFilterForField(playbookKey, fieldId) {
  return PLAYBOOK_FIELD_TO_FILTER[playbookKey]?.[fieldId] || null;
}

function getFieldForFilter(playbookKey, filterKey) {
  return FILTER_TO_FIELD[playbookKey]?.[filterKey] || null;
}

module.exports = {
  PLAYBOOK_FIELD_TO_FILTER,
  FILTER_TO_FIELD,
  getTaxonomyFilteredFieldIds,
  getFilterForField,
  getFieldForFilter,
};
