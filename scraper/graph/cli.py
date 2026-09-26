"""The graph's one entry for the backend and the crawler (plan §12).

    python -m graph.cli seed
    python -m graph.cli place <category_code> <text>
    python -m graph.cli describe <node_id>
    python -m graph.cli process [<listing_id> ...]     (none: every unresolved listing)
    python -m graph.cli hunt-save [<campaign_id>]      (the hunt document on stdin)
    python -m graph.cli refine <campaign_id>
    python -m graph.cli hunt-delete <campaign_id>      (its listings stay)
    python -m graph.cli draft <text>                   (a hunt document, not saved)
    python -m graph.cli brief <campaign_id>            (the research brief for its targets)
    python -m graph.cli classify <campaign_id>         (a research answer on stdin -> knowledge)
    python -m graph.cli approve|reject <knowledge_id>

JSON on stdout. A model that cannot be asked is {"error": "..."} with exit 2 --
never a guessed answer.
"""

import argparse
import json
import sys

import db_schema

from . import draft, facts, hunts, knowledge, llm, place, taxonomy


def process_listings(conn, listing_ids=None):
    """Resolves and reads the given listings, or every one not yet resolved."""
    if listing_ids is None:
        listing_ids = [
            r[0]
            for r in conn.execute(
                """SELECT l.id FROM listings l
                     LEFT JOIN listing_resolution r ON r.listing_id = l.id
                    WHERE r.listing_id IS NULL"""
            ).fetchall()
        ]
    resolved = 0
    for listing_id in listing_ids:
        if facts.process(conn, listing_id) is not None:
            resolved += 1
    conn.commit()
    return {"listings": len(listing_ids), "resolved": resolved}


def main(argv=None):
    parser = argparse.ArgumentParser(prog="graph.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("seed")
    p = sub.add_parser("place")
    p.add_argument("category_code")
    p.add_argument("text")
    d = sub.add_parser("describe")
    d.add_argument("node_id", type=int)
    r = sub.add_parser("process")
    r.add_argument("listing_ids", nargs="*")
    h = sub.add_parser("hunt-save")
    h.add_argument("campaign_id", type=int, nargs="?")
    f = sub.add_parser("refine")
    f.add_argument("campaign_id", type=int)
    sub.add_parser("hunt-delete").add_argument("campaign_id", type=int)
    t = sub.add_parser("draft")
    t.add_argument("text")
    for name in ("brief", "classify"):
        sub.add_parser(name).add_argument("campaign_id", type=int)
    for name in ("approve", "reject"):
        sub.add_parser(name).add_argument("knowledge_id", type=int)
    args = parser.parse_args(argv)

    conn = db_schema.connect(db_schema.default_path())
    try:
        # The taxonomy is the root every other command stands on.
        if (
            args.command == "seed"
            or not conn.execute("SELECT 1 FROM nodes LIMIT 1").fetchone()
        ):
            seeded = taxonomy.seed(conn)
        if args.command == "seed":
            out = seeded
        elif args.command == "place":
            out = place.describe(conn, place.place(conn, args.text, args.category_code))
        elif args.command == "describe":
            out = place.describe(conn, args.node_id)
        elif args.command == "process":
            out = process_listings(conn, args.listing_ids or None)
        elif args.command == "hunt-save":
            before = (
                hunts.search_urls(conn, args.campaign_id) if args.campaign_id else set()
            )
            campaign_id = hunts.save(conn, json.load(sys.stdin), args.campaign_id)
            # Whether the crawl itself changed: a new target, place, radius or a
            # must the site filters -- the screen starts a crawl only then.
            out = {
                "id": campaign_id,
                "crawl_changed": hunts.search_urls(conn, campaign_id) != before,
            }
        elif args.command == "hunt-delete":
            out = hunts.delete(conn, args.campaign_id)
        elif args.command == "draft":
            out = draft.draft(conn, args.text)
        elif args.command == "brief":
            out = knowledge.brief(conn, args.campaign_id)
        elif args.command == "classify":
            out = knowledge.classify(conn, args.campaign_id, sys.stdin.read())
        elif args.command in ("approve", "reject"):
            getattr(knowledge, args.command)(conn, args.knowledge_id)
            out = {"id": args.knowledge_id, args.command + "d": True}
        else:
            out = hunts.refine(conn, args.campaign_id)
    except llm.NoModel as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        return 2
    except (place.PlaceError, hunts.HuntError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        return 1
    finally:
        conn.close()
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
