#!/usr/bin/env python3
import os
import shutil
import socket
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scraper"))

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
    source_db = os.environ.get(
        "PRISMDEALS_DB", os.path.join(ROOT, "data", "scraper.db")
    )
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

        # Open campaign 1 setup screen: navigate to #edit?campaignId=1
        driver.get(f"{base}/#edit?campaignId=1")
        time.sleep(2)

        # Save screenshot
        out_dir = os.path.join(ROOT, "logs", "ui-shots")
        os.makedirs(out_dir, exist_ok=True)
        shot_path = os.path.join(out_dir, f"03-setup-campaign-1-{width}px.png")
        driver.save_screenshot(shot_path)

        # Measure DOM
        js = """
        const main = document.querySelector('main');
        const firstInput = main ? main.querySelector('label, input') : null;
        const firstRect = firstInput ? firstInput.getBoundingClientRect() : (main ? main.getBoundingClientRect() : { top: 0 });
        
        const buttons = document.querySelectorAll('button, [role="button"], [data-testid="surface-pill"]');
        const visibleText = document.body.innerText || '';
        const words = visibleText.trim().split(/\\s+/).filter(w => w.length > 0);
        
        return {
            firstContentY: Math.round(firstRect.top),
            buttonCount: buttons.length,
            wordCount: words.length,
            scrollHeight: document.body.scrollHeight,
            visibleText: visibleText
        };
        """
        metrics = driver.execute_script(js)
        print(f"=== Width {width}px ===")
        print(f"First Content Y: {metrics['firstContentY']} px")
        print(f"Buttons on screen: {metrics['buttonCount']}")
        print(f"Word count: {metrics['wordCount']}")
        print(f"Page scroll height: {metrics['scrollHeight']} px")
        print(f"Screenshot saved: {shot_path}")
        return metrics
    finally:
        driver.quit()
        backend.terminate()
        backend.wait()
        if os.path.exists(db_path):
            os.unlink(db_path)


if __name__ == "__main__":
    measure(390)
    print()
    measure(1440)
