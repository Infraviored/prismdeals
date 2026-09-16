#!/usr/bin/env python3
"""Log in and photograph the interface.

Every screen in this app sits behind a login, so until now the only way to know
what a change looked like was to ask the owner. Things shipped because of that
which nobody building them could see: a type scale too small to read, a dropdown
too narrow to show the town it was listing.

This starts a throwaway backend against a copy of the database, with a user whose
password is known, and walks the interface taking pictures. It touches nothing
that is running: its own port, its own database file, removed afterwards. The
backend serves the built frontend itself, so /api is same-origin and there is
nothing to proxy.

    ./venv/bin/python scripts/ui_shots.py
    ./venv/bin/python scripts/ui_shots.py --width 480      # phone width
    ./venv/bin/python scripts/ui_shots.py --keep           # leave it up to click
"""

import argparse
import os
import shutil
import socket
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scraper"))

import db_schema  # noqa: E402

EMAIL = "ui-shots@localhost"
PASSWORD = "ui-shots-only"


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for(url, timeout=45):
    import urllib.error
    import urllib.request

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except urllib.error.HTTPError:
            return True  # an answer of any kind means it is listening
        except Exception:
            time.sleep(0.4)
    return False


def make_test_user(db_path):
    """Hashed by the backend's own bcrypt, so the login it performs will match."""
    modules = os.path.join(ROOT, "backend", "node_modules")
    script = f"""
      const bcrypt = require({os.path.join(modules, "bcrypt")!r});
      const sqlite3 = require({os.path.join(modules, "sqlite3")!r}).verbose();
      const db = new sqlite3.Database({db_path!r});
      bcrypt.hash({PASSWORD!r}, 10, (err, hash) => {{
        if (err) {{ console.error(err); process.exit(1); }}
        db.run("DELETE FROM users WHERE email = ?", [{EMAIL!r}], () => {{
          db.run("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')",
            [{EMAIL!r}, hash],
            (err) => {{ if (err) {{ console.error(err); process.exit(1); }} process.exit(0); }});
        }});
      }});
    """
    subprocess.run(
        ["node", "-e", script], check=True, cwd=os.path.join(ROOT, "backend")
    )


def _find(root, name):
    for base, _dirs, files in os.walk(root):
        if name in files and os.access(os.path.join(base, name), os.X_OK):
            return os.path.join(base, name)
    return None


def build_driver(width, height):
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service

    options = Options()
    for flag in (
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--hide-scrollbars",
    ):
        options.add_argument(flag)
    options.add_argument(f"--window-size={width},{height}")

    chrome = _find(os.path.expanduser("~/.cache/selenium/chrome"), "chrome")
    if chrome:
        options.binary_location = chrome
    driver_path = _find(
        os.path.expanduser("~/.cache/selenium/chromedriver"), "chromedriver"
    )
    service = Service(executable_path=driver_path) if driver_path else Service()
    return webdriver.Chrome(service=service, options=options)


MAX_SHOT_HEIGHT = 6000


def shoot(driver, out_dir, name, settle=1.0, max_height=MAX_SHOT_HEIGHT):
    """The whole page, not just what happens to fit above the fold.

    The previous implementation grew the window to the full page height before
    calling save_screenshot. That worked visually, but corrupted Chrome's JS
    event dispatch after every shot: the DOM stayed live and fields accepted
    input, but click events never reached React's synthetic event listener
    delegation again. The workaround (reloading before every click) added
    ~5s of round-trips per campaign.

    Chrome DevTools Protocol's Page.captureScreenshot supports
    captureBeyondViewport=True, which captures the full document without
    touching the window size. The renderer stays healthy and the session
    stays authenticated.

    One screen in this app renders every listing it has without paging (the
    classic dashboard, 1070 of them), so the document can be a hundred thousand
    pixels tall. Above `max_height` the capture is clipped to the top of the
    document and the real height is returned, so the record can say so rather
    than the walk dying on an image nothing can open.

    Returns (width, height, captured_height) in CSS pixels.
    """
    import base64

    time.sleep(settle)
    path = os.path.join(out_dir, f"{name}.png")
    page_w = page_h = 0
    try:
        metrics = driver.execute_cdp_cmd("Page.getLayoutMetrics", {})
        size = metrics.get("cssContentSize") or metrics.get("contentSize") or {}
        page_w = int(size.get("width") or 0)
        page_h = int(size.get("height") or 0)
    except Exception:
        pass

    params = {"format": "png", "captureBeyondViewport": True, "fromSurface": True}
    shot_h = page_h
    if page_h and max_height and page_h > max_height:
        shot_h = max_height
        params["clip"] = {
            "x": 0,
            "y": 0,
            "width": page_w or 1440,
            "height": max_height,
            "scale": 1,
        }

    try:
        data = driver.execute_cdp_cmd("Page.captureScreenshot", params)
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(data["data"]))
    except Exception:
        # CDP unavailable (older ChromeDriver / non-Chrome); fall back to the
        # viewport-only screenshot so the walk still produces *something*.
        driver.save_screenshot(path)
    clipped = " (clipped from %d)" % page_h if shot_h != page_h else ""
    print(f"  {name}.png  {page_w}x{shot_h}{clipped}")
    return page_w, page_h, shot_h


def open_campaign(driver, campaign_id, name, settle=2.5):
    """Click the campaign card, the way a person reaches a campaign.

    Two URL-driven approaches failed before this one, and both failed silently
    by leaving the landing page on screen under a filename that claimed
    otherwise. `driver.get` on a URL differing only by its fragment performs no
    navigation at all in headless Chrome; assigning `location.hash` is undone
    within milliseconds by the app writing the hash back out of its own state.
    Clicking is also the more honest test -- it exercises the path a user takes.

    The card has `data-testid="campaign-card-{id}"` (added to LandingScreen.tsx
    as a single-line product-code change expressly allowed for stable automation
    selectors), so we can address each card with a direct CSS attribute selector
    that is unique, stable, and immune to DOM traversal order.
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    # Primary: direct testid selector (campaign-card-{id})
    testid = f"campaign-card-{campaign_id}"
    try:
        card = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, f"[data-testid='{testid}']"))
        )
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", card)
        time.sleep(0.3)
        hash_before = driver.execute_script("return window.location.hash;")
        # Use JS dispatch rather than Selenium's coordinate-based click: the
        # sticky header sits at the top of the viewport and can silently
        # intercept the native pointer event when scrollIntoView centres the card
        # near the top. JS .click() bypasses the visual hit-test layer entirely.
        driver.execute_script("arguments[0].click();", card)
        time.sleep(settle)
        hash_after = driver.execute_script("return window.location.hash;")
        print(f"    [{testid}] hash {hash_before!r} -> {hash_after!r}")
        return True
    except Exception as exc:
        print(f"    ! primary click failed: {exc}")
        pass

    # Fallback: scan all testid-anchored cards for the one whose text contains
    # the campaign name (covers the case where testid attr is absent in the build).
    for card in driver.find_elements(
        By.CSS_SELECTOR, "[data-testid^='campaign-card-']"
    ):
        try:
            if name and name.lower() in (card.text or "").lower():
                driver.execute_script(
                    "arguments[0].scrollIntoView({block:'center'});", card
                )
                time.sleep(0.2)
                driver.execute_script("arguments[0].click();", card)
                time.sleep(settle)
                return True
        except Exception:
            continue

    return False


def back_to_landing(driver, settle=2.0):
    """Navigate to the landing page from anywhere in the app.

    Clicks the logo in the app header, which calls navigate('landing', null, null)
    and is available on every authenticated screen. Single-step landing, regardless
    of the current depth (Dashboard → Landing, Edit → Landing, etc.).

    Fallback: if the logo cannot be found, try the first 'back to' button (which
    at most takes us one step up, not all the way to landing).
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    # The logo div has data-testid="header-logo" and calls navigate('landing', null, null).
    try:
        logo = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='header-logo']"))
        )
        driver.execute_script("arguments[0].click();", logo)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "[data-testid^='campaign-card-']")
            )
        )
        time.sleep(settle)
        return True
    except Exception:
        pass

    try:
        logo = WebDriverWait(driver, 3).until(
            EC.element_to_be_clickable(
                (By.XPATH, "//header//span[normalize-space()='prismdeals']")
            )
        )
        driver.execute_script("arguments[0].click();", logo)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "[data-testid^='campaign-card-']")
            )
        )
        time.sleep(settle)
        return True
    except Exception:
        pass

    # Fallback: a 'back to' button (may only go one level up)
    for btn in driver.find_elements(By.CSS_SELECTOR, "button"):
        txt = (btn.text or "").lower()
        if "back to" in txt or "zurück" in txt or "zuruck" in txt:
            driver.execute_script("arguments[0].click();", btn)
            time.sleep(settle)
            return True
    return False


# ---------------------------------------------------------------------------
# Measuring, not estimating
# ---------------------------------------------------------------------------
#
# Every number in docs/ui-journey.md comes out of this snippet, read from the
# live layout with getBoundingClientRect. Definitions, so the counts mean the
# same thing on every screen:
#
#   buttons  — visible <button> elements. Anchors are counted separately as
#              `links`, because a listing row is an <a> and would otherwise
#              inflate the button count of the results list by a hundred.
#   boxes    — Card components. Identified by the class signature the Card
#              component always emits (backdrop-blur-xl + rounded-2xl), which
#              is stable because it lives in one file, ui/Card.tsx.
#   rows     — [data-testid=listing-row], reported apart from the boxes.
#   words    — visible running text. Text inside <button>, <input>, <textarea>,
#              <select>, <script> and <style> is excluded; everything else a
#              reader sees is counted, including the prompt bodies in the AI
#              wizard, which are on screen as text.
#   content_y — top edge of the first element that is neither chrome nor
#              explanation, in document coordinates (so it matches the full
#              page screenshot). Passed in per screen; falls back to the first
#              listing row, else the first Card.
#
# `blocks` is the same walk used for the "what it says, verbatim" sections: it
# returns every visible text-bearing element top to bottom with its y, so the
# document quotes the screen instead of paraphrasing it.

MEASURE_JS = r"""
const contentSel = arguments[0];

function vis(el) {
  if (!el || !el.getBoundingClientRect) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none') return false;
  if (parseFloat(cs.opacity || '1') === 0) return false;
  return true;
}
function docY(el) {
  return Math.round(el.getBoundingClientRect().top + window.scrollY);
}

const buttons = Array.from(document.querySelectorAll('button')).filter(vis);
const links = Array.from(document.querySelectorAll('a[href]')).filter(vis);
const rows = Array.from(
  document.querySelectorAll('[data-testid="listing-row"]')
).filter(vis);
const inputs = Array.from(
  document.querySelectorAll('input, textarea')
).filter(vis);
const cards = Array.from(document.querySelectorAll('div')).filter(function (el) {
  const c = el.getAttribute('class') || '';
  return c.indexOf('backdrop-blur-xl') !== -1 && c.indexOf('rounded-2xl') !== -1;
}).filter(vis);

// ---- running text -------------------------------------------------------
const SKIP = { SCRIPT: 1, STYLE: 1, BUTTON: 1, INPUT: 1, TEXTAREA: 1,
               SELECT: 1, NOSCRIPT: 1, SVG: 1 };
let words = 0;
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
let node;
while ((node = walker.nextNode())) {
  const txt = (node.nodeValue || '').trim();
  if (!txt) continue;
  let p = node.parentElement, skip = false;
  while (p) {
    if (SKIP[p.tagName]) { skip = true; break; }
    p = p.parentElement;
  }
  if (skip) continue;
  if (!node.parentElement || !vis(node.parentElement)) continue;
  words += txt.split(/\s+/).filter(Boolean).length;
}

// ---- ordered text blocks, for the verbatim sections ---------------------
const blocks = [];
const all = document.querySelectorAll('body *');
for (let i = 0; i < all.length; i++) {
  const el = all[i];
  if (SKIP[el.tagName] && el.tagName !== 'BUTTON') continue;
  let own = '';
  for (let j = 0; j < el.childNodes.length; j++) {
    const ch = el.childNodes[j];
    if (ch.nodeType === 3) own += ch.nodeValue;
  }
  own = own.replace(/\s+/g, ' ').trim();
  if (!own) continue;
  if (!vis(el)) continue;
  blocks.push({
    y: docY(el),
    tag: el.tagName,
    kind: el.tagName === 'BUTTON' ? 'button' : 'text',
    text: own.length > 220 ? own.slice(0, 220) + '…' : own
  });
}
blocks.sort(function (a, b) { return a.y - b.y; });

// ---- button inventory ---------------------------------------------------
const buttonList = buttons.map(function (b) {
  const label = (b.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    y: docY(b),
    label: label || ('[icon] ' + (b.getAttribute('aria-label') ||
                                  b.getAttribute('title') || '')).trim(),
    disabled: !!b.disabled
  };
});

// ---- field inventory ----------------------------------------------------
const fieldList = inputs.map(function (f) {
  return {
    y: docY(f),
    tag: f.tagName,
    type: f.getAttribute('type') || '',
    placeholder: f.getAttribute('placeholder') || '',
    value: (f.value || '').slice(0, 80)
  };
});

// ---- where real content starts ------------------------------------------
let contentEl = null;
if (contentSel) {
  const cand = document.querySelectorAll(contentSel);
  for (let i = 0; i < cand.length; i++) {
    if (vis(cand[i])) { contentEl = cand[i]; break; }
  }
}
if (!contentEl) contentEl = rows[0] || cards[0] || null;

return {
  buttons: buttons.length,
  links: links.length,
  boxes: cards.length,
  rows: rows.length,
  fields: inputs.length,
  words: words,
  content_y: contentEl ? docY(contentEl) : null,
  content_tag: contentEl
    ? contentEl.tagName + '.' + String(contentEl.getAttribute('class') || '')
        .split(' ').slice(0, 2).join('.')
    : null,
  content_text: contentEl
    ? (contentEl.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    : null,
  hash: window.location.hash,
  page_w: Math.round(document.documentElement.scrollWidth),
  page_h: Math.round(document.documentElement.scrollHeight),
  blocks: blocks.slice(0, 200),
  button_list: buttonList,
  field_list: fieldList
};
"""


class Journey:
    """Collects one record per screen, per width, and writes them out as JSON.

    The markdown is written from this file, not from memory: counts, verbatim
    text and the y where content starts are all read back from here.
    """

    def __init__(self, driver, out_dir, width):
        self.driver = driver
        self.out_dir = out_dir
        self.width = width
        self.records = []
        self.skipped = []

    def shot(
        self,
        number,
        slug,
        how,
        content_sel=None,
        settle=1.2,
        max_height=MAX_SHOT_HEIGHT,
    ):
        name = f"{number}-{slug}-{self.width}"
        page_w, page_h, shot_h = shoot(
            self.driver, self.out_dir, name, settle=settle, max_height=max_height
        )
        try:
            m = self.driver.execute_script(MEASURE_JS, content_sel)
        except Exception as exc:
            print(f"    ! measurement failed for {name}: {exc}")
            m = {}
        m.update(
            {
                "number": number,
                "slug": slug,
                "how": how,
                "width": self.width,
                "image": f"{name}.png",
                "shot_height": shot_h,
                "full_height": page_h,
                "clipped": shot_h != page_h,
            }
        )
        self.records.append(m)
        print(
            "    {n} buttons  {b} boxes  {r} rows  {w} words  content_y={y}".format(
                n=m.get("buttons"),
                b=m.get("boxes"),
                r=m.get("rows"),
                w=m.get("words"),
                y=m.get("content_y"),
            )
        )
        return m

    def skip(self, number, slug, reason):
        print(f"  -- {number}-{slug}: not reached: {reason}")
        self.skipped.append(
            {"number": number, "slug": slug, "reason": reason, "width": self.width}
        )

    def dump(self, path):
        import json

        with open(path, "w") as fh:
            json.dump(
                {"width": self.width, "records": self.records, "skipped": self.skipped},
                fh,
                indent=1,
            )
        print(f"  -> {path}")


# ---------------------------------------------------------------------------
# Small click/type helpers
# ---------------------------------------------------------------------------
#
# Everything navigates by clicking. The three dead ends already documented on
# open_campaign apply to every screen here, not just the campaign cards:
# driver.get on a fragment-only change navigates nowhere, assigning
# location.hash is written back by the router within milliseconds, and the
# element under the sticky header swallows a coordinate click. So: find the
# element, scroll it into the middle, dispatch the click from JS.


def _click(driver, el, settle=0.8):
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
    time.sleep(0.2)
    driver.execute_script("arguments[0].click();", el)
    time.sleep(settle)
    return True


def click_css(driver, selector, settle=0.8, timeout=10):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    el = WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, selector))
    )
    return _click(driver, el, settle)


# Buttons this walk must never press.
#
# A tool that photographs the app must not change what it is photographing,
# and on the first full run this one did. The click meant for the "Listings"
# tab was looked up by substring, "Fetch listings" contains "listings", it sits
# earlier in the DOM than the tab bar -- so the throwaway backend went out to
# kleinanzeigen.de, harvested five bicycles into the copy halfway through, and
# the same campaign counted 107 listings at one width and 119 at the other.
# Nothing was lost (the crawl only ever reaches the copy), but the numbers in
# the document are the point, so a substring match is now not enough to press
# anything that fetches, adds or deletes.
NEVER_CLICK = (
    "fetch",
    "scrape",
    "crawl",
    "harvest",
    "add",
    "delete",
    "remove",
    "discard",
    "evaluate",
    "auto ai",
    "update descriptions",
    "diagnose",
    "apply",
    "log out",
    "connect kleinanzeigen",
)


def find_by_text(driver, text, selector="button", exact=False):
    from selenium.webdriver.common.by import By

    needle = text.lower()
    for el in driver.find_elements(By.CSS_SELECTOR, selector):
        try:
            if not el.is_displayed():
                continue
            label = (el.text or "").strip().lower()
            if not label:
                label = (el.get_attribute("aria-label") or "").strip().lower()
            if any(bad in label for bad in NEVER_CLICK):
                continue
            if (label == needle) if exact else (needle in label):
                return el
        except Exception:
            continue
    return None


def click_text(driver, text, selector="button", exact=False, settle=0.8):
    el = find_by_text(driver, text, selector, exact)
    if el is None:
        return False
    return _click(driver, el, settle)


def click_one_of(driver, labels, exact=True, settle=1.5):
    """First label that matches wins. Exact by default.

    The tab bars carry two labels for the same tab -- the long one on a wide
    screen, a short one below the `sm` breakpoint ("AI Guidelines" / "AI") --
    and both are in the DOM at all times, one of them hidden. Matching by
    substring picked up neighbouring buttons instead, which is how the third
    settings tab went unphotographed at 390 px on the first run.
    """
    for label in labels:
        if click_text(driver, label, exact=exact, settle=settle):
            return True
    return False


def wait_results_ready(driver, timeout=40):
    """Wait until the results screen has actually resolved to a state.

    ResultsScreen renders a spinner while it fetches, and the walk photographed
    that spinner as though it were the empty state: at 390 px the "no hits"
    screen came back as one button and two words. Wait for a listing row, an
    empty-state card or the zero-in-radius view -- and for the spinner to be
    gone -- before believing what is on screen.
    """
    from selenium.webdriver.common.by import By

    deadline = time.time() + timeout
    while time.time() < deadline:
        spinning = driver.find_elements(By.CSS_SELECTOR, ".animate-spin")
        spinning = [s for s in spinning if s.is_displayed()]
        settled = driver.find_elements(
            By.CSS_SELECTOR,
            "[data-testid='listing-row'], [data-testid='zero-in-radius-view'],"
            " #btn-empty-scrape",
        )
        if not spinning and settled:
            time.sleep(1.0)
            return True
        time.sleep(0.5)
    return False


def type_into(driver, selector, text, clear=True, settle=0.6):
    from selenium.webdriver.common.by import By

    el = driver.find_element(By.CSS_SELECTOR, selector)
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
    if clear:
        el.clear()
    el.send_keys(text)
    time.sleep(settle)
    return el


def wait_css(driver, selector, timeout=15):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    try:
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
        )
        return True
    except Exception:
        return False


REACT_SET_VALUE_JS = """
const el = arguments[0], value = arguments[1];
const proto = el.tagName === 'TEXTAREA'
  ? window.HTMLTextAreaElement.prototype
  : window.HTMLInputElement.prototype;
Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
el.dispatchEvent(new Event('input', { bubbles: true }));
"""


def open_mobile_drawer(driver, tries=3):
    """Click the hamburger and make sure the drawer is actually open.

    One click is not reliably one toggle here: the walk clicked the hamburger,
    found no drawer, and reported that the global settings did not exist. The
    landing page at phone width has no button with text on it at all -- the
    gear and the bin on each card are icon-only -- so the failure looked like an
    empty screen. Verify against the drawer's own heading instead of trusting
    the click.
    """
    from selenium.webdriver.common.by import By

    for _ in range(tries):
        try:
            click_css(driver, "button[aria-label='Toggle menu']", settle=1.5)
        except Exception:
            return False
        for el in driver.find_elements(By.CSS_SELECTOR, "div.fixed span"):
            try:
                if el.is_displayed() and (el.text or "").strip() == "Navigation":
                    return True
            except Exception:
                continue
        time.sleep(0.8)
    return False


def login(driver, base, wait):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC

    driver.get(base)
    wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='password']"))
    )
    email = driver.find_element(By.CSS_SELECTOR, "input[type='email'], input")
    password = driver.find_element(By.CSS_SELECTOR, "input[type='password']")
    email.clear()
    email.send_keys(EMAIL)
    password.clear()
    password.send_keys(PASSWORD)
    driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
    try:
        wait.until(
            EC.invisibility_of_element_located(
                (By.CSS_SELECTOR, "input[type='password']")
            )
        )
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "header")))
        wait.until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "[data-testid^='campaign-card-']")
            )
        )
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# The walk
# ---------------------------------------------------------------------------

MATTRESS = 5  # "Matratze", route campaign, 107 listings
PRINTER = 6  # "Drucker", search family, 0 listings
LAPTOPS = 1  # "Laptops", plain campaign, 1070 listings, classic dashboard


def walk(driver, base, out_dir, width, height, db_path=None):
    """One human's path through the app, photographed at one width.

    Order follows a person, not the code: log in, look at what is there, make a
    new one, configure an existing one, read its results, open one listing, look
    at a search that found nothing, run the AI wizard, open the global settings.
    """
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    wait = WebDriverWait(driver, 25)
    j = Journey(driver, out_dir, width)
    is_phone = width < 768

    print(f"\n=== {width} px ===")

    # -- 01 the login screen -------------------------------------------------
    driver.get(base)
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input")))
    j.shot("01", "anmeldung", "open the app while logged out", content_sel="form")

    # -- 02 login with a wrong password -------------------------------------
    # A fresh document first: the old note about `shoot` killing the page's
    # network was written against the window-resizing implementation, but a
    # reload costs a second and removes the doubt.
    driver.get(base)
    wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='password']"))
    )
    try:
        driver.find_element(By.CSS_SELECTOR, "input[type='email'], input").send_keys(
            EMAIL
        )
        driver.find_element(By.CSS_SELECTOR, "input[type='password']").send_keys(
            "definitely-not-the-password"
        )
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        time.sleep(2.0)
        if driver.find_elements(By.CSS_SELECTOR, ".text-status-danger"):
            j.shot(
                "02",
                "anmeldung-fehler",
                "login screen, wrong password, submit",
                content_sel="form",
            )
        else:
            j.skip(
                "02",
                "anmeldung-fehler",
                "submitting a wrong password produced no visible error element",
            )
    except Exception as exc:
        j.skip("02", "anmeldung-fehler", f"could not provoke the error: {exc}")

    # -- log in for real -----------------------------------------------------
    if not login(driver, base, wait):
        print("  ! still unauthenticated — stopping")
        j.dump(os.path.join(out_dir, f"measurements-{width}.json"))
        return j
    driver.set_window_size(width, height)
    time.sleep(1.0)

    # -- 03 the overview of all searches ------------------------------------
    j.shot(
        "03",
        "uebersicht",
        "after logging in",
        content_sel="[data-testid^='campaign-card-']",
        settle=2.0,
    )

    # -- 04/05 creating a new search ----------------------------------------
    # The "+" card is the last Card in the grid and carries no testid; it is
    # the only interactive Card with a dashed border.
    plus = None
    for card in driver.find_elements(By.CSS_SELECTOR, "div.border-dashed"):
        if card.is_displayed() and "+" in (card.text or ""):
            plus = card
            break
    if plus is not None and _click(driver, plus, settle=1.5):
        j.shot(
            "04",
            "neue-suche-leer",
            "overview → click the “+” card",
            content_sel="label",
        )
        try:
            # Both widths run against the same throwaway backend, so the name
            # has to differ or the second pass hits "campaign already exists",
            # stays on the form, and photographs the create screen three times
            # under three different names.
            type_into(driver, "input[type='text']", f"Fahrrad {width}")
            j.shot(
                "05",
                "neue-suche-teilweise",
                "new search form → type a name, nothing saved yet",
                content_sel="label",
            )
        except Exception as exc:
            j.skip("05", "neue-suche-teilweise", f"name field not typeable: {exc}")

        # -- 06 saving takes you straight into the settings of the new search
        if click_text(driver, "save", settle=3.0):
            wait_css(driver, "input[type='text']")
            j.shot(
                "06",
                "neue-suche-ohne-ziele",
                "new search form → Save → lands in its settings, no targets yet",
                content_sel="h2",
            )

            # -- 07 an invalid URL --------------------------------------------
            url_input = None
            for el in driver.find_elements(By.CSS_SELECTOR, "input[type='text']"):
                if "kleinanzeigen" in (el.get_attribute("placeholder") or "").lower():
                    url_input = el
                    break
            if url_input is None:
                cands = [
                    e
                    for e in driver.find_elements(
                        By.CSS_SELECTOR, "input.font-mono, input[type='text']"
                    )
                    if e.is_displayed()
                ]
                url_input = cands[0] if cands else None
            if url_input is not None:
                url_input.clear()
                url_input.send_keys("ebay.de/nicht-kleinanzeigen")
                time.sleep(1.2)
                j.shot(
                    "07",
                    "neue-suche-url-ungueltig",
                    "settings → Search terms → paste something that is not a "
                    "Kleinanzeigen URL",
                    content_sel="h2",
                )
                # A valid URL is not a state you can linger in. 600 ms after
                # the field parses as a Kleinanzeigen URL the app acts on it by
                # itself: it creates a knowledge set, creates the search target,
                # empties the field and starts a crawl -- no "Add" pressed. That
                # is why the first attempts at this screen kept reporting an
                # empty field: by the time they looked, the app had already
                # taken the URL and cleared it. So set the value and photograph
                # it immediately, inside the debounce.
                good_url = (
                    "https://www.kleinanzeigen.de/s-fahrraeder/muenchen/"
                    "preis::300/k0c217"
                )
                driver.execute_script(REACT_SET_VALUE_JS, url_input, good_url)
                j.shot(
                    "08",
                    "neue-suche-url-gueltig",
                    "same field → a valid Kleinanzeigen URL. Photographed "
                    "inside the 600 ms debounce: after it the app registers "
                    "the target and empties the field on its own",
                    settle=0.35,
                    content_sel="h2",
                )
            else:
                j.skip("07", "neue-suche-url-ungueltig", "no URL field on the screen")
                j.skip("08", "neue-suche-url-gueltig", "no URL field on the screen")
        else:
            j.skip("06", "neue-suche-ohne-ziele", "the Save button was not found")
            j.skip("07", "neue-suche-url-ungueltig", "never got past the name form")
            j.skip("08", "neue-suche-url-gueltig", "never got past the name form")
    else:
        for n, s in (
            ("04", "neue-suche-leer"),
            ("05", "neue-suche-teilweise"),
            ("06", "neue-suche-ohne-ziele"),
            ("07", "neue-suche-url-ungueltig"),
            ("08", "neue-suche-url-gueltig"),
        ):
            j.skip(n, s, "the “+” card could not be found on the overview")

    back_to_landing(driver)

    # -- 09/10/11 the settings of an existing search, one tab at a time ------
    # The gear on the campaign card goes straight to the settings, which is how
    # a person reaches them without first opening the results.
    gear = None
    card = driver.find_elements(
        By.CSS_SELECTOR, f"[data-testid='campaign-card-{MATTRESS}'] button"
    )
    if card:
        gear = card[0]
    if gear is not None and _click(driver, gear, settle=3.0):
        wait_css(driver, "button")
        j.shot(
            "09",
            "einstellungen-suchbegriffe",
            "overview → gear on the “Matratze” card (tab 1 of 3)",
            content_sel="h2, .max-w-3xl > div",
        )
        if click_one_of(driver, ["Search Area & Route", "Area"]):
            j.shot(
                "10",
                "einstellungen-geometrie",
                "settings → second tab",
                settle=3.0,
                content_sel="h2, .max-w-3xl > div",
            )
        else:
            j.skip("10", "einstellungen-geometrie", "second tab not found by label")
        if click_one_of(driver, ["AI Guidelines", "AI"]):
            j.shot(
                "11",
                "einstellungen-ki-richtlinien",
                "settings → third tab (this is also step 1 of the AI wizard)",
                settle=2.5,
                content_sel=".min-h-\\[300px\\] h3",
            )

            # -- 21/22 the AI wizard, steps 2 and 3 -------------------------
            # Step 2 is gated: its tab is disabled until the step 1 prompt has
            # been copied (copying is what reveals the next action), so the
            # walk copies it the way the screen asks you to.
            if click_text(driver, "copy", settle=1.2):
                if click_one_of(
                    driver, ["Step 2: Market Calibration"], exact=True, settle=2.0
                ):
                    j.shot(
                        "21",
                        "ki-assistent-schritt-2",
                        "AI guidelines → Copy the prompt → continue to step 2",
                        settle=2.0,
                        content_sel=".min-h-\\[300px\\] h3",
                    )
                    # Step 3 is gated on the market memo having text in it.
                    if click_text(driver, "copy", settle=1.2):
                        memos = [
                            e
                            for e in driver.find_elements(By.TAG_NAME, "textarea")
                            if e.is_displayed()
                        ]
                        if memos:
                            memos[0].send_keys(
                                "Used 140x200 mattresses in this corridor sit "
                                "between 40 and 120 EUR; anything under 30 is "
                                "usually a giveaway with stains."
                            )
                            time.sleep(1.2)
                            if click_one_of(
                                driver,
                                ["Step 3: Synthesis Checklist"],
                                exact=True,
                                settle=2.0,
                            ):
                                j.shot(
                                    "22",
                                    "ki-assistent-schritt-3",
                                    "step 2 → paste a market memo → continue to step 3",
                                    settle=2.0,
                                    content_sel=".min-h-\\[300px\\] h3",
                                )
                            else:
                                j.skip(
                                    "22",
                                    "ki-assistent-schritt-3",
                                    "the continue-to-step-3 control stayed hidden",
                                )
                        else:
                            j.skip(
                                "22",
                                "ki-assistent-schritt-3",
                                "the market memo field never appeared, and step 3 "
                                "is disabled while it is empty",
                            )
                    else:
                        j.skip(
                            "22",
                            "ki-assistent-schritt-3",
                            "step 2's Copy button was not found",
                        )
                else:
                    j.skip("21", "ki-assistent-schritt-2", "step 2 stayed unreachable")
                    j.skip("22", "ki-assistent-schritt-3", "step 2 stayed unreachable")
            else:
                j.skip(
                    "21",
                    "ki-assistent-schritt-2",
                    "step 1 has no Copy button, which is what unlocks step 2",
                )
                j.skip("22", "ki-assistent-schritt-3", "step 2 stayed unreachable")
        else:
            j.skip("11", "einstellungen-ki-richtlinien", "third tab not found by label")
            j.skip("21", "ki-assistent-schritt-2", "third tab not found by label")
            j.skip("22", "ki-assistent-schritt-3", "third tab not found by label")
    else:
        for n, s in (
            ("09", "einstellungen-suchbegriffe"),
            ("10", "einstellungen-geometrie"),
            ("11", "einstellungen-ki-richtlinien"),
            ("21", "ki-assistent-schritt-2"),
            ("22", "ki-assistent-schritt-3"),
        ):
            j.skip(n, s, "the gear on the Matratze card could not be clicked")

    back_to_landing(driver)

    # -- 12..16 a search with many hits --------------------------------------
    if open_campaign(driver, MATTRESS, "Matratze", settle=4.0):
        wait_results_ready(driver)
        j.shot(
            "12",
            "treffer-liste",
            "overview → click the “Matratze” card",
            settle=2.5,
            content_sel="[data-testid='listing-row']",
        )

        # The map: at phone width it is behind a tab, at desktop width it is
        # already on screen beside the list and there is no toggle at all.
        if is_phone:
            if click_text(driver, "map", exact=True, settle=2.5):
                j.shot(
                    "13",
                    "treffer-karte",
                    "results → the “Map” tab",
                    settle=3.0,
                    content_sel=".leaflet-container",
                )
                # Back to the list by the tab, addressed inside the toggle
                # itself rather than by its text.
                tabs = driver.find_elements(By.CSS_SELECTOR, "div.lg\\:hidden > button")
                if tabs:
                    _click(driver, tabs[0], settle=2.5)
            else:
                j.skip("13", "treffer-karte", "the Map tab was not found")
        else:
            j.skip(
                "13",
                "treffer-karte",
                "at 1440 px there is no separate map screen: the map is the left "
                "column of screen 12 and the list/map toggle is hidden (lg:hidden)",
            )

        # 14 a detour filter switched on
        if click_one_of(driver, ["< 15 min"]):
            j.shot(
                "14",
                "treffer-filter-aktiv",
                "results → click the “within 15 min” detour chip",
                settle=1.8,
                content_sel="[data-testid='listing-row']",
            )
            click_one_of(driver, ["All detours"])
            time.sleep(1.0)
        else:
            j.skip("14", "treffer-filter-aktiv", "no detour filter chip found")

        # 15 the sort dropdown, open
        sort_btn = None
        for b in driver.find_elements(By.CSS_SELECTOR, "button"):
            try:
                txt = (b.text or "").lower()
                if (
                    b.is_displayed()
                    and ("sort" in txt or "detour" in txt)
                    and b.find_elements(By.CSS_SELECTOR, "svg")
                ):
                    sort_btn = b
                    break
            except Exception:
                continue
        if sort_btn is not None and _click(driver, sort_btn, settle=1.2):
            j.shot(
                "15",
                "treffer-sortierung-offen",
                "results → click the sort control",
                content_sel="[data-testid='listing-row']",
            )
            driver.execute_script("document.body.click();")
            time.sleep(0.6)
        else:
            j.skip("15", "treffer-sortierung-offen", "the sort control was not found")

        # 16 the corridor drawer
        if click_one_of(driver, ["Corridor settings"], settle=4.5):
            j.shot(
                "16",
                "korridor-schublade",
                "results → “Corridor settings”",
                settle=3.0,
                content_sel="[role='dialog'] h3, .leaflet-container",
            )
            click_text(driver, "cancel", settle=1.5)
        else:
            j.skip(
                "16",
                "korridor-schublade",
                "the corridor settings action was not on the bar",
            )
    else:
        for n, s in (
            ("12", "treffer-liste"),
            ("13", "treffer-karte"),
            ("14", "treffer-filter-aktiv"),
            ("15", "treffer-sortierung-offen"),
            ("16", "korridor-schublade"),
        ):
            j.skip(n, s, "the Matratze campaign would not open")

    back_to_landing(driver)

    # -- 17/18 the classic dashboard and a single listing --------------------
    # Campaign 1 has neither a route nor a family, so it renders the other
    # results screen entirely — the one with the detail inspector.
    if open_campaign(driver, LAPTOPS, "Laptops", settle=6.0):
        # 1070 listing cards, all of them, with no paging: give the render
        # time rather than photographing a half-built screen.
        for _ in range(40):
            if len(driver.find_elements(By.CSS_SELECTOR, "div.grid > div")) > 3:
                break
            time.sleep(1.0)
        time.sleep(3.0)
        j.shot(
            "17",
            "dashboard-klassisch",
            "overview → click the “Laptops” card (a search with no route "
            "and no model family)",
            settle=3.0,
            content_sel="div.grid > div",
        )
        cards = [
            c
            for c in driver.find_elements(By.CSS_SELECTOR, "div.grid > div")
            if c.is_displayed()
        ]
        if cards and _click(driver, cards[0], settle=2.5):
            # On a phone the detail is a modal over the list; on a desktop it is
            # the right-hand inspector panel. Two different elements, so the
            # "where content starts" marker has to differ too.
            j.shot(
                "18",
                "anzeige-detail",
                "classic dashboard → click the first listing",
                settle=2.5,
                content_sel=(
                    "div.fixed.z-50 > div.bg-bg-surface"
                    if is_phone
                    else "div.lg\\:sticky"
                ),
            )
            if is_phone:
                click_text(driver, "", settle=1.0)
        else:
            j.skip("18", "anzeige-detail", "no listing card was clickable")
    else:
        j.skip("17", "dashboard-klassisch", "the Laptops campaign would not open")
        j.skip("18", "anzeige-detail", "the Laptops campaign would not open")

    back_to_landing(driver)

    # -- 19/20 a search that found nothing -----------------------------------
    if open_campaign(driver, PRINTER, "Drucker", settle=4.5):
        wait_results_ready(driver)
        j.shot(
            "19",
            "ohne-treffer",
            "overview → click the “Drucker” card",
            settle=2.5,
            content_sel="[data-testid='zero-in-radius-view'], .text-center h3",
        )
        # "Family settings" sets a modal flag *and* navigates to the settings
        # screen in the same handler. The navigation wins, so what this shot
        # records is the settings screen, not a modal over the results.
        if click_one_of(driver, ["Family settings"]):
            j.shot(
                "20",
                "modellfamilie-bearbeiten",
                "empty results → “Family settings”",
                settle=3.0,
                content_sel="h2",
            )
            click_text(driver, "cancel", settle=1.5)
        else:
            j.skip(
                "20",
                "modellfamilie-bearbeiten",
                "the family settings action was not on the bar",
            )
    else:
        j.skip("19", "ohne-treffer", "the Drucker campaign would not open")
        j.skip("20", "modellfamilie-bearbeiten", "the Drucker campaign would not open")

    back_to_landing(driver)

    # -- 23 the global settings ---------------------------------------------
    opened = False
    if is_phone:
        # behind the hamburger at phone width
        if open_mobile_drawer(driver):
            opened = click_one_of(driver, ["Global Settings"], exact=True, settle=2.5)
    else:
        for b in driver.find_elements(By.CSS_SELECTOR, "header button"):
            if (b.get_attribute("title") or "").lower().startswith("global"):
                opened = _click(driver, b, settle=2.5)
                break
    if opened:
        j.shot(
            "23",
            "globale-einstellungen",
            (
                "overview → hamburger → “Global settings”"
                if is_phone
                else "overview → the gear in the header bar"
            ),
            settle=2.0,
            content_sel="form label, label",
        )
        click_text(driver, "back", settle=2.0) or back_to_landing(driver)
    else:
        j.skip(
            "23", "globale-einstellungen", "the global settings control was not found"
        )

    back_to_landing(driver)

    # -- 24 the mobile menu / 25 the language dropdown ----------------------
    if is_phone:
        if open_mobile_drawer(driver):
            j.shot(
                "24",
                "mobiles-menue",
                "overview → the hamburger in the header",
                content_sel="div.fixed.top-0.right-0 > div",
            )
            click_css(driver, "button[aria-label='Toggle menu']", settle=1.0)
        else:
            j.skip("24", "mobiles-menue", "the hamburger was not found")
        j.skip(
            "25",
            "sprachauswahl-offen",
            "at 390 px the language control is a full-width row inside the mobile "
            "drawer (screen 24) and toggles straight through — there is no dropdown "
            "to open",
        )
    else:
        j.skip(
            "24",
            "mobiles-menue",
            "the hamburger is md:hidden — at 1440 px it is not rendered at all",
        )
        lang_btn = None
        for b in driver.find_elements(By.CSS_SELECTOR, "header button"):
            if (b.text or "").strip().upper() in ("EN", "DE"):
                lang_btn = b
                break
        if lang_btn is not None and _click(driver, lang_btn, settle=1.0):
            j.shot(
                "25",
                "sprachauswahl-offen",
                "overview → the EN control in the header",
                content_sel="header div.absolute.right-0",
            )
            # Close it through its own backdrop. A click on <body> does not
            # reach the overlay that dismisses it, so the dropdown stayed open
            # and turned up again in the last shot of the walk.
            overlays = driver.find_elements(By.CSS_SELECTOR, "header div.fixed.inset-0")
            if overlays:
                _click(driver, overlays[0], settle=0.8)
            time.sleep(0.5)
        else:
            j.skip("25", "sprachauswahl-offen", "the language control was not found")

    # -- 26 a filter that matches nothing ------------------------------------
    back_to_landing(driver)
    if open_campaign(driver, MATTRESS, "Matratze", settle=4.0):
        wait_results_ready(driver)
        boxes = [
            e
            for e in driver.find_elements(By.CSS_SELECTOR, "input[type='text']")
            if e.is_displayed()
        ]
        if boxes:
            boxes[0].send_keys("zzzzzz")
            time.sleep(1.5)
            j.shot(
                "26",
                "leerzustand-filter",
                "results → type something into the search box that matches no listing",
                content_sel="div.border-dashed",
            )
        else:
            j.skip("26", "leerzustand-filter", "no search box on the results screen")
    else:
        j.skip("26", "leerzustand-filter", "the Matratze campaign would not open")

    j.dump(os.path.join(out_dir, f"measurements-{width}.json"))
    return j


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--width",
        type=int,
        action="append",
        help="repeatable; defaults to 390 and 1440, the two widths the "
        "journey document records",
    )
    parser.add_argument("--height", type=int, default=900)
    parser.add_argument(
        "--out",
        default=os.path.join(ROOT, "docs", "ui-journey"),
        help="images land next to the document, not in logs/, which is gitignored",
    )
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()
    widths = args.width or [390, 1440]

    os.makedirs(args.out, exist_ok=True)

    src_db = db_schema.default_path()
    if not os.path.exists(src_db):
        raise SystemExit(
            f"No database at {src_db}. This script photographs the running "
            f"interface, so it needs one to copy; run the backend once to "
            f"create it, or point PRISMDEALS_DB at an existing database."
        )

    # Derived from the database actually in use, not from the default. With
    # PRISMDEALS_DB set, the old form copied the *default* database's WAL next
    # to the override's copy — a write-ahead log belonging to a different file.
    wal_file = src_db + "-wal"
    if os.path.exists(wal_file):
        try:
            subprocess.run(
                ["sqlite3", src_db, "PRAGMA wal_checkpoint(TRUNCATE);"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            pass

    # A copy and a server per width, not one shared between them.
    #
    # Sharing was cheaper and wrong: the walk creates a campaign on its way
    # through, so the second width photographed an overview carrying the first
    # width's leftovers, and the two sets of counts stopped being comparable —
    # which is the one thing this document is for.
    for width in widths:
        db_path = f"/tmp/ui_shots_{os.getpid()}_{width}.db"
        port = free_port()
        server = None
        try:
            shutil.copy(src_db, db_path)
            if os.path.exists(wal_file) and os.path.getsize(wal_file) > 0:
                shutil.copy(wal_file, f"{db_path}-wal")
            make_test_user(db_path)

            server = subprocess.Popen(
                ["node", os.path.join(ROOT, "backend", "server.js")],
                env=dict(os.environ, PRISMDEALS_DB=db_path, PRISMDEALS_PORT=str(port)),
                cwd=os.path.join(ROOT, "backend"),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            base = f"http://127.0.0.1:{port}"
            if not wait_for(base):
                sys.exit("The throwaway backend did not come up.")

            driver = build_driver(width, args.height)
            try:
                walk(driver, base, args.out, width, args.height, db_path)
            finally:
                driver.quit()

            if args.keep:
                print(f"Still up: {base}   login {EMAIL} / {PASSWORD}")
                input("Enter to stop... ")
        finally:
            if server:
                server.terminate()
                try:
                    server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    server.kill()
            for ext in ("", "-wal", "-shm"):
                leftover = f"{db_path}{ext}"
                if os.path.exists(leftover):
                    os.remove(leftover)

    print(f"\n-> {args.out}")


if __name__ == "__main__":
    main()
