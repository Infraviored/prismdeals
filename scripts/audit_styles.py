#!/usr/bin/env python3
"""Finding broken styling by asking the browser, not by looking.

Three rounds of review missed a delete button that renders as bare blue
underlined text, a place field that repeats itself in green underneath, and
three different printer models all truncated to the same "HP LaserJet Pro MFP
M42...". Every one of those is visible in the rendered DOM as a measurable
fact, so a person should not have to notice them.

Each check below is a defect this project actually shipped. Run it at 390 and
1440; a finding at one width and not the other is still a finding.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app_harness import ROOT, running_app  # noqa: E402

# (label, route, optional selector to click once the route has settled)
SCREENS = [
    ("suchen", "landing"),
    ("funde-laptops", "dashboard?campaignId=1"),
    ("funde-matratze", "dashboard?campaignId=5"),
    ("funde-drucker", "dashboard?campaignId=6"),
    ("einrichten", "edit?campaignId=6"),
    ("app", "settings"),
    ("neue-suche", "create-campaign"),
    # The sheet a buying decision is made on. No URL reaches it, so it was
    # never measured and never audited.
    ("fund", "dashboard?campaignId=7", '[data-testid="listing-row"]'),
    ("gemerkt", "kept"),
]

# The one colour with a reserved meaning: the price is a signal. A button, a
# pill or a heading wearing it is a defect, not a decision.
ACCENT = "rgb(232, 121, 103)"

AUDIT_JS = r"""
const findings = [];
const seen = new Set();
const add = (kind, el, detail) => {
  const where = el.tagName.toLowerCase()
    + (el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '');
  const text = (el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 48);
  const key = kind + '|' + where + '|' + text + '|' + detail;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({ kind, where, text, detail });
};

const visible = el => {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
};

for (const el of document.querySelectorAll('body *')) {
  if (!visible(el)) continue;
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const tag = el.tagName.toLowerCase();
  // "Has no children" is not the same as "carries the text". A heading that
  // wraps one word in a <span> stopped being checked at all, and the checks
  // below are about text and about paint, not about tree shape.
  const ownsText = [...el.childNodes].some(
    node => node.nodeType === 3 && node.textContent.trim()
  );
  const parentStyle = el.parentElement ? getComputedStyle(el.parentElement) : null;

  // 1. Text cut off inside its own box. "Corridor settings" became "Corridor
  //    setting"; "Korridor" became "rridor".
  //    An ellipsis is a promise that text continues; a hard cut is a bug.
  if (ownsText && el.scrollWidth > el.clientWidth + 1
      && style.textOverflow !== 'ellipsis'
      && style.overflow !== 'auto'
      && style.overflowX !== 'auto' && style.overflowX !== 'scroll') {
    add('abgeschnitten', el, `${el.scrollWidth}px Inhalt in ${el.clientWidth}px Kasten`);
  }

  // 2. A button the browser styled, not us: default blue link colour or an
  //    unstyled user-agent button face.
  if (tag === 'button' || el.getAttribute('role') === 'button') {
    const bare = style.backgroundColor === 'rgba(0, 0, 0, 0)'
      && style.borderStyle === 'none'
      && (style.textDecorationLine === 'underline'
          || style.color === 'rgb(0, 0, 238)'
          || style.color === 'rgb(0, 0, 255)');
    if (bare) add('nackter-knopf', el, `Farbe ${style.color}, ${style.textDecorationLine}`);
    if (style.backgroundColor === 'buttonface' || style.appearance === 'auto') {
      add('ungestylter-knopf', el, 'Browser-Voreinstellung');
    }
    // 3. Too small to hit with a thumb.
    // 36px is the floor this surface builds to: a 48px bar holds a 36px
    //    pill with room to breathe, and a thumb finds it.
    if (rect.height < 36 && rect.height > 0) {
      add('zu-klein', el, `${Math.round(rect.width)}x${Math.round(rect.height)}px`);
    }
  }

  // 4. The accent outside a price.
  // Reported where the colour is set, not everywhere it is inherited: the
  // element whose parent already had it is not the one that chose it. Checking
  // only childless elements missed every wrapper that paints itself.
  const setsAccent = prop =>
    style[prop] === ACCENT_PLACEHOLDER && (!parentStyle || parentStyle[prop] !== ACCENT_PLACEHOLDER);
  const wearsAccent =
    setsAccent('color')
    || setsAccent('backgroundColor')
    || (style.borderColor === ACCENT_PLACEHOLDER && style.borderStyle !== 'none');
  if (wearsAccent) {
    const isPrice = el.closest('[data-testid="listing-price"], [data-price-signal]') !== null;
    if (!isPrice) add('koralle-ausserhalb-preis', el, style.color);
  }

  // 5. Shouted labels. Not a bug, a tell: every generated page has them.
  if (ownsText && style.textTransform === 'uppercase') {
    add('grossbuchstaben', el, 'text-transform: uppercase');
  }

  // 6. Text smaller than 11px is decoration, not information.
  if (ownsText && (el.innerText || '').trim()) {
    const size = parseFloat(style.fontSize);
    if (size && size < 11) add('winzige-schrift', el, `${size}px`);
  }

  // 7. Wider than the window: the page scrolls sideways. A row inside its own
  //    horizontally scrolling box is the documented exception -- the bar's
  //    actions live in one -- and reporting those said 36 defects about a page
  //    whose body does not move a pixel.
  const inScroller = el.closest(
    '[style*="overflow-x"], .overflow-x-auto, .overflow-x-scroll, .overflow-auto, .overflow-scroll'
  );
  if (rect.right > window.innerWidth + 1 && style.position !== 'fixed' && !inScroller) {
    add('ragt-heraus', el, `rechts bei ${Math.round(rect.right)}px, Fenster ${window.innerWidth}px`);
  }
}

// 8. The same words twice in a row -- a field that echoes itself underneath.
// Two search rows may honestly share a corridor name; a field that repeats
// itself underneath cannot. Only duplicates under one parent are a defect.
// A wrapper div between the two copies used to hide the echo, so the block
// they share is what counts, not the tag that happens to hold each one.
const blockOf = el => {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const d = getComputedStyle(node).display;
    if (d !== 'inline' && d !== 'contents') return node;
    node = node.parentElement;
  }
  return node;
};
const texts = [];
for (const el of document.querySelectorAll('body *')) {
  if (!visible(el) || el.children.length) continue;
  const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
  if (t.length > 8) texts.push([t, el, blockOf(el)]);
}
for (let i = 1; i < texts.length; i++) {
  if (texts[i][0] === texts[i - 1][0]
      && texts[i][2] === texts[i - 1][2]) {
    add('doppelter-text', texts[i][1], `steht zweimal: "${texts[i][0].slice(0, 40)}"`);
  }
}

// 9. Several controls truncated to the same string are indistinguishable.
const labels = {};
for (const el of document.querySelectorAll('button, [role="button"]')) {
  if (!visible(el)) continue;
  const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
  if (t.includes('…') || t.endsWith('...')) {
    labels[t] = (labels[t] || 0) + 1;
  }
}
for (const [label, count] of Object.entries(labels)) {
  if (count > 1) {
    findings.push({
      kind: 'gleich-abgeschnitten',
      where: 'button',
      text: label,
      detail: `${count} Knoepfe tragen dieselbe abgeschnittene Beschriftung`,
    });
  }
}

return findings;
""".replace("ACCENT_PLACEHOLDER", f"'{ACCENT}'")


def audit(width):
    results = []
    with running_app(width) as app:
        for entry in SCREENS:
            label, route = entry[0], entry[1]
            opener = entry[2] if len(entry) > 2 else None
            app.goto(route)
            if opener and not app.click(opener):
                print(f"  ! {label}: nichts zum Anklicken ({opener})")
                continue
            # A sheet is fixed to the viewport while the list behind it stays
            # 4,500 px tall, so a full-page capture shows both and reads as if
            # the sheet covered nothing. For an overlay the window is the
            # honest frame.
            out = os.path.join(ROOT, "logs", "audit", f"{label}-{width}px.png")
            app.shot(out) if opener else app.shot_full(out)
            for finding in app.driver.execute_script(AUDIT_JS):
                finding["screen"] = label
                results.append(finding)
    return results


def report(width, findings):
    print(f"=== {width} px: {len(findings)} Befunde ===")
    if not findings:
        print("  keine")
        print()
        return
    by_kind = {}
    for f in findings:
        by_kind.setdefault(f["kind"], []).append(f)
    for kind in sorted(by_kind, key=lambda k: -len(by_kind[k])):
        items = by_kind[kind]
        print(f"\n  {kind} ({len(items)})")
        for f in items[:6]:
            text = f"'{f['text']}'" if f["text"] else f["where"]
            print(f"    {f['screen']:<16} {text:<52} {f['detail']}")
        if len(items) > 6:
            print(f"    ... und {len(items) - 6} weitere")
    print()


if __name__ == "__main__":
    total = 0
    for w in (390, 1440):
        found = audit(w)
        total += len(found)
        report(w, found)
    sys.exit(1 if total else 0)
