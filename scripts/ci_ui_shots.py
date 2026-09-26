#!/usr/bin/env python3
"""Take UI screenshots in CI against a fixture database.

This is the CI counterpart of scripts/ui_shots.py. Differences:
- Uses a fixture database built by seed_fixture_db.js (no production data).
- The fixture DB already has the test user; no separate user creation step.
- Assumes headless Chrome is available via chromedriver (GitHub Actions runner).
- Writes screenshots to a directory suitable for workflow artifact upload.

Usage:
    python scripts/ci_ui_shots.py [--out logs/ui-shots] [--width 1440]

Requires: selenium, pillow (for visual diff in the calling workflow).
"""

import argparse
import os
import socket
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EMAIL = "ui-shots@localhost"
PASSWORD = "ui-shots-only"


# scripts/seed_fixture_db.js stamps everything 2026-01-01T12:00:00Z.
FROZEN_NOW_MS = 1767276000000  # 2026-01-01T14:00:00Z


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for(url, timeout=60):
    import urllib.error
    import urllib.request

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except urllib.error.HTTPError:
            return True
        except Exception:
            time.sleep(0.5)
    return False


def build_driver(width, height):
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service

    options = Options()
    for flag in (
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--hide-scrollbars",
        # A pixel diff compares two moments. Anything that moves, loads late or
        # renders differently between two runs becomes noise, and a check that
        # cries wolf is a check somebody turns off.
        "--force-prefers-reduced-motion",
        "--font-render-hinting=none",
        "--force-device-scale-factor=1",
        "--disable-lcd-text",
    ):
        options.add_argument(flag)
    options.add_argument(f"--window-size={width},{height}")

    service = Service()
    driver = webdriver.Chrome(service=service, options=options)
    # The fixture's dates are fixed, but "vor 2 Std" is measured against the
    # browser's clock, so an unfrozen clock made every baseline wrong the next
    # day. Two hours after the fixture's timestamp, before any page script runs.
    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {
            "source": (
                "(() => {"
                f"  const frozen = {FROZEN_NOW_MS};"
                "  const RealDate = Date;"
                "  class FrozenDate extends RealDate {"
                "    constructor(...a) { super(...(a.length ? a : [frozen])); }"
                "    static now() { return frozen; }"
                "  }"
                "  globalThis.Date = FrozenDate;"
                "})();"
            )
        },
    )
    return driver


# Belt and braces alongside --force-prefers-reduced-motion: Tailwind's
# animate-pulse and animate-spin do not ask whether motion is welcome, and a
# spinner caught mid-turn differs from one caught a third of a turn later.
FREEZE_MOTION = """
const existing = document.getElementById('ci-freeze-motion');
if (!existing) {
  const style = document.createElement('style');
  style.id = 'ci-freeze-motion';
  style.textContent = `*, *::before, *::after {
    animation-play-state: paused !important;
    animation-delay: -1ms !important;
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }`;
  document.head.appendChild(style);
}
"""


# Every visible button whose label runs over more than one line. A button
# broken over two lines reads as broken on a phone ("Auftrag kopieren",
# "Frage an den Verkäufer"); the container wraps, or the label is shorter.
WRAPPED_BUTTONS = """
const out = [];
for (const el of document.querySelectorAll('button, [role=button], a.btn')) {
  const box = el.getBoundingClientRect();
  if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden') continue;
  // A card that happens to be clickable (a row with photo and title) is not
  // a button label.
  if (el.querySelector('img, p, h1, h2, h3, h4, ul, div')) continue;
  const text = (el.innerText || '').trim();
  if (!text) continue;
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = [...range.getClientRects()].filter(r => r.width > 1).sort((a, b) => a.top - b.top);
  // A new line starts where a piece of text begins below the previous line's
  // bottom; a count beside a label, set a little higher, is the same line.
  let lines = 0, bottom = -Infinity;
  for (const r of rects) {
    if (r.top >= bottom - 2) { lines++; bottom = r.bottom; } else { bottom = Math.max(bottom, r.bottom); }
  }
  if (lines > 1) out.push(text.replace(/\\s+/g, ' ').slice(0, 60));
}
return out;
"""
WRAPPED = []


def shoot(driver, out_dir, name, settle=1.0):
    driver.execute_script(FREEZE_MOTION)
    # The fonts come from a CDN. Captured before they land, the page is laid out
    # in a fallback face with different metrics -- different line wraps, a
    # different height, a diff against every baseline.
    try:
        driver.execute_async_script(
            "const done = arguments[0];"
            "if (document.fonts && document.fonts.ready) {"
            "  document.fonts.ready.then(() => done(true));"
            "} else { done(false); }"
        )
    except Exception:
        pass
    time.sleep(settle)
    width = driver.get_window_size()["width"]
    height = driver.execute_script(
        "return Math.max(document.body.scrollHeight,"
        " document.documentElement.scrollHeight, 700)"
    )
    driver.set_window_size(width, min(int(height) + 100, 4000))
    time.sleep(0.35)
    path = os.path.join(out_dir, f"{name}.png")
    driver.save_screenshot(path)
    print(f"  {name}.png")
    for label in driver.execute_script(WRAPPED_BUTTONS) or []:
        WRAPPED.append(f"{name}: {label}")
    # Nothing may push the page wider than the window: a label kept on one
    # line must not run off the screen instead.
    overflow = driver.execute_script(
        "return document.documentElement.scrollWidth - window.innerWidth"
    )
    if overflow > 1:
        WRAPPED.append(f"{name}: page is {overflow}px wider than the window")


def walk(driver, base, out_dir, width, height):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    wait = WebDriverWait(driver, 30)

    driver.get(base)
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input")))
    print("Photographing:")
    shoot(driver, out_dir, "01-login")

    email = driver.find_element(By.CSS_SELECTOR, "input[type='email'], input")
    password = driver.find_element(By.CSS_SELECTOR, "input[type='password']")
    email.clear()
    email.send_keys(EMAIL)
    password.clear()
    password.send_keys(PASSWORD)
    password.submit()

    for _ in range(30):
        time.sleep(0.5)
        body = driver.find_element(By.TAG_NAME, "body").text
        if "Unauthenticated" not in body and "Log In" not in body:
            break
    else:
        # Carrying on here is how an authentication regression became a green
        # build: the run captured the login screen, found no campaigns, stopped
        # early and exited 0, and the diff then compared the handful of images
        # that happened to exist. If we cannot get in, say so and fail.
        raise SystemExit(
            "Could not sign in to the throwaway instance, so every screenshot "
            "below would be of the logged-out view. Failing rather than "
            "capturing a login screen and calling it the interface."
        )
    driver.set_window_size(width, height)

    shoot(driver, out_dir, "02-landing")

    campaigns = driver.execute_script(
        "return fetch('/api/hunts').then(r => r.json()).catch(() => [])"
    )
    if not isinstance(campaigns, list) or not campaigns:
        # The fixture database seeds campaigns. None here means the seed or the
        # API is broken, not that there is nothing to photograph.
        raise SystemExit(
            "The fixture database reports no campaigns, so the views that "
            "matter cannot be reached. Check scripts/seed_fixture_db.js and "
            "GET /api/hunts."
        )
        return

    first = campaigns[0]
    cid = first.get("id")

    # Navigate to dashboard
    driver.get(f"{base}/#dashboard?campaignId={cid}")
    time.sleep(2)
    shoot(driver, out_dir, "03-dashboard")

    # Navigate to edit/config view
    driver.get(f"{base}/#edit?campaignId={cid}")
    time.sleep(2)
    shoot(driver, out_dir, "04-campaign-edit")

    # Navigate to settings
    driver.get(f"{base}/#settings")
    time.sleep(2)
    shoot(driver, out_dir, "05-settings")

    # A find's sheet. Never photographed before, which is how a footer of
    # three buttons with its main action broken over three lines went live.
    listing_id = driver.execute_async_script(
        "const done = arguments[arguments.length - 1];"
        "fetch('/api/hunts/' + arguments[0] + '/listings?limit=1&sort=price_asc')"
        ".then(r => r.json()).then(d => done((d.listings || [])[0]?.id || null))"
        ".catch(() => done(null));",
        cid,
    )
    if listing_id:
        driver.get(f"{base}/#dashboard?campaignId={cid}&listingId={listing_id}")
        time.sleep(2)
        shoot(driver, out_dir, "06-detail-sheet")

    # The requirements sheet: own wishes, add/remove buttons side by side.
    driver.get(f"{base}/#dashboard?campaignId={cid}&sheet=requirements")
    time.sleep(2)
    shoot(driver, out_dir, "07-requirements-sheet")

    # The knowledge sheet: brief, copy button, proposed facts with their
    # buttons -- where "Auftrag kopieren" broke over two lines.
    driver.get(f"{base}/#dashboard?campaignId={cid}&sheet=knowledge")
    time.sleep(3)
    shoot(driver, out_dir, "08-knowledge-sheet")

    # The features sheet: frequency lines and "+ Wunsch" buttons side by side.
    # A fresh page: a hash change alone leaves the knowledge sheet open on top.
    driver.get("about:blank")
    driver.get(f"{base}/#dashboard?campaignId={cid}&sheet=signals")
    time.sleep(2)
    shoot(driver, out_dir, "09-signals-sheet")

    if WRAPPED:
        raise SystemExit(
            "Buttons whose label wraps onto a second line:\n  " + "\n  ".join(WRAPPED)
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--width", type=int, default=1440)
    parser.add_argument("--height", type=int, default=1000)
    parser.add_argument("--out", default=os.path.join(ROOT, "logs", "ui-shots"))
    parser.add_argument("--db", help="Path to the fixture database file")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)

    # Build fixture database if not provided
    if args.db and os.path.exists(args.db):
        db_path = args.db
    else:
        db_path = os.path.abspath(os.path.join(args.out, "fixture.db"))
        print(f"Seeding fixture database: {db_path}")
        subprocess.run(
            ["node", os.path.join(ROOT, "scripts", "seed_fixture_db.js"), db_path],
            check=True,
            cwd=ROOT,
        )
    db_path = os.path.abspath(db_path)

    port = free_port()
    server = None

    try:
        # Build frontend if dist doesn't exist
        dist_dir = os.path.join(ROOT, "frontend", "dist")
        backend_public = os.path.join(ROOT, "backend", "public")
        if not os.path.isdir(backend_public) or not os.listdir(backend_public):
            if os.path.isdir(dist_dir):
                # Link dist to backend/public so server.js serves it
                import shutil

                if os.path.isdir(backend_public):
                    shutil.rmtree(backend_public)
                os.symlink(dist_dir, backend_public)

        server = subprocess.Popen(
            ["node", os.path.join(ROOT, "backend", "server.js")],
            env=dict(
                os.environ,
                PRISMDEALS_DB=db_path,
                PRISMDEALS_PORT=str(port),
            ),
            cwd=os.path.join(ROOT, "backend"),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        base = f"http://127.0.0.1:{port}"
        if not wait_for(base):
            sys.exit("The backend did not come up within 60s.")

        driver = build_driver(args.width, args.height)
        try:
            walk(driver, base, args.out, args.width, args.height)
        finally:
            driver.quit()

        print(f"\n-> {args.out}")

    finally:
        if server:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()


if __name__ == "__main__":
    main()
