const fs = require('fs');
const path = require('path');

const TRANSLATIONS_PATH = path.join(__dirname, '../frontend/src/i18n/translations.ts');
const SRC_DIR = path.join(__dirname, '../frontend/src');

function loadTranslations() {
  const content = fs.readFileSync(TRANSLATIONS_PATH, 'utf8');
  // Extract translations object from TS file
  const startIdx = content.indexOf('{');
  const endIdx = content.lastIndexOf('} as const;');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Could not parse translations.ts structure.');
  }
  const objStr = content.slice(startIdx, endIdx + 1);
  // Evaluate the object string
  const getObj = new Function(`return ${objStr};`);
  return getObj();
}

function getKeys(obj, prefix = '') {
  let keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(getKeys(value, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

function scanFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'i18n' && file !== 'dist') {
        scanFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function main() {
  console.log('Validating i18n translations...');
  
  let translations;
  try {
    translations = loadTranslations();
  } catch (err) {
    console.error('Error loading translations:', err.message);
    process.exit(1);
  }

  const enKeys = getKeys(translations.en);
  const deKeys = getKeys(translations.de);

  console.log(`Found ${enKeys.length} English keys and ${deKeys.length} German keys.`);

  // 1. Check dictionary alignment
  const missingInDe = enKeys.filter(k => !deKeys.includes(k));
  const missingInEn = deKeys.filter(k => !enKeys.includes(k));

  let errorsFound = false;

  if (missingInDe.length > 0) {
    console.error('\n✗ The following keys are in English but missing in German:');
    missingInDe.forEach(k => console.error(`  - ${k}`));
    errorsFound = true;
  }

  if (missingInEn.length > 0) {
    console.error('\n✗ The following keys are in German but missing in English:');
    missingInEn.forEach(k => console.error(`  - ${k}`));
    errorsFound = true;
  }

  // 2. Scan source code references
  const files = scanFiles(SRC_DIR);
  const tRegex = /\bt\(\s*(['"])([a-zA-Z0-9_\-\.]+)\1/g;
  const invalidReferences = [];

  files.forEach(filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, idx) => {
      let match;
      // Reset regex index
      tRegex.lastIndex = 0;
      while ((match = tRegex.exec(line)) !== null) {
        const key = match[2];
        if (!enKeys.includes(key)) {
          invalidReferences.push({
            file: path.relative(path.join(__dirname, '..'), filePath),
            line: idx + 1,
            key
          });
        }
      }
    });
  });

  if (invalidReferences.length > 0) {
    console.error('\n✗ Found invalid/untranslated keys referenced in source files:');
    invalidReferences.forEach(ref => {
      console.error(`  - ${ref.file}:${ref.line} -> key "${ref.key}" not found in translation dictionary`);
    });
    errorsFound = true;
  }

  if (errorsFound) {
    console.error('\n✗ i18n translation validation failed.');
    process.exit(1);
  } else {
    console.log('\n✓ All translation keys are fully aligned and valid!');
    process.exit(0);
  }
}

main();
