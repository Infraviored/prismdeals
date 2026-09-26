import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import datetime
import db_schema
import json

import rate_limiter
import sqlite3
import logging
from logging.handlers import RotatingFileHandler
import argparse
from scraper import (
    ScrapeRefused,
    scrape_listings,
    harvest_descriptions,
    update_all_descriptions_session,
    update_progress,
)

# Set up logging to both console and file
log_file = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "scraper.log",
)
os.makedirs(os.path.dirname(log_file), exist_ok=True)

root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

# Clear existing handlers to prevent duplicate logs
for handler in list(root_logger.handlers):
    root_logger.removeHandler(handler)

formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")

# Console handler
console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
root_logger.addHandler(console_handler)

# File handler with rotation (max 5MB, keep 3 backups)
file_handler = RotatingFileHandler(
    log_file, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
)
file_handler.setFormatter(formatter)
root_logger.addHandler(file_handler)

logger = logging.getLogger(__name__)

DB_PATH = db_schema.default_path()


def get_db_connection():
    return db_schema.connect(DB_PATH)


def annotate_route_detours(conn, campaign_id=None):
    """Computes detours for every route search that has listings waiting.

    Deliberately forgiving: a route whose routing fails is logged and the rest
    still run. The detour is an enrichment, and an enrichment must never be able
    to fail a scrape that already succeeded.
    """
    try:
        import route_pipeline
        import route_store

        route_store.ensure_schema(conn)
        if campaign_id is None:
            rows = conn.execute("SELECT id, name FROM route_searches").fetchall()
        else:
            rows = conn.execute(
                "SELECT id, name FROM route_searches WHERE campaign_id = ?",
                (campaign_id,),
            ).fetchall()
    except Exception as exc:
        logger.info("No route searches to annotate (%s).", exc)
        return

    for row in rows:
        route_id, name = row[0], row[1]
        try:
            summary = route_pipeline.annotate(conn, route_id)
            if summary["considered"]:
                logger.info("Route %s (%s): %s", route_id, name, summary)
        except Exception as exc:
            logger.warning(
                "Could not compute detours for route %s (%s): %s. Listings are "
                "stored; the next run will try again.",
                route_id,
                name,
                exc,
            )


def run_family_route_mode(args):
    """Gives a hunt a corridor after the fact, or takes it away."""
    import family_route

    if not args.family_id:
        print("__FAMILY_ROUTE_ERROR__:Missing family id")
        return
    conn = get_db_connection()
    try:
        if args.mode == "family-route-clear":
            family_route.clear_route(conn, args.family_id)
            print("__FAMILY_ROUTE__:" + json.dumps({"route_id": None}))
            return
        if not args.origin or not args.destination:
            print("__FAMILY_ROUTE_ERROR__:Missing start or destination")
            return
        route_id, plan = family_route.set_route(
            conn,
            args.family_id,
            args.origin,
            args.destination,
            radius_km=args.radius_km,
            half_width_km=args.corridor_km,
        )
        print(
            "__FAMILY_ROUTE__:"
            + json.dumps({"route_id": route_id, "circles": len(plan.circles)})
        )
    except ValueError as error:
        print(f"__FAMILY_ROUTE_ERROR__:{error}")


def main():
    """Main entry point that acts as a wrapper for different functionalities"""
    parser = argparse.ArgumentParser(
        description="Multi-Domain Expert scraper and processor"
    )
    parser.add_argument(
        "--mode",
        choices=[
            "scrape",
            "process",
            "both",
            "update-all",
            "family-route",
            "family-route-clear",
        ],
        default="both",
        help=(
            "Operation mode: scrape, process (graph), both, update-all, "
            "family-route or family-route-clear"
        ),
    )

    parser.add_argument(
        "--urls",
        nargs="+",
        default=None,
        help="Specific URLs to scrape (overrides DB search list)",
    )
    parser.add_argument(
        "--max-listings",
        type=int,
        default=None,
        help="Maximum number of listings to scrape per URL",
    )
    parser.add_argument(
        "--search-id",
        type=int,
        default=None,
        help="Search ID to associate the scraped listings with",
    )
    parser.add_argument(
        "--campaign-id",
        type=int,
        default=None,
        help="Campaign ID to filter searches, description updates, and AI matching",
    )

    # --- route search --------------------------------------------------
    route = parser.add_argument_group(
        "route search",
        "A hunt's corridor: covered by the fewest circles that reach its edges, "
        "each registered as an ordinary search; detours follow every crawl.",
    )
    route.add_argument(
        "--from",
        dest="origin",
        help="Where the trip starts: a postal code, or 'Ort, Bundesland'",
    )
    route.add_argument(
        "--to",
        dest="destination",
        help="Where it ends: a postal code, or 'Ort, Bundesland'",
    )
    route.add_argument(
        "--radius-km",
        type=float,
        default=30.0,
        help="Search radius per circle (default: 30)",
    )
    route.add_argument(
        "--corridor-km",
        type=float,
        default=15.0,
        help="How far off the route to search, each side (default: 15)",
    )
    # --- the hunt's family ------------------------------------------------
    family = parser.add_argument_group("search families")
    family.add_argument(
        "--family-id",
        type=int,
        default=None,
        help="The hunt's search family whose corridor is set or cleared",
    )

    args = parser.parse_args()

    if args.mode in ("family-route", "family-route-clear"):
        run_family_route_mode(args)
        return

    if args.mode == "update-all":
        logger.info("Executing deep update of existing descriptions...")
        try:
            update_all_descriptions_session(args.campaign_id)
            logger.info("Deep updates completed successfully.")
        except Exception as e:
            logger.error(f"Error during deep updates: {str(e)}")
        return

    # Define paths for data
    data_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"
    )
    # One file per run, not one file for the machine. A scheduled run and a
    # run the user started from the browser shared "temp_scraped.json": the
    # second one deleted it while the first was parsing it, so one of the two
    # imported nothing and reported success.
    temp_output_file = os.path.join(data_dir, f"temp_scraped.{os.getpid()}.json")

    # Create data directory if it doesn't exist
    os.makedirs(data_dir, exist_ok=True)

    # Targets the site refused outright, reported at the end rather than lost
    # among the log lines of a run that otherwise looks successful.
    refused_urls = []

    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Scraping Mode
    if args.mode in ["scrape", "both"]:
        logger.info("Starting dynamic scraping mode")

        # Load targets from database
        search_targets = []
        if args.urls is not None:
            # Overridden via command line arguments
            for url in args.urls:
                search_targets.append({"url": url, "search_id": args.search_id})
        else:
            from graph import crawlplan

            # Demand order: what most hunts want and has waited longest first.
            for unit in crawlplan.plan(conn, args.campaign_id):
                search_targets.append(
                    {
                        "url": unit["url"],
                        "search_id": unit["search_id"],
                        "pages": unit["pages"],
                    }
                )
            logger.info("Crawl plan: %d search(es)", len(search_targets))

        for target in search_targets:
            url = target["url"]
            search_id = target.get("search_id")

            logger.info(f"Scraping search target: {url}")

            # Clean up temp file before scraping this target
            if os.path.exists(temp_output_file):
                try:
                    os.remove(temp_output_file)
                except OSError:
                    pass

            try:
                # Scrape listings to temp JSON file
                scrape_listings(
                    [url],
                    temp_output_file,
                    max_listings=args.max_listings,
                    pages=target.get("pages"),
                )

                # Import scraped items into SQLite
                if os.path.exists(temp_output_file):
                    with open(temp_output_file, "r", encoding="utf-8") as f:
                        scraped_items = json.load(f)

                    logger.info(
                        f"Importing {len(scraped_items)} listings into database..."
                    )

                    for item in scraped_items:
                        listing_id = item.get("id")
                        if not listing_id:
                            continue

                        now_iso = datetime.datetime.now(
                            datetime.timezone.utc
                        ).isoformat()
                        source = item.get("source") or "kleinanzeigen"
                        source_id = item.get("source_id") or listing_id
                        price_eur = item.get("price_eur")
                        last_seen_at = item.get("last_seen_at") or now_iso

                        # Upsert: new rows are created with all canonical fields;
                        # known rows ONLY have last_seen_at updated without
                        # overwriting title, price, or other existing attributes.
                        cursor.execute(
                            """
                            INSERT INTO listings (
                                id, source, source_id, title, price, price_eur,
                                location, url, short_description, detailed_description,
                                search_id, last_seen_at, postal_code
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                                last_seen_at = excluded.last_seen_at,
                                delisted_at = NULL
                        """,
                            (
                                listing_id,
                                source,
                                source_id,
                                item.get("title", ""),
                                item.get("price", ""),
                                price_eur,
                                item.get("location", ""),
                                item.get("url", ""),
                                item.get("short_description", ""),
                                item.get("detailed_description", ""),
                                search_id,
                                last_seen_at,
                                item.get("postal_code"),
                            ),
                        )
                        if search_id is not None:
                            cursor.execute(
                                """
                                INSERT OR IGNORE INTO listing_search_hits (
                                    listing_id, search_id, first_seen_at
                                ) VALUES (?, ?, ?)
                            """,
                                (
                                    listing_id,
                                    search_id,
                                    now_iso,
                                ),
                            )
                    if search_id is not None:
                        now_scraped = datetime.datetime.now(
                            datetime.timezone.utc
                        ).isoformat()
                        cursor.execute(
                            "UPDATE searches SET last_scraped_at = ? WHERE id = ?",
                            (now_scraped, search_id),
                        )
                    conn.commit()

            except rate_limiter.SiteBlocked as blocked:
                # Every further request would only lengthen the block.
                logger.error("%s", blocked)
                update_progress("discovery", 0, 0, str(blocked))
                break
            except ScrapeRefused as refusal:
                # Not the same as a search with no results, and it must not
                # look like one. A rate-limited run used to finish quietly with
                # nothing in it, so the buyer saw an empty search and believed
                # it.
                refused_urls.append(url)
                logger.error("Kleinanzeigen refused %s: %s", url, refusal)
                update_progress(
                    "discovery",
                    0,
                    0,
                    "Kleinanzeigen hat die Anfragen abgewiesen. "
                    "Nichts geladen -- spaeter erneut versuchen.",
                )
            except Exception as e:
                logger.error(f"Error scraping or importing URL {url}: {str(e)}")

        # 1.5. Sequential detailed description harvesting phase
        logger.info("Executing optimized sequential detailed description harvesting...")
        try:
            harvest_descriptions(args.campaign_id)
            logger.info("Description harvesting completed successfully.")
        except Exception as e:
            logger.error(f"Error during detailed description harvesting: {str(e)}")

        # 1.6. Detours for anything collected along a route.
        #
        # After the scrape, never during it. A listing's detour is worth having
        # but is never worth losing a listing over, so a routing service that is
        # slow or down must not be able to reach the fetching loop. Failures here
        # leave listings in place without a detour; the next run picks them up.
        annotate_route_detours(conn, args.campaign_id)

    # 2. Processing: every listing resolved into the graph and its facts read
    # once; each hunt's listings re-read with its targets, and those still
    # above the searched model asked about once. Verdicts are computed on
    # read (backend/db/verdict.js), so nothing here judges.
    if args.mode in ["process", "both"]:
        from graph import cli as graph_cli
        from graph import hunts as graph_hunts
        from graph import llm as graph_llm

        logger.info("Graph: %s", graph_cli.process_listings(conn))
        campaign_ids = [
            r[0]
            for r in conn.execute(
                "SELECT DISTINCT campaign_id FROM hunt_targets"
                + (" WHERE campaign_id = ?" if args.campaign_id is not None else ""),
                (args.campaign_id,) if args.campaign_id is not None else (),
            ).fetchall()
        ]
        for campaign_id in campaign_ids:
            try:
                logger.info(
                    "Hunt %s: %s", campaign_id, graph_hunts.refine(conn, campaign_id)
                )
            except graph_llm.NoModel as error:
                logger.warning("Hunt %s not refined: %s", campaign_id, error)

    if refused_urls:
        logger.error(
            "%d of the run's targets were refused outright: %s",
            len(refused_urls),
            ", ".join(refused_urls),
        )

    # Cleanup temp file
    if os.path.exists(temp_output_file):
        try:
            os.remove(temp_output_file)
        except OSError:
            pass

    logger.info("All operations completed.")


if __name__ == "__main__":
    main()
