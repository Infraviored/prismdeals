// The project's Python, for every endpoint that runs a scraper script.
//
// It was written out four times with four different candidate lists, and one
// endpoint (the probe) skipped the search altogether.

const fs = require('fs');
const path = require('path');

const CANDIDATES = [
  path.join(__dirname, '..', '.venv', 'bin', 'python3'),
  path.join(__dirname, '..', 'venv', 'bin', 'python3'),
];

function findPython() {
  return CANDIDATES.find(candidate => fs.existsSync(candidate)) || 'python3';
}

module.exports = { findPython };
