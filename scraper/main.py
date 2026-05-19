import os
import json
import sqlite3
import logging
import argparse
from scraper import scrape_listings, preview_url_listings_count, harvest_descriptions

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

# File handler
file_handler = logging.FileHandler(log_file, encoding="utf-8")
file_handler.setFormatter(formatter)
root_logger.addHandler(file_handler)

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "scraper.db",
)


def get_db_connection():
    return sqlite3.connect(DB_PATH)


def main():
    """Main entry point that acts as a wrapper for different functionalities"""
    parser = argparse.ArgumentParser(
        description="Multi-Domain Expert scraper and processor"
    )
    parser.add_argument(
        "--mode",
        choices=["scrape", "process", "both", "preview"],
        default="both",
        help="Operation mode: scrape, process, both, or preview",
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

    args = parser.parse_args()

    if args.mode == "preview":
        if not args.urls or len(args.urls) == 0:
            print("__PREVIEW_ERROR__:No target URL provided")
            return
        preview_url_listings_count(args.urls[0])
        return

    # Define paths for data
    data_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"
    )
    temp_output_file = os.path.join(data_dir, "temp_scraped.json")

    # Create data directory if it doesn't exist
    os.makedirs(data_dir, exist_ok=True)

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
                search_targets.append({"url": url, "profile_id": None})
        else:
            try:
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

                        # Insert or ignore to prevent duplicates
                        cursor.execute(
                            """
                            INSERT OR IGNORE INTO listings (
                                id, title, price, location, url, short_description, detailed_description, search_id
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                            (
                                listing_id,
                                item.get("title", ""),
                                item.get("price", ""),
                                item.get("location", ""),
                                item.get("url", ""),
                                item.get("short_description", ""),
                                item.get("detailed_description", ""),
                                search_id,
                            ),
                        )
                    conn.commit()
            except Exception as e:
                logger.error(f"Error scraping or importing URL {url}: {str(e)}")

        # 1.5. Sequential detailed description harvesting phase
        logger.info("Executing optimized sequential detailed description harvesting...")
        try:
            harvest_descriptions()
            logger.info("Description harvesting completed successfully.")
        except Exception as e:
            logger.error(f"Error during detailed description harvesting: {str(e)}")

    # 2. Processing Mode
    if args.mode in ["process", "both"]:
        logger.info("Starting processing mode via agent_worker...")
        conn.close()  # Close connection to prevent sqlite locks during process spawn

        # Run agent_worker process command
        import subprocess

        try:
            worker_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "agent_worker.py"
            )
            cmd = ["python3", worker_path, "process"]
            if args.listing_id:
                cmd.append(args.listing_id)
            subprocess.run(cmd, check=True)
            logger.info("Successfully executed agent_worker processing.")
        except subprocess.CalledProcessError as e:
            logger.error(f"Error running agent_worker process: {str(e)}")

    # Cleanup temp file
    if os.path.exists(temp_output_file):
        try:
            os.remove(temp_output_file)
        except OSError:
            pass

    logger.info("All operations completed.")


if __name__ == "__main__":
    main()
