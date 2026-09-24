/**
 * Probe API: Server-Sent Events (SSE) streaming endpoint for market probing.
 *
 * Implements plan §5.9:
 * - POST /api/probe -> spawns scraper/main.py --mode probe
 * - Streams progress lines (__PROBE_RUNG__:{json}) as SSE events
 * - Emits final market picture (__PROBE_RESULT__:{json})
 * - Aborts Python child process on client disconnect (res.on('close'))
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

function setupProbeApi(app) {
  app.post('/api/probe', (req, res) => {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Prevent reverse-proxy buffering (e.g. Nginx)
    });
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const payload = req.body || {};
    const args = [
      '--mode', 'probe',
      '--payload-json', JSON.stringify(payload),
    ];

    const pythonBin = path.join(__dirname, '..', '.venv', 'bin', 'python3');
    const scriptPath = path.join(__dirname, '..', 'scraper', 'main.py');

    const python = spawn(pythonBin, [scriptPath, ...args], {
      env: { ...process.env },
    });

    // Abort python process if client closes connection before stream ends
    res.on('close', () => {
      if (!res.writableFinished) {
        python.kill('SIGTERM');
      }
    });

    const rl = readline.createInterface({ input: python.stdout });

    rl.on('line', (line) => {
      if (line.startsWith('__PROBE_RUNG__:')) {
        const jsonStr = line.slice('__PROBE_RUNG__:'.length).trim();
        res.write(`event: rung\ndata: ${jsonStr}\n\n`);
      } else if (line.startsWith('__PROBE_RESULT__:')) {
        const jsonStr = line.slice('__PROBE_RESULT__:'.length).trim();
        res.write(`event: result\ndata: ${jsonStr}\n\n`);
      } else if (line.startsWith('__PROBE_ERROR__:')) {
        const errStr = line.slice('__PROBE_ERROR__:'.length).trim();
        res.write(`event: error\ndata: ${JSON.stringify({ error: errStr })}\n\n`);
      }
    });

    python.stderr.on('data', (data) => {
      console.error(`[probe stderr]: ${data}`);
    });

    python.on('error', (err) => {
      console.error('Probe execution error:', err);
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    });

    python.on('close', (code) => {
      res.write(`event: done\ndata: ${JSON.stringify({ code })}\n\n`);
      res.end();
    });
  });
}

module.exports = setupProbeApi;
