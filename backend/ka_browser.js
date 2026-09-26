/**
 * The Kleinanzeigen session: one real Chrome on this server, its own profile,
 * the buyer logging in themselves.
 *
 * The server has no screen, so the login page is shown in the app instead: the
 * browser runs under a virtual display (Xvfb), its frames are streamed as
 * JPEGs (CDP screencast), and taps and keys from the app are replayed into it.
 * Whatever Kleinanzeigen asks -- e-mail, password, a code, a captcha -- a
 * person answers; no password passes through anything but that stream, and
 * nothing here stores or logs one.
 *
 * The session lives in the Chrome profile (data/ka_profile, owner-only). A
 * later step (writing to sellers) opens the same profile.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DATA = path.join(__dirname, '..', 'data');
const PROFILE = path.join(DATA, 'ka_profile');
const STATE = path.join(DATA, 'ka_session.json');
const LOGIN_URL = 'https://www.kleinanzeigen.de/m-einloggen.html';
const HOME = 'https://www.kleinanzeigen.de/';
const VIEW = { width: 400, height: 780, deviceScaleFactor: 2 };
const DISPLAY = process.env.PRISMDEALS_KA_DISPLAY || ':98';
const IDLE_MS = 10 * 60 * 1000; // a login left open closes itself
const SANDBOX = '/usr/local/sbin/chrome-devel-sandbox';

/** Chrome for Testing as Selenium keeps it, newest first; or PRISMDEALS_CHROME. */
function chromePath() {
  if (process.env.PRISMDEALS_CHROME) return process.env.PRISMDEALS_CHROME;
  const root = path.join(os.homedir(), '.cache', 'selenium', 'chrome', 'linux64');
  const versions = fs.existsSync(root) ? fs.readdirSync(root) : [];
  const newest = versions
    .map(v => ({ v, parts: v.split('.').map(Number) }))
    .sort((a, b) => {
      for (let i = 0; i < 4; i++) if (a.parts[i] !== b.parts[i]) return b.parts[i] - a.parts[i];
      return 0;
    })
    .map(x => path.join(root, x.v, 'chrome'))
    .find(p => fs.existsSync(p));
  if (!newest) throw new Error('Kein Chrome gefunden (PRISMDEALS_CHROME setzen).');
  return newest;
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return { connected: false };
  }
}

function writeState(state) {
  fs.writeFileSync(STATE, JSON.stringify(state), { mode: 0o600 });
}

let xvfb = null;
function ensureDisplay() {
  const lock = `/tmp/.X${DISPLAY.replace(':', '')}-lock`;
  if (xvfb || fs.existsSync(lock)) return;
  xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', '1280x900x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
  xvfb.on('exit', () => { xvfb = null; });
}

let session = null; // { browser, page, cdp, frame, seq, timer, idle, done }

async function launch() {
  const puppeteer = require('puppeteer-core');
  fs.mkdirSync(PROFILE, { recursive: true, mode: 0o700 });
  ensureDisplay();
  await new Promise(r => setTimeout(r, 300));
  const env = { ...process.env, DISPLAY };
  if (fs.existsSync(SANDBOX)) env.CHROME_DEVEL_SANDBOX = SANDBOX;
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: false, // headful under Xvfb: the site sees an ordinary browser
    userDataDir: PROFILE,
    env,
    defaultViewport: VIEW,
    // An ordinary browser, not one that announces it is remote-controlled:
    // with the automation flag Kleinanzeigen answered the login page with
    // "IP-Bereich vorübergehend gesperrt" while plain requests went through.
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--lang=de-DE',
      '--disable-blink-features=AutomationControlled',
      `--window-size=${VIEW.width + 20},${VIEW.height + 120}`,
    ],
  });
  const [page] = await browser.pages();
  return { browser, page };
}

/** Whether the profile is logged in: a page of one's own is not sent to the login. */
async function loggedIn(page) {
  if (!/^https:\/\/www\.kleinanzeigen\.de\//.test(page.url())) return false;
  return page.evaluate(async () => {
    const r = await fetch('/m-meine-anzeigen.html', { redirect: 'manual', credentials: 'include' });
    return r.type !== 'opaqueredirect' && r.ok;
  }).catch(() => false);
}

async function stop() {
  const s = session;
  session = null;
  if (!s) return;
  clearInterval(s.timer);
  clearTimeout(s.idle);
  await s.browser.close().catch(() => {});
}

function touch() {
  if (!session) return;
  clearTimeout(session.idle);
  session.idle = setTimeout(stop, IDLE_MS);
}

/** Opens the login page and starts streaming it. */
async function startLogin() {
  await stop();
  const { browser, page } = await launch();
  const cdp = await page.createCDPSession();
  session = { browser, page, cdp, frame: null, seq: 0, timer: null, idle: null, done: false };
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    if (!session) return;
    session.frame = Buffer.from(data, 'base64');
    session.seq += 1;
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: VIEW.width * 2, maxHeight: VIEW.height * 2 });
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  // Watch for the moment the login is through.
  session.timer = setInterval(async () => {
    const s = session;
    if (!s || s.done) return;
    if (await loggedIn(s.page)) {
      s.done = true;
      writeState({ connected: true, since: new Date().toISOString() });
      setTimeout(stop, 1500); // let the app show the logged-in page once
    }
  }, 2000);
  touch();
  return { view: { width: VIEW.width, height: VIEW.height } };
}

function frame(after) {
  if (!session) return { state: readState().connected ? 'connected' : 'closed' };
  if (session.done) return { state: 'connected' };
  if (!session.frame || session.seq <= after) return { state: 'open', seq: session.seq };
  return { state: 'open', seq: session.seq, jpeg: session.frame };
}

/** A tap, typed text, a key or a scroll from the app, replayed in the page,
 * one after the other in the order they came. */
function input(event) {
  if (!session || session.done) return Promise.resolve(false);
  touch();
  const s = session;
  s.queue = (s.queue || Promise.resolve()).then(() => replay(s.page, event)).catch(() => false);
  return s.queue;
}

async function replay(page, event) {
  const x = Number(event.x);
  const y = Number(event.y);
  switch (event.type) {
    case 'click':
      if (Number.isFinite(x) && Number.isFinite(y)) await page.mouse.click(x, y);
      return true;
    case 'text':
      if (typeof event.text === 'string' && event.text.length <= 200) await page.keyboard.type(event.text);
      return true;
    case 'key':
      if (['Enter', 'Backspace', 'Tab', 'Escape', 'ArrowLeft', 'ArrowRight'].includes(event.key)) await page.keyboard.press(event.key);
      return true;
    case 'scroll':
      if (Number.isFinite(Number(event.dy))) await page.mouse.wheel({ deltaY: Number(event.dy) });
      return true;
    case 'back':
      await page.goBack().catch(() => {});
      return true;
    default:
      return false;
  }
}

/** Forgets the session: the profile goes, and with it every cookie. */
async function logout() {
  await stop();
  fs.rmSync(PROFILE, { recursive: true, force: true });
  writeState({ connected: false });
}

function status() {
  const state = readState();
  return { connected: Boolean(state.connected), since: state.since || null, login_open: Boolean(session && !session.done) };
}

module.exports = { startLogin, frame, input, stop, logout, status, loggedIn, launch, PROFILE, HOME };
