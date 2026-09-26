// The project's Python, for every endpoint that runs a scraper script.
//
// It was written out four times with four different candidate lists, and one
// endpoint (the probe) skipped the search altogether.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SCRAPER = path.join(__dirname, '..', 'scraper');

const CANDIDATES = [
  path.join(__dirname, '..', '.venv', 'bin', 'python3'),
  path.join(__dirname, '..', 'venv', 'bin', 'python3'),
];

function findPython() {
  return CANDIDATES.find(candidate => fs.existsSync(candidate)) || 'python3';
}

/**
 * Runs a graph command (scraper/graph/cli.py); resolves {status, body}.
 * Exit 2 is "KI nicht erreichbar" (503), exit 1 a refused input (400).
 */
function graph(args, input = null) {
  return runJson(['-m', 'graph.cli', ...args], input);
}

function runJson(args, input) {
  return new Promise(resolve => {
    const child = spawn(findPython(), args, { cwd: SCRAPER, env: { ...process.env } });
    let out = '';
    let err = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('error', e => resolve({ status: 500, body: { error: e.message } }));
    child.on('close', code => {
      let body;
      try {
        body = JSON.parse(out.trim().split('\n').pop() || '{}');
      } catch {
        console.error('graph %s: unreadable output: %s %s', args.join(' '), out.slice(-300), err.slice(-500));
        return resolve({ status: 500, body: { error: 'Interner Fehler, siehe Server-Log.' } });
      }
      if (code === 2) return resolve({ status: 503, body });
      if (code !== 0) {
        if (!body.error) console.error('graph %s failed: %s', args.join(' '), err.slice(-500));
        return resolve({ status: body.error ? 400 : 500, body });
      }
      resolve({ status: 200, body });
    });
    // A child that dies before reading its input breaks the pipe; 'close'
    // reports that failure, an unhandled EPIPE would end the server.
    child.stdin.on('error', () => {});
    if (input !== null) child.stdin.end(input);
  });
}


module.exports = { findPython, graph, runJson };
