/**
 * Intent parsing and candidate model proposal APIs (Packages P4 & P5).
 *
 * Exposes:
 *   POST /api/intent/parse
 *     Input: { text: string, category?: string|number }
 *     Output: { text, hunt_type, confidence, musts, prefs, filters, use, models, sizes, budget, class }
 *
 *   POST /api/intent/models
 *     Input: { class_text: string, budget?: number|string, category?: string|number, use?: string }
 *     Output: { models: [{ model: string, years: string }] }
 */

const express = require('express');
const path = require('path');
const { findPython } = require('./python');
const { spawn } = require('child_process');

const router = express.Router();


function runPythonJson(scriptName, args, stdinInput = null) {
  return new Promise((resolve, reject) => {
    const python = findPython();
    const scriptPath = path.join(__dirname, '..', 'scraper', scriptName);
    const child = spawn(python, [scriptPath, ...args], {
      env: {
        ...process.env,
        PYTHONPATH: path.join(__dirname, '..', 'scraper'),
      },
    });

    let out = '';
    let err = '';

    if (stdinInput) {
      child.stdin.write(stdinInput);
      child.stdin.end();
    }

    child.stdout.on('data', d => {
      out += d.toString();
    });

    child.stderr.on('data', d => {
      err += d.toString();
    });

    child.on('error', spawnErr => {
      console.error(`Failed to spawn python script ${scriptName}:`, spawnErr.message);
      reject(spawnErr);
    });

    child.on('close', code => {
      if (code !== 0) {
        console.error(`Python script ${scriptName} exited with code ${code}: ${err}`);
        return reject(new Error(`Script exited with code ${code}: ${err.slice(0, 300)}`));
      }
      try {
        const parsed = JSON.parse(out.trim());
        resolve(parsed);
      } catch (parseErr) {
        console.error(`Failed to parse JSON output from ${scriptName}:`, out.slice(0, 300));
        reject(new Error(`Invalid JSON output from ${scriptName}`));
      }
    });
  });
}

// POST /api/intent/parse
router.post('/api/intent/parse', async (req, res) => {
  const text = req.body && (req.body.text || req.body.query);
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text query is required' });
  }

  const category = req.body.category ? String(req.body.category).trim() : null;
  const args = [text.trim()];
  if (category) {
    args.push('--category', category);
  }

  try {
    const result = await runPythonJson('intent.py', args);
    return res.json(result);
  } catch (err) {
    console.error('Error parsing intent:', err.message);
    return res.status(500).json({ error: 'Failed to parse intent' });
  }
});

// POST /api/intent/models
router.post('/api/intent/models', async (req, res) => {
  const classText = req.body && (req.body.class_text || req.body.class);
  if (!classText || typeof classText !== 'string' || !classText.trim()) {
    return res.status(400).json({ error: 'class_text is required' });
  }

  const args = [classText.trim()];
  if (req.body.budget) {
    args.push('--budget', String(req.body.budget));
  }
  if (req.body.category) {
    args.push('--category', String(req.body.category));
  }
  if (req.body.use) {
    args.push('--use', String(req.body.use));
  }
  // With a hunt frame, each proposal is looked up on the market: count, median,
  // and whether its name appears in titles at all.
  if (req.body.frame && typeof req.body.frame === 'object') {
    args.push('--probe', JSON.stringify(req.body.frame));
  }

  try {
    const models = await runPythonJson('model_proposals.py', args);
    return res.json({ models: Array.isArray(models) ? models : [] });
  } catch (err) {
    console.error('Error proposing models:', err.message);
    return res.status(500).json({ error: 'Failed to propose models' });
  }
});

// POST /api/hunt/edit
// A hunt changed in the buyer's words ("nur SC59 bei der CBR, unter 5000 km").
// Body: { document, instruction }. Answers the changed document and what
// changed; nothing is saved here -- the edit screen shows it, then saves.
router.post('/api/hunt/edit', async (req, res) => {
  const { document, instruction } = req.body || {};
  if (!document || typeof document !== 'object' || !Array.isArray(document.models)) {
    return res.status(400).json({ error: 'document with models is required' });
  }
  if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
    return res.status(400).json({ error: 'instruction is required' });
  }
  try {
    const result = await runPythonJson('hunt_edit.py', [], JSON.stringify({ document, instruction }));
    if (result.error) return res.status(422).json(result);
    return res.json(result);
  } catch (err) {
    console.error('Hunt edit failed:', err.message);
    return res.status(500).json({ error: 'Die Änderung konnte nicht berechnet werden.' });
  }
});

module.exports = router;
