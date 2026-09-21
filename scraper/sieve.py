"""Narrowing a broad search down to the few offers worth opening.

The instinct this is built on: searching for exactly what you want finds
nothing. "corsair vengeance lpx 3200 cl16 2x16" returns 0 offers; "corsair
vengeance 32gb" returns 87. So you search wide and sieve afterwards.

The sieve is a cascade, cheapest test first:

  1. the title        -- free, and decides most of them
  2. the description  -- one page fetch per listing that is still unclear
  3. the photos       -- a model call, only for what survives both

Most listings never reach step 3. Of 87 Corsair offers, the title alone
rejects the DDR3 ones, the 4x8 kits, the laptop SODIMMs and the defective
ones -- because sellers put exactly that in the title. Spending a model call on
"32GB DDR3 CORSAIR VENGEANCE" would be paying to learn what it already says.

A rule never says "yes" on its own. It can reject, or it can satisfy one
requirement; a listing is a candidate only when every requirement is met and
nothing rejected it.
"""

import re


class Rule:
    """One thing a title or description can tell us.

    `kind` is 'reject' or the name of a requirement it satisfies.
    """

    __slots__ = ("kind", "pattern", "why", "contradicts")

    def __init__(self, kind, pattern, why, contradicts=None):
        self.kind = kind
        self.pattern = re.compile(pattern, re.I)
        self.why = why
        # Which requirement this rejection speaks to, when it is a rejection
        # because a different value was stated. A later stage that contradicts
        # something the title already settled is a doubt, not a verdict.
        self.contradicts = contradicts

    def matches(self, text):
        return bool(self.pattern.search(text or ""))


class Spec:
    """What you are looking for, and what disqualifies an offer."""

    def __init__(self, name, requirements, rules, max_price=None):
        self.name = name
        self.requirements = list(requirements)
        self.rules = list(rules)
        self.max_price = max_price

    def judge(self, text, already=None):
        """Verdict for one piece of text.

        Returns (verdict, met, reasons) where verdict is 'reject', 'candidate'
        or 'unclear'. `already` carries requirements met by an earlier stage, so
        a title and a description can each contribute part of the answer.
        """
        met = set(already or ())
        reasons = []

        doubts = []
        for rule in self.rules:
            if not rule.matches(text):
                continue
            if rule.kind == "reject":
                # "Mein Testsystem kann nur 2666MHz" is the seller's mainboard,
                # not the memory, and it appeared under a title that plainly
                # said 3200. A contradiction of something an earlier stage
                # settled makes the listing unclear -- which is what the model
                # stage exists to resolve -- rather than throwing it away.
                if rule.contradicts and rule.contradicts in (already or ()):
                    doubts.append(rule.why)
                    met.discard(rule.contradicts)
                    continue
                return "reject", met, [rule.why]
            met.add(rule.kind)
            reasons.append(rule.why)

        missing = [r for r in self.requirements if r not in met]
        if missing or doubts:
            return "unclear", met, reasons + [f"contradicted: {d}" for d in doubts]
        return "candidate", met, reasons


def sift(spec, listings, text_of):
    """Splits listings into rejected, candidates and still-unclear.

    `text_of` pulls the text for this stage out of a listing, so the same
    function runs over titles and over descriptions.
    """
    rejected, candidates, unclear = [], [], []
    for listing in listings:
        if spec.max_price is not None:
            price = listing.get("price_eur")
            if price is not None and price > spec.max_price:
                rejected.append((listing, ["over the price limit"], set()))
                continue

        verdict, met, reasons = spec.judge(text_of(listing), listing.get("_met"))
        listing["_met"] = met
        if verdict == "reject":
            rejected.append((listing, reasons, met))
        elif verdict == "candidate":
            candidates.append((listing, reasons, met))
        else:
            unclear.append((listing, reasons, met))
    return rejected, candidates, unclear
