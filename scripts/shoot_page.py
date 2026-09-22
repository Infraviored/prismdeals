#!/usr/bin/env python3
"""Fotografiert eine Seite in voller Länge, bei mehreren Breiten.

Die Seite wird vorher einmal ganz durchgescrollt, damit nachgeladene Bilder
wirklich da sind, und erst dann am Stück aufgenommen.

    scripts/shoot_page.py frontend/specimen-c.html
    scripts/shoot_page.py frontend/specimen-c.html --widths 390,1440 --query clean=1&tab=no
    scripts/shoot_page.py https://prismdeals.net/musterbogen-c.html --out screenshots/live

Eine lokale Datei wird über einen kurzlebigen Server aus ihrem Ordner
ausgeliefert, damit fetch('/…') auf Nachbardateien funktioniert.
"""

import argparse
import base64
import functools
import http.server
import os
import socketserver
import sys
import threading
import time

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
except ImportError:
    here = os.path.abspath(__file__)
    for _ in range(5):
        here = os.path.dirname(here)
        venv_python = os.path.join(here, "venv", "bin", "python")
        if os.path.exists(venv_python) and sys.executable != venv_python:
            os.execv(venv_python, [venv_python] + sys.argv)
    raise

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHONE_HEIGHT = 844
DESKTOP_HEIGHT = 900


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def _find_executable(base, name):
    base = os.path.expanduser(base)
    for root, _, files in os.walk(base) if os.path.isdir(base) else ():
        path = os.path.join(root, name)
        if name in files and os.access(path, os.X_OK):
            return path
    return None


def _driver(width, height, mobile):
    opts = Options()
    for flag in (
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--hide-scrollbars",
    ):
        opts.add_argument(flag)
    opts.add_argument(f"--window-size={width},{height}")
    chrome = _find_executable("~/.cache/selenium/chrome", "chrome")
    if chrome:
        opts.binary_location = chrome
    chromedriver = _find_executable("~/.cache/selenium/chromedriver", "chromedriver")
    driver = webdriver.Chrome(
        service=Service(executable_path=chromedriver) if chromedriver else Service(),
        options=opts,
    )
    driver.execute_cdp_cmd(
        "Emulation.setDeviceMetricsOverride",
        {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": mobile},
    )
    return driver


def _scroll_through(driver, height):
    """Scrollt bildschirmweise nach unten, damit lazy geladene Bilder anspringen."""
    total = driver.execute_script("return document.documentElement.scrollHeight")
    for y in range(0, total + height, height // 2):
        driver.execute_script("window.scrollTo(0, arguments[0])", y)
        time.sleep(0.15)
    driver.execute_script("window.scrollTo(0, 0)")


def _wait_for_images(driver, timeout=8.0):
    driver.set_script_timeout(timeout + 2)
    driver.execute_async_script(
        """
        const done = arguments[arguments.length - 1];
        const pending = [...document.images].filter(i => !i.complete);
        if (!pending.length) return done();
        let left = pending.length;
        const tick = () => { if (--left <= 0) done(); };
        pending.forEach(i => { i.addEventListener('load', tick, {once: true});
                               i.addEventListener('error', tick, {once: true}); });
        setTimeout(done, arguments[0]);
        """,
        int(timeout * 1000),
    )


def shoot(url, width, out_path):
    mobile = width < 600
    height = PHONE_HEIGHT if mobile else DESKTOP_HEIGHT
    driver = _driver(width, height, mobile)
    try:
        driver.get(url)
        time.sleep(1.0)
        _scroll_through(driver, height)
        _wait_for_images(driver)
        time.sleep(0.5)
        page_height = driver.execute_script(
            "return document.documentElement.scrollHeight"
        )
        broken = driver.execute_script(
            "return [...document.images].filter(i => i.complete && !i.naturalWidth).length"
        )
        data = driver.execute_cdp_cmd(
            "Page.captureScreenshot",
            {"format": "png", "captureBeyondViewport": True, "fromSurface": True},
        )
        with open(out_path, "wb") as f:
            f.write(base64.b64decode(data["data"]))
        note = f", {broken} Bilder kaputt" if broken else ""
        print(f"{out_path}: {width}×{page_height} px{note}")
    finally:
        driver.quit()


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("page", help="lokale HTML-Datei oder http(s)-Adresse")
    ap.add_argument("--widths", default="390,1440")
    ap.add_argument("--query", default="clean=1", help="angehängt als ?…")
    ap.add_argument("--out", help="Dateiname ohne Breite, Standard: screenshots/<name>")
    args = ap.parse_args()

    httpd = None
    if args.page.startswith(("http://", "https://")):
        base_url = args.page
        name = os.path.splitext(os.path.basename(args.page.split("?")[0]))[0] or "page"
    else:
        path = os.path.abspath(args.page)
        handler = functools.partial(_QuietHandler, directory=os.path.dirname(path))
        httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        base_url = (
            f"http://127.0.0.1:{httpd.server_address[1]}/{os.path.basename(path)}"
        )
        name = os.path.splitext(os.path.basename(path))[0]

    url = (
        f"{base_url}{'&' if '?' in base_url else '?'}{args.query}"
        if args.query
        else base_url
    )
    prefix = args.out or os.path.join(ROOT, "screenshots", name)
    os.makedirs(os.path.dirname(os.path.abspath(prefix)), exist_ok=True)

    try:
        for width in (int(w) for w in args.widths.split(",")):
            shoot(url, width, f"{prefix}-{width}.png")
    finally:
        if httpd:
            httpd.shutdown()


if __name__ == "__main__":
    main()
