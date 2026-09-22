#!/usr/bin/env python3
"""Capture full screenshots of the specimen page at 390px and 1440px."""

import base64
import functools
import http.server
import os
import socketserver
import threading
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(ROOT, "frontend")
SHOTS = os.path.join(ROOT, "screenshots")


def _find(dir_path, name):
    if not os.path.isdir(dir_path):
        return None
    for root, _, files in os.walk(dir_path):
        if name in files:
            path = os.path.join(root, name)
            if os.access(path, os.X_OK):
                return path
    return None


def get_driver(width, height):
    opts = Options()
    for flag in (
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--hide-scrollbars",
    ):
        opts.add_argument(flag)
    opts.add_argument(f"--window-size={width},{height}")

    chrome = _find(os.path.expanduser("~/.cache/selenium/chrome"), "chrome")
    if chrome:
        opts.binary_location = chrome
    driver_path = _find(
        os.path.expanduser("~/.cache/selenium/chromedriver"), "chromedriver"
    )
    svc = Service(executable_path=driver_path) if driver_path else Service()
    return webdriver.Chrome(service=svc, options=opts)


def capture(driver, url, out_path, settle=2.0):
    driver.get(url)
    time.sleep(settle)
    try:
        data = driver.execute_cdp_cmd(
            "Page.captureScreenshot",
            {"format": "png", "captureBeyondViewport": True, "fromSurface": True},
        )
        with open(out_path, "wb") as f:
            f.write(base64.b64decode(data["data"]))
    except Exception:
        driver.save_screenshot(out_path)
    print(f"Captured {out_path} ({os.path.getsize(out_path)} bytes)")


def main():
    os.makedirs(SHOTS, exist_ok=True)
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=FRONTEND
    )
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]

    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)

    clean_url = f"http://127.0.0.1:{port}/specimen.html?clean=1"
    clean_w700_url = f"http://127.0.0.1:{port}/specimen.html?clean=1&weight=700"

    # Mobile shot: 390x844
    driver_390 = get_driver(390, 844)
    try:
        capture(driver_390, clean_url, os.path.join(SHOTS, "specimen-390.png"))
    finally:
        driver_390.quit()

    # Desktop shot: 1440x900 (weight 600)
    driver_1440 = get_driver(1440, 900)
    try:
        capture(driver_1440, clean_url, os.path.join(SHOTS, "specimen-1440.png"))
        capture(
            driver_1440, clean_w700_url, os.path.join(SHOTS, "specimen-1440-w700.png")
        )
    finally:
        driver_1440.quit()

    httpd.shutdown()


if __name__ == "__main__":
    main()
