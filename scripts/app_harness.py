#!/usr/bin/env python3
"""Booting the application the way a person meets it, for scripts that look at it.

Three scripts now need the same five minutes of setup: a copy of the database
(never the live one), a throwaway user, the backend on a free port, a headless
browser at a chosen width, and a login. Copying that into each of them is how
scripts/measure_edit_screen.py came to resolve the database path by hand and
read a different database than its sibling.

Use it as a context manager:

    with running_app(390) as app:
        app.goto("landing")
        app.driver.execute_script("return document.title")
"""

import contextlib
import os
import sqlite3
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
            return True  # answering at all is what we are waiting for
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


class App:
    def __init__(self, driver, base):
        self.driver = driver
        self.base = base

    def goto(self, route, settle=2.0):
        """Opens a hash route and waits for it to settle."""
        self.driver.get(f"{self.base}/#{route}")
        time.sleep(settle)

    def click(self, css, settle=1.0):
        """Clicks the first match, or says it was not there.

        Screens that only exist after an interaction -- the find sheet, the
        models sheet -- were never measured or audited, because a URL cannot
        reach them.
        """
        from selenium.webdriver.common.by import By

        elements = self.driver.find_elements(By.CSS_SELECTOR, css)
        if not elements:
            return False
        self.driver.execute_script("arguments[0].click();", elements[0])
        time.sleep(settle)
        return True

    def shot(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.driver.save_screenshot(path)
        return path

    def shot_full(self, path):
        """The whole document, not just the window.

        A form whose delete button sits below the fold is invisible to a plain
        screenshot, which is how a broken button survived a review.
        """
        os.makedirs(os.path.dirname(path), exist_ok=True)
        result = self.driver.execute_cdp_cmd(
            "Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True}
        )
        import base64

        with open(path, "wb") as handle:
            handle.write(base64.b64decode(result["data"]))
        return path


@contextlib.contextmanager
def running_app(width, height=900):
    """Yields a logged-in App against a copy of the live database."""
    port = free_port()
    db_path = f"/tmp/prismdeals-harness-{port}.db"

    # VACUUM INTO, not a file copy. The database runs in WAL mode and its -wal
    # file is nearly as large as the database itself, so copying only the .db
    # loses every recent write. A screen measured that way shows a search that
    # has fifty listings as empty -- which is exactly what happened, silently,
    # to every measurement and audit run before this line was written.
    source = sqlite3.connect(f"file:{db_schema.default_path()}?mode=ro", uri=True)
    try:
        source.execute("VACUUM INTO ?", (db_path,))
    finally:
        source.close()

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

    driver = build_driver(width, height)
    try:
        base = f"http://127.0.0.1:{port}"
        if not wait_for(base):
            raise RuntimeError("Backend failed to start")

        driver.get(base)
        wait = WebDriverWait(driver, 10)
        wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']"))
        ).send_keys(EMAIL)
        driver.find_element(By.CSS_SELECTOR, "input[type='password']").send_keys(
            PASSWORD
        )
        driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        wait.until(
            EC.invisibility_of_element_located(
                (By.CSS_SELECTOR, "input[type='password']")
            )
        )
        time.sleep(1)

        yield App(driver, base)
    finally:
        driver.quit()
        backend.terminate()
        backend.wait()
        if os.path.exists(db_path):
            os.unlink(db_path)
