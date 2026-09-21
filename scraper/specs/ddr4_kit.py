"""Looking for a matched pair of DDR4 sticks.

Written against the 87 offers a search for "corsair vengeance 32gb" actually
returns, not against an idea of what sellers write. Every rejection below
appears verbatim in those titles:

    Corsair Vengeance Pro 32GB (4x8) DDR RAM VERPACKUNG        -- packaging, 3 EUR
    DDR3 RAM 32GB Corsair Vengeance 1600MHz (4x 8GB)          -- wrong generation
    Corsair Vengeance LP  32Gb  8Gb mal 4                      -- four sticks
    32GB Corsair Vengeance SODIMM DDR4 (2x 16GB)               -- laptop memory
    Teildefekt Corsair Vengeance 32GB (2x 16GB) DDR4-3200 CL16 -- the exact spec, broken
"""

from sieve import Rule, Spec


def two_by_sixteen_ddr4(max_price=150, speed=3200, latency=16):
    """A 2x16 GB DDR4 kit, optionally at a given speed and latency.

    Speed and latency are requirements rather than rejections: a title that
    does not mention them is unclear, not wrong, and the next stage can still
    find them in the description.
    """
    return Spec(
        name=f"2x16 GB DDR4-{speed} CL{latency}",
        requirements=["layout", "generation", "speed", "latency"],
        max_price=max_price,
        rules=[
            # -- disqualifying, in the order they cost least to be sure of ----
            # "nur die Verpackung" is an empty box for sale; "Originalverpackung"
            # and "Die äußere Verpackung ist vorhanden" are the opposite -- the
            # memory comes boxed. The first version of this rule matched the
            # word alone and threw away two good offers at 110 and 125 EUR.
            Rule(
                "reject",
                r"\bnur\s+(die\s+|das\s+)?(verpackung|ovp|karton|box)\b"
                r"|verpackung\s+(ohne|leer)|leere\s+(verpackung|ovp)",
                "the packaging, not the memory",
            ),
            Rule("reject", r"defe[ck]t|teildefekt|kaputt|\bdead\b", "sold as faulty"),
            Rule(
                "reject",
                r"\bddr3l?\b|\bddr2\b|\bdimm\s*ddr3\b",
                "wrong memory generation",
            ),
            Rule(
                "reject",
                r"sodimm|so-dimm|\bnotebook\b|\blaptop[- ]?ram\b",
                "laptop memory, not desktop",
            ),
            # Four sticks written every way sellers write it. 32 GB as 4x8 is
            # the commonest offer in this search and the one thing the buyer
            # does not want.
            # No trailing word boundary: sellers write "4x8GB" as one token, and
            # \b between 8 and G never matches. That leak let
            # "LPX 4x8GB 2666MHz CL16" through as merely unclear.
            Rule(
                "reject",
                r"\b4\s*[x×]\s*8|8\s*gb\s*mal\s*4|\bvier\s+riegel\b",
                "four 8 GB sticks, not a matched pair",
            ),
            Rule("reject", r"\b4\s*[x×]\s*4|\b2\s*[x×]\s*8", "wrong stick size"),
            # -- satisfying a requirement ------------------------------------
            Rule("layout", r"2\s*[x×]\s*16|\(2x16|zwei\s+riegel", "two 16 GB sticks"),
            Rule("generation", r"\bddr4\b", "DDR4"),
            # (?!\d) rather than \b after a number: "3000MHz" has no word
            # boundary between the 0 and the M, so \b3000\b never matched the
            # commonest way sellers write a speed. What it must not do is match
            # 3200 inside 32000.
            Rule("speed", rf"\b{speed}(?!\d)", f"{speed} MHz"),
            Rule(
                "latency",
                rf"\bcl\s*{latency}(?!\d)|\b{latency}-\d\d-\d\d",
                f"CL{latency}",
            ),
        ]
        # A different speed or latency, stated plainly, is not an unknown -- it
        # is a no. Without this, "Corsair Vengeance LPX 32GB (2x16GB) DDR4-3600
        # CL18" sat in the unclear pile and would have cost a page fetch, and
        # then a model call, to learn what its title already said.
        + [
            Rule(
                "reject",
                rf"\b{other}(?!\d)",
                f"{other} MHz, not {speed}",
                contradicts="speed",
            )
            for other in (2133, 2400, 2666, 2933, 3000, 3466, 3600, 4000)
            if other != speed
        ]
        + [
            Rule(
                "reject",
                rf"\bcl\s*{other}(?!\d)",
                f"CL{other}, not CL{latency}",
                contradicts="latency",
            )
            for other in (9, 10, 14, 15, 17, 18, 19, 20, 22)
            if other != latency
        ],
    )
