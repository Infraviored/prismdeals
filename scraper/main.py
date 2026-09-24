import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import datetime
import db_schema
import json
import sqlite3
import logging
from logging.handlers import RotatingFileHandler
import argparse
from scraper import (
    ScrapeRefused,
    scrape_listings,
    preview_url_listings_count,
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


def run_route_mode(args):
    """Plans a route corridor, or computes detours for one already planned.

    Creation and annotation are separate commands because they belong to
    different moments: a corridor is planned once, when a buyer says where they
    are driving, and its circles are then scraped like any other search. Detours
    are computed afterwards, so the routing service never sits in the scraper's
    path — if it is unreachable, listings still arrive, only without a detour.
    """
    import route_pipeline

    if args.mode == "route-preview":
        if not args.origin or not args.destination:
            logger.error("route-preview needs --from and --to")
            return
        if not args.urls:
            logger.error("route-preview needs --urls with one search URL")
            return

        try:
            plan = route_pipeline.plan_corridor(
                args.urls[0],
                args.origin,
                args.destination,
                radius_km=args.radius_km,
                half_width_km=args.corridor_km,
            )
        except ValueError as error:
            print(f"__ROUTE_PREVIEW_ERROR__:{error}")
            return

        payload = plan.as_dict()
        # The polyline is thousands of points and a map does not need them all;
        # what the caller is drawing is the shape, not the kerb.
        payload["polyline"] = _thin(payload["polyline"], 400)
        print("__ROUTE_PREVIEW__:" + json.dumps(payload))
        return

    conn = get_db_connection()

    if args.mode == "route-replan":
        if not args.route_id:
            logger.error("route-replan needs --route-id")
            return
        try:
            kept, added, removed, plan = route_pipeline.replan(
                conn,
                args.route_id,
                radius_km=args.radius_km,
                half_width_km=args.corridor_km,
            )
        except ValueError as error:
            print(f"__ROUTE_REPLAN_ERROR__:{error}")
            return
        print(f"__ROUTE_REPLANNED__:{kept} kept, {added} added, {removed} removed")
        for index, circle in enumerate(plan.circles, 1):
            print(f"  {index}. r{circle.radius_km:<3} {circle.label}")
        return

    if args.mode == "route-create":
        if not args.origin or not args.destination:
            logger.error("route-create needs --from and --to")
            return
        if not args.urls:
            logger.error(
                "route-create needs --urls with one search URL to re-aim along "
                "the route, e.g. a Kleinanzeigen search ending in k0l...r..."
            )
            return

        route_id, plan = route_pipeline.create(
            conn,
            base_url=args.urls[0],
            origin=args.origin,
            destination=args.destination,
            radius_km=args.radius_km,
            half_width_km=args.corridor_km,
            name=args.route_name,
            campaign_id=args.campaign_id,
            knowledge_set_id=args.knowledge_set_id,
        )
        print(f"__ROUTE_ID__:{route_id}")
        for index, circle in enumerate(plan.circles, 1):
            print(f"  {index}. r{circle.radius_km:<3} {circle.label}")
            print(f"     {circle.url}")
        if plan.unresolved:
            logger.warning(
                "No location id for these postal codes, so their circles were "
                "skipped: %s",
                ", ".join(plan.unresolved),
            )
        return

    if not args.route_id:
        logger.error("route-annotate needs --route-id")
        return

    summary = route_pipeline.annotate(conn, args.route_id)
    print(
        f"__ROUTE_ANNOTATED__:{summary['routed']}/{summary['considered']} "
        f"(too far: {summary['too_far']}, unplaceable: {summary['unplaceable']})"
    )


def run_family_mode(args):
    """Handles search family preview, creation, updates, and deletion."""
    import family_store

    conn = get_db_connection()

    if args.mode == "family-preview":
        if not args.urls:
            print("__FAMILY_PREVIEW_ERROR__:Missing base URL")
            return
        base_url = args.urls[0]
        terms = []
        if args.payload_json:
            try:
                payload = json.loads(args.payload_json)
                terms = payload.get("terms", [])
            except Exception as e:
                print(f"__FAMILY_PREVIEW_ERROR__:Invalid payload: {e}")
                return

        try:
            preview = family_store.preview_family(
                conn,
                base_url,
                terms,
                route_search_id=args.route_id,
                campaign_id=args.campaign_id,
                knowledge_set_id=args.knowledge_set_id,
            )
            print("__FAMILY_PREVIEW__:" + json.dumps(preview))
        except Exception as e:
            print(f"__FAMILY_PREVIEW_ERROR__:{e}")
        return

    if args.mode == "family-create":
        if not args.payload_json:
            print("__FAMILY_CREATE_ERROR__:Missing payload")
            return
        try:
            payload = json.loads(args.payload_json)
            name = payload.get("name")
            base_url = payload.get("base_url")
            terms = payload.get("terms", [])
            campaign_id = payload.get("campaign_id")
            knowledge_set_id = payload.get("knowledge_set_id")
            route_search_id = payload.get("route_search_id")
            fid, count, conflicts = family_store.save_family(
                conn,
                name=name,
                base_url=base_url,
                terms=terms,
                campaign_id=campaign_id,
                knowledge_set_id=knowledge_set_id,
                route_search_id=route_search_id,
            )
            print(
                "__FAMILY_CREATED__:"
                + json.dumps(
                    {
                        "id": fid,
                        "searches": count,
                        "conflicts": conflicts,
                    }
                )
            )
        except Exception as e:
            print(f"__FAMILY_CREATE_ERROR__:{e}")
        return

    if args.mode == "family-update":
        if not args.family_id or not args.payload_json:
            print("__FAMILY_UPDATE_ERROR__:Missing family id or payload")
            return
        try:
            payload = json.loads(args.payload_json)
            res = family_store.update_family(
                conn,
                args.family_id,
                name=payload.get("name"),
                enabled=payload.get("enabled"),
                terms=payload.get("terms"),
                base_url=payload.get("base_url"),
            )
            print("__FAMILY_UPDATED__:" + json.dumps(res))
        except Exception as e:
            print(f"__FAMILY_UPDATE_ERROR__:{e}")
        return

    if args.mode == "family-delete":
        if not args.family_id:
            print("__FAMILY_DELETE_ERROR__:Missing family id")
            return
        try:
            family_store.delete_family(conn, args.family_id)
            print("__FAMILY_DELETED__:" + json.dumps({"success": True}))
        except Exception as e:
            print(f"__FAMILY_DELETE_ERROR__:{e}")
        return


def _thin(points, limit):
    """Every nth point, keeping both ends. A map draws the shape, not the kerb."""
    if len(points) <= limit:
        return points
    step = len(points) / float(limit)
    thinned = [points[int(index * step)] for index in range(limit)]
    if thinned[-1] != points[-1]:
        thinned.append(points[-1])
    return thinned


def run_probe_mode(args):
    """Executes search probing: builds search ladders, measures gain/overlap, snowballs."""
    import probe

    conn = get_db_connection()
    payload = {}
    if args.payload_json:
        try:
            payload = json.loads(args.payload_json)
        except Exception as exc:
            print(f"__PROBE_ERROR__:Invalid payload_json: {exc}", flush=True)
            return
    elif not sys.stdin.isatty():
        try:
            payload = json.load(sys.stdin)
        except Exception as exc:
            print(f"__PROBE_ERROR__:Invalid stdin JSON: {exc}", flush=True)
            return

    def on_rung(rung):
        print("__PROBE_RUNG__:" + json.dumps(rung), flush=True)

    try:
        result = probe.run_probe(payload, conn=conn, on_rung=on_rung)
        print("__PROBE_RESULT__:" + json.dumps(result), flush=True)
    except Exception as exc:
        logger.exception("Probe execution failed: %s", exc)
        print(f"__PROBE_ERROR__:{exc}", flush=True)


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
            "preview",
            "update-all",
            "route-preview",
            "route-replan",
            "route-create",
            "route-annotate",
            "family-preview",
            "family-create",
            "family-update",
            "family-delete",
            "probe",
        ],
        default="both",
        help=(
            "Operation mode: scrape, process, both, preview, update-all, "
            "route-preview, route-replan, route-create, route-annotate, "
            "family-preview, family-create, family-update, family-delete, or probe"
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
        "--listing-id",
        type=str,
        default=None,
        help="Specific listing ID to process",
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
        "Search along a route instead of around a point. A corridor is covered "
        "by the fewest circles that reach its edges, each registered as an "
        "ordinary search; detours are computed afterwards with route-annotate.",
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
    route.add_argument(
        "--knowledge-set-id",
        type=int,
        default=None,
        help="Knowledge set the corridor's searches are scored against",
    )
    route.add_argument(
        "--route-id",
        type=int,
        default=None,
        help="Route search to annotate with detours",
    )
    route.add_argument(
        "--route-name",
        default=None,
        help="Label for this route search",
    )

    # --- search families ------------------------------------------------
    family = parser.add_argument_group(
        "search families",
        "Manage search families: multi-model search expansion, shared search row ownership, "
        "and preview calculation.",
    )
    family.add_argument(
        "--family-id",
        type=int,
        default=None,
        help="Search family ID for update or delete operations",
    )
    family.add_argument(
        "--payload-json",
        default=None,
        help="JSON payload for family operations (terms, configuration)",
    )

    args = parser.parse_args()

    if args.mode in (
        "route-preview",
        "route-replan",
        "route-create",
        "route-annotate",
    ):
        run_route_mode(args)
        return

    if args.mode in (
        "family-preview",
        "family-create",
        "family-update",
        "family-delete",
    ):
        run_family_mode(args)
        return

    if args.mode == "probe":
        run_probe_mode(args)
        return

    if args.mode == "preview":
        if not args.urls or len(args.urls) == 0:
            print("__PREVIEW_ERROR__:No target URL provided")
            return
        preview_url_listings_count(args.urls[0])
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
            try:
                if args.campaign_id is not None:
                    cursor.execute(
                        "SELECT id, url FROM searches WHERE enabled = 1 AND campaign_id = ?",
                        (args.campaign_id,),
                    )
                else:
                    cursor.execute("SELECT id, url FROM searches WHERE enabled = 1")
                rows = cursor.fetchall()
                for r in rows:
                    search_targets.append({"url": r["url"], "search_id": r["id"]})
                logger.info(
                    f"Loaded {len(search_targets)} active search URLs from SQLite"
                )
            except Exception as e:
                logger.error(f"Error querying search URLs from DB: {str(e)}")

        # Fallback to default if absolutely no searches exist
        if not search_targets:
            default_url = (
                "https://www.kleinanzeigen.de/s-notebooks/preis::1400/rtx4060/k0c278"
            )
            search_targets.append({"url": default_url, "profile_id": None})
            logger.info(f"Using default search URL: {default_url}")

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
                                search_id, last_seen_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    # 2. Processing Mode
    if args.mode in ["process", "both"]:
        # Playbook-backed categories run through the decoupled pipeline first:
        # it extracts one fact sheet per listing and scores every buyer against
        # it without further model calls. Listings it handles are marked
        # processed, so the legacy worker below only picks up the remainder.
        try:
            import pipeline

            outcomes = pipeline.run(conn, pipeline.default_model_caller())
            stats = pipeline.summarise(outcomes)
            if stats["processed"]:
                logger.info(
                    "Pipeline: %d listing(s) processed, %d model call(s), "
                    "%d served from fact-sheet cache, %d identity/identities resolved.",
                    stats["processed"],
                    stats["model_calls"],
                    stats["from_cache"],
                    stats["identities_resolved"],
                )
            elif stats["listings"]:
                # Processing nothing while listings are waiting is the state this
                # pipeline sat in since it was written: 1266 listings stored, 10
                # ever scored. It was invisible because nothing said so. The
                # dominant skip reason is the whole diagnosis, so it is named.
                worst = max(
                    stats["skip_reasons"].items(),
                    key=lambda kv: kv[1],
                    default=("unknown", 0),
                )
                logger.warning(
                    "Pipeline processed NONE of %d reachable listing(s). "
                    "Most common reason: %s (%d). Scoring is not running.",
                    stats["listings"],
                    worst[0],
                    worst[1],
                )
            else:
                logger.warning(
                    "Pipeline found no listings at all: every search is disabled, "
                    "or no listing belongs to one."
                )
            for reason, count in stats["skip_reasons"].items():
                logger.info(
                    "Pipeline left %d listing(s) to the legacy worker (%s).",
                    count,
                    reason,
                )
        except Exception as e:
            logger.error(f"Playbook pipeline failed, falling back entirely: {str(e)}")

        logger.info("Starting processing mode via agent_worker...")
        conn.close()  # Close connection to prevent sqlite locks during process spawn

        # Run agent_worker process command
        import subprocess

        try:
            worker_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "agent_worker.py"
            )
            # sys.executable, not a bare "python3": the worker's dependencies
            # (openai, ...) live in this project's venv, and a bare name resolves
            # against PATH, which lands on the system interpreter instead.
            cmd = [sys.executable, worker_path, "process"]
            if args.listing_id:
                cmd.append(args.listing_id)
            if args.campaign_id is not None:
                cmd.extend(["--campaign-id", str(args.campaign_id)])
            subprocess.run(cmd, check=True)
            logger.info("Successfully executed agent_worker processing.")
        except subprocess.CalledProcessError as e:
            logger.error(f"Error running agent_worker process: {str(e)}")

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
