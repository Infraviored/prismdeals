#!/usr/bin/env python3
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app_harness import ROOT, running_app  # noqa: E402

# The screens the acceptance table in docs/plan-new-surface.md is measured on.
SCREENS = [
    ("suchen", "landing"),
    ("funde-laptops", "dashboard?campaignId=1"),
    ("funde-matratze", "dashboard?campaignId=5"),
    ("funde-drucker", "dashboard?campaignId=6"),
    ("einrichten", "edit?campaignId=6"),
    ("app", "settings"),
    ("neue-suche", "create-campaign"),
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


def measure(width):
    results = []
    with running_app(width) as app:
        for label, route in SCREENS:
            app.goto(route)
            app.shot(os.path.join(ROOT, "logs", "measure", f"{label}-{width}px.png"))
            metrics = app.driver.execute_script(MEASURE_JS)
            metrics["screen"] = label
            results.append(metrics)
    return results


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
