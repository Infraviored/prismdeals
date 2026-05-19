import os
import json
import sqlite3
import logging
import argparse
from scraper import scrape_listings

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
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
        choices=["scrape", "process", "both"],
        default="both",
        help="Operation mode: scrape, process, or both",
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

    args = parser.parse_args()

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
                cursor.execute("SELECT url, profile_id FROM searches WHERE enabled = 1")
                rows = cursor.fetchall()
                for r in rows:
                    search_targets.append(
                        {"url": r["url"], "profile_id": r["profile_id"]}
                    )
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
            profile_id = target["profile_id"]

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
                    process_immediately=False,
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
                                id, title, price, location, url, short_description, detailed_description, profile_id
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
                                profile_id,
                            ),
                        )
                    conn.commit()
            except Exception as e:
                logger.error(f"Error scraping or importing URL {url}: {str(e)}")

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
            subprocess.run(["python3", worker_path, "process"], check=True)
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
