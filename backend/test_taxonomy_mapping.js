const assert = require('assert');
const {
  PLAYBOOK_FIELD_TO_FILTER,
  FILTER_TO_FIELD,
  getTaxonomyFilteredFieldIds,
  getFilterForField,
  getFieldForFilter,
} = require('./taxonomy_mapping');

console.log('Testing taxonomy mapping table in JS...');

// Test 1: Motorcycles c305 mapping
const motoFields = PLAYBOOK_FIELD_TO_FILTER['vehicles/motorcycles'];
assert(motoFields, 'Missing vehicles/motorcycles in mapping');
assert.strictEqual(motoFields.mileageKm, 'motorraeder_roller.km_i');
assert.strictEqual(motoFields.firstRegistrationYear, 'motorraeder_roller.ez_i');
assert.strictEqual(motoFields.displacementCcm, 'motorraeder_roller.hubraum_i');
assert.strictEqual(motoFields.powerKw, 'motorraeder_roller.leistung_i');

// Test 2: Inverted mapping
assert.strictEqual(
  FILTER_TO_FIELD['vehicles/motorcycles']['motorraeder_roller.km_i'],
  'mileageKm'
);

// Test 3: Filtered field IDs set
const motoExcluded = getTaxonomyFilteredFieldIds('vehicles/motorcycles');
assert(motoExcluded.has('mileageKm'));
assert(motoExcluded.has('firstRegistrationYear'));
assert(motoExcluded.has('displacementCcm'));
assert(motoExcluded.has('powerKw'));
assert(!motoExcluded.has('crashDamage'), 'crashDamage must not be a taxonomy filter');
assert(!motoExcluded.has('storageCondition'), 'storageCondition must not be a taxonomy filter');

// Test 4: Helper methods
assert.strictEqual(getFilterForField('vehicles/motorcycles', 'mileageKm'), 'motorraeder_roller.km_i');
assert.strictEqual(getFieldForFilter('vehicles/motorcycles', 'motorraeder_roller.km_i'), 'mileageKm');

console.log('All taxonomy mapping JS tests passed!');
