#!/usr/bin/env python3
"""Capture full screenshots of specimen C at 390px and 1440px."""

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
    cur = os.path.abspath(__file__)
    for _ in range(5):
        cur = os.path.dirname(cur)
        candidate = os.path.join(cur, "venv", "bin", "python")
        if os.path.exists(candidate) and sys.executable != candidate:
            os.execv(candidate, [candidate] + sys.argv)
    raise

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


def wait_for_images(driver, timeout=5.0):
    """Wait until all images in document are complete and loaded."""
    driver.set_script_timeout(timeout + 2)
    script = (
        """
    const callback = arguments[arguments.length - 1];
    const imgs = Array.from(document.images);
    if (imgs.length === 0) { callback(); return; }
    let remaining = imgs.length;
    const done = () => {
        remaining--;
        if (remaining <= 0) callback();
    };
    imgs.forEach(img => {
        if (img.complete) {
            done();
        } else {
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
        }
    });
    setTimeout(callback, """
        + str(int(timeout * 1000))
        + """);
    """
    )
    try:
        driver.execute_async_script(script)
    except Exception as e:
        print(f"Warning waiting for images: {e}")
    time.sleep(1.0)


def capture(driver, url, out_path, is_mobile=False):
    driver.get(url)
    if is_mobile:
        try:
            driver.execute_cdp_cmd(
                "Emulation.setDeviceMetricsOverride",
                {
                    "width": 390,
                    "height": 844,
                    "deviceScaleFactor": 1,
                    "mobile": True,
                },
            )
        except Exception as e:
            print(f"Device metrics override warning: {e}")

    wait_for_images(driver)

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

    clean_url = f"http://127.0.0.1:{port}/specimen-c.html?clean=1"

    # Mobile shot: 390x844
    driver_390 = get_driver(390, 844)
    try:
        capture(
            driver_390,
            clean_url,
            os.path.join(SHOTS, "specimen-c-390.png"),
            is_mobile=True,
        )
    finally:
        driver_390.quit()

    # Desktop shot: 1440x900
    driver_1440 = get_driver(1440, 900)
    try:
        capture(
            driver_1440,
            clean_url,
            os.path.join(SHOTS, "specimen-c-1440.png"),
            is_mobile=False,
        )
    finally:
        driver_1440.quit()

    httpd.shutdown()


if __name__ == "__main__":
    main()
