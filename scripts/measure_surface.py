#!/usr/bin/env python3
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

# The screens the acceptance table in docs/plan-new-surface.md is measured on.
SCREENS = [
    ("suchen", "landing"),
    ("funde-laptops", "dashboard?campaignId=1"),
    ("funde-matratze", "dashboard?campaignId=5"),
    ("funde-drucker", "dashboard?campaignId=6"),
    ("einrichten", "edit?campaignId=6"),
]

# "Where does the content begin" means the first thing a person can read or
# press, not the first element on the page: a sticky bar that starts at y=0
# tells nobody anything about how far down the screen the content sits.
MEASURE_JS = """
const main = document.querySelector('main') || document.body;
const candidate = main.querySelector(
  'label, input, h1, h2, [data-testid="listing-row"], [data-testid="search-row"]'
);
const rect = candidate ? candidate.getBoundingClientRect() : main.getBoundingClientRect();
const buttons = document.querySelectorAll(
  'button, [role="button"], [data-testid="surface-pill"]'
);
const text = document.body.innerText || '';
const words = text.trim().split(/\\s+/).filter(w => w.length > 0);
const bar = document.querySelector('[data-testid="surface-bar"], header');
// The bar is the chrome. Everything else that looks like a button on these
// screens is content: a listing row, a model the family actually searches for.
// Counting both together made a printer family with eleven models read as a
// cluttered screen and a laptop campaign with none read as a clean one, when
// the chrome is identical on both.
const barButtons = bar
  ? bar.querySelectorAll('button, [role="button"], [data-testid="surface-pill"]').length
  : 0;
return {
    firstContentY: Math.round(rect.top),
    buttonCount: buttons.length,
    barButtons: barButtons,
    wordCount: words.length,
    scrollHeight: document.body.scrollHeight,
    // A page wider than its window is the defect the journey found four times.
    overflowsX: document.documentElement.scrollWidth > window.innerWidth,
    rowsRendered: document.querySelectorAll('[data-testid="listing-row"]').length,
    barText: bar ? (bar.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60) : '',
};
"""


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
            return True
        except Exception:
            time.sleep(0.4)
    return False


def make_test_user(db_path):
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

    def _find(root, name):
        for base, _dirs, files in os.walk(root):
            if name in files and os.access(os.path.join(base, name), os.X_OK):
                return os.path.join(base, name)
        return None

    chrome = _find(os.path.expanduser("~/.cache/selenium/chrome"), "chrome")
    if chrome:
        options.binary_location = chrome
    driver_path = _find(
        os.path.expanduser("~/.cache/selenium/chromedriver"), "chromedriver"
    )
    service = Service(executable_path=driver_path) if driver_path else Service()
    return webdriver.Chrome(service=service, options=options)


def measure(width):
    port = free_port()
    db_path = f"/tmp/prismdeals-measure-{port}.db"
    source_db = db_schema.default_path()
    shutil.copy(source_db, db_path)
    make_test_user(db_path)

    env = dict(os.environ, PRISMDEALS_DB=db_path, PRISMDEALS_PORT=str(port))
    backend = subprocess.Popen(
        ["node", "server.js"],
        cwd=os.path.join(ROOT, "backend"),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    driver = build_driver(width, 900)
    try:
        base = f"http://127.0.0.1:{port}"
        if not wait_for(base):
            raise RuntimeError("Backend failed to start")

        driver.get(base)
        wait = WebDriverWait(driver, 10)

        # Login
        email_inp = wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']"))
        )
        email_inp.send_keys(EMAIL)
        pass_inp = driver.find_element(By.CSS_SELECTOR, "input[type='password']")
        pass_inp.send_keys(PASSWORD)
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()

        wait.until(
            EC.invisibility_of_element_located(
                (By.CSS_SELECTOR, "input[type='password']")
            )
        )
        time.sleep(1)

        results = []
        for label, route in SCREENS:
            driver.get(f"{base}/#{route}")
            time.sleep(2)

            out_dir = os.path.join(ROOT, "logs", "measure")
            os.makedirs(out_dir, exist_ok=True)
            driver.save_screenshot(os.path.join(out_dir, f"{label}-{width}px.png"))

            metrics = driver.execute_script(MEASURE_JS)
            metrics["screen"] = label
            results.append(metrics)

        return results
    finally:
        driver.quit()
        backend.terminate()
        backend.wait()
        if os.path.exists(db_path):
            os.unlink(db_path)


def report(width, rows):
    print(f"=== {width} px ===")
    print(
        f"{'Bildschirm':<18}{'Inhalt ab':>11}{'Leiste':>8}{'Knoepfe':>9}{'Woerter':>9}"
        f"{'Hoehe':>10}{'Zeilen':>8}{'quer':>6}  Leiste"
    )
    for r in rows:
        print(
            f"{r['screen']:<18}{str(r['firstContentY']) + ' px':>11}"
            f"{r['barButtons']:>8}{r['buttonCount']:>9}{r['wordCount']:>9}"
            f"{str(r['scrollHeight']) + ' px':>10}{r['rowsRendered']:>8}"
            f"{('JA' if r['overflowsX'] else '-'):>6}  {r['barText']}"
        )
    print()


if __name__ == "__main__":
    for w in (390, 1440):
        report(w, measure(w))
