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


def shoot(driver, out_dir, name, settle=1.0):
    """The whole page, not just what happens to fit above the fold."""
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


def open_campaign(driver, name, settle=2.5):
    """Click the campaign card, the way a person reaches a campaign.

    Two URL-driven approaches failed before this one, and both failed silently
    by leaving the landing page on screen under a filename that claimed
    otherwise. `driver.get` on a URL differing only by its fragment performs no
    navigation at all in headless Chrome; assigning `location.hash` is undone
    within milliseconds by the app writing the hash back out of its own state.
    Clicking is also the more honest test -- it exercises the path a user takes.
    """
    from selenium.webdriver.common.by import By

    for card in driver.find_elements(
        By.CSS_SELECTOR, "div.cursor-pointer, [class*='cursor-pointer']"
    ):
        try:
            if name and name.lower() in (card.text or "").lower():
                driver.execute_script("arguments[0].click();", card)
                time.sleep(settle)
                return True
        except Exception:
            continue
    return False


def back_to_landing(driver, settle=2.0):
    from selenium.webdriver.common.by import By

    for btn in driver.find_elements(By.CSS_SELECTOR, "button"):
        txt = (btn.text or "").lower()
        if "back to" in txt or "zurück" in txt or "zuruck" in txt:
            driver.execute_script("arguments[0].click();", btn)
            time.sleep(settle)
            return True
    return False


def walk(driver, base, out_dir, width, height, db_path=None):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    wait = WebDriverWait(driver, 20)

    driver.get(base)
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input")))
    print("Photographing:")
    shoot(driver, out_dir, "01-login")

    # Reload before logging in, because the shot above broke the page's network.
    #
    # `shoot` grows the window to the full page height and saves a screenshot.
    # After that the DOM is still live -- the fields accept input and read back
    # correctly -- but every `fetch` from the page fails, so the login POST came
    # back as "Network connection failed", the app stayed on the login form, and
    # the walk gave up with "still unauthenticated" after only two images.
    #
    # Isolated by bisection: the same steps without the preceding `shoot` log in
    # fine; restoring the window size afterwards does not help; navigating anew
    # does. Whatever the screenshot does to the renderer, a fresh document
    # survives it.
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

    # Wait for the session: password input disappears and app header appears.
    try:
        wait.until(
            EC.invisibility_of_element_located(
                (By.CSS_SELECTOR, "input[type='password']")
            )
        )
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "header")))
    except Exception:
        print("  ! still unauthenticated - the shots below are the logged-out view")
    driver.set_window_size(width, height)

    shoot(driver, out_dir, "02-landing")

    # Read the campaigns from the database, not through the browser.
    #
    # This used to be `execute_script("return fetch('/api/campaigns')...")`, which
    # has two faults at once: `execute_script` cannot serialise the Promise it
    # returns, so the answer arrived as None; and every in-page fetch after a
    # `shoot` fails anyway, because saving a screenshot at full page height
    # leaves the document alive but its network dead. Either fault alone made the
    # walk stop with "no campaigns in the database" however many there were.
    #
    # We already own the database this throwaway server was pointed at, so ask it
    # directly. No browser, nothing to break.
    campaigns = []
    if db_path:
        import sqlite3

        try:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            conn.row_factory = sqlite3.Row
            campaigns = [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "route_id": row["route_id"],
                    "family_id": row["family_id"],
                }
                for row in conn.execute(
                    "SELECT c.id, c.name,"
                    " (SELECT r.id FROM route_searches r WHERE r.campaign_id = c.id"
                    "  ORDER BY r.id DESC LIMIT 1) AS route_id,"
                    " (SELECT f.id FROM search_families f WHERE f.campaign_id = c.id"
                    "  ORDER BY f.id DESC LIMIT 1) AS family_id"
                    " FROM campaigns c ORDER BY c.id"
                )
            ]
            conn.close()
        except Exception as error:
            print(f"  ! could not read campaigns from {db_path}: {error}")
    if not isinstance(campaigns, list) or not campaigns:
        print("  (no campaigns in the database; stopping after the landing view)")
        return

    for campaign in campaigns:
        identifier = campaign.get("id")
        has_route = bool(campaign.get("route_id"))
        has_family = bool(campaign.get("family_id"))

        name = campaign.get("name")
        if not open_campaign(driver, name):
            print(f"  ! could not open campaign {name!r}; skipping it")
            back_to_landing(driver)
            continue
        shoot(driver, out_dir, f"04-dashboard-{identifier}")

        # Settings via the gear, the way a person gets there.
        opened_settings = False
        for btn in driver.find_elements(By.CSS_SELECTOR, "button"):
            cls = btn.get_attribute("class") or ""
            if not (btn.text or "").strip() and "p-1.5" in cls:
                try:
                    driver.execute_script("arguments[0].click();", btn)
                    time.sleep(2)
                    opened_settings = True
                    break
                except Exception:
                    continue
        if opened_settings:
            shoot(driver, out_dir, f"03-campaign-{identifier}")

        if has_family:
            try:
                for btn in driver.find_elements(By.CSS_SELECTOR, "button"):
                    txt = (btn.text or "").lower()
                    if "route" in txt or "standort" in txt or "search area" in txt:
                        driver.execute_script("arguments[0].click();", btn)
                        time.sleep(1)
                        shoot(driver, out_dir, f"03b-geometry-settings-{identifier}")
                        break
            except Exception as error:
                print(f"  ! could not open geometry settings: {error}")

        if has_route or has_family:
            # Also capture the corridor dashboard view
            back_to_landing(driver)
            open_campaign(driver, name)
            time.sleep(2)
            shoot(driver, out_dir, f"04-corridor-dashboard-{identifier}")

            # The corridor stays editable from the results: open the planner and
            # let it draw, so the preview map is actually photographed rather
            # than assumed to work.
            try:
                for btn in driver.find_elements(By.CSS_SELECTOR, "button"):
                    if "corridor settings" in (btn.text or "").lower():
                        driver.execute_script("arguments[0].click();", btn)
                        # The preview is a routing request behind a debounce.
                        time.sleep(4)
                        shoot(driver, out_dir, f"04b-corridor-planner-{identifier}")
                        for cancel in driver.find_elements(By.CSS_SELECTOR, "button"):
                            if (cancel.text or "").strip().lower() in (
                                "cancel",
                                "abbrechen",
                            ):
                                driver.execute_script("arguments[0].click();", cancel)
                                break
                        time.sleep(1)
                        break
            except Exception as error:
                print(f"  ! could not open the corridor planner: {error}")

            # Click "Evaluate these with AI ->" to show that the wizard is a deliberate choice
            eval_btn = None
            try:
                eval_btn = driver.find_element(By.ID, "btn-evaluate-ai")
            except Exception:
                for btn in driver.find_elements(By.CSS_SELECTOR, "button"):
                    txt = (btn.text or "").lower()
                    if (
                        ("evaluate" in txt or " ai" in txt or "ki" in txt)
                        and "campaign" not in txt
                        and btn.is_displayed()
                    ):
                        eval_btn = btn
                        break
            if eval_btn and eval_btn.is_displayed():
                eval_btn.click()
                time.sleep(1.5)
                shoot(driver, out_dir, f"05-corridor-ai-wizard-{identifier}")

            # Return to results view
            for btn in driver.find_elements(By.CSS_SELECTOR, "button"):
                txt = (btn.text or "").lower()
                if ("results" in txt or "ergebnisse" in txt) and btn.is_displayed():
                    btn.click()
                    time.sleep(1.5)
                    shoot(driver, out_dir, f"06-corridor-back-to-results-{identifier}")
                    break

            # Capture mobile portrait view (~400px wide)
            driver.set_window_size(420, 840)
            time.sleep(1)
            shoot(driver, out_dir, f"07-corridor-mobile-{identifier}")
            driver.set_window_size(width, height)
            time.sleep(0.5)

        # Check if route planner panel can be opened (for campaigns without targets)
        for button in driver.find_elements(By.CSS_SELECTOR, "button"):
            if "route" in (button.text or "").lower() and button.is_displayed():
                button.click()
                shoot(driver, out_dir, f"08-route-panel-{identifier}")
                boxes = driver.find_elements(By.CSS_SELECTOR, "input[role='combobox']")
                if boxes:
                    boxes[0].send_keys("Landsberg")
                    shoot(
                        driver, out_dir, f"09-route-dropdown-{identifier}", settle=1.6
                    )
                break


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--width", type=int, default=1440)
    parser.add_argument("--height", type=int, default=1000)
    parser.add_argument("--out", default=os.path.join(ROOT, "logs", "ui-shots"))
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    db_path = f"/tmp/ui_shots_{os.getpid()}.db"
    port = free_port()
    server = None

    src_db = db_schema.default_path()
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

    try:
        if not os.path.exists(src_db):
            raise SystemExit(
                f"No database at {src_db}. This script photographs the running "
                f"interface, so it needs one to copy; run the backend once to "
                f"create it, or point PRISMDEALS_DB at an existing database."
            )
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

        driver = build_driver(args.width, args.height)
        try:
            walk(driver, base, args.out, args.width, args.height, db_path)
        finally:
            driver.quit()

        print(f"\n-> {args.out}")
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
            p = f"{db_path}{ext}"
            if os.path.exists(p):
                os.remove(p)


if __name__ == "__main__":
    main()
