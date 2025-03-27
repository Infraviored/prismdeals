import os
import json
import time
import logging
import threading
import datetime
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

# Set up logging
logger = logging.getLogger(__name__)

# Global variables
housekeeping_in_progress = False
scheduled_housekeeping_thread = None
stop_scheduled_thread = False

def check_listing_availability(url):
    """Check if a listing is still available or has been deleted using Selenium."""
    try:
        # Initialize Chrome in headless mode
        options = webdriver.ChromeOptions()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.page_load_strategy = 'eager'  # Don't wait for all resources, just the DOM
        
        # Create the driver
        driver = webdriver.Chrome(options=options)
        driver.set_page_load_timeout(15)  # Set a timeout to avoid hanging
        
        try:
            # Navigate to the URL
            logger.info(f"Checking listing availability: {url}")
            driver.get(url)
            
            # Parse with BeautifulSoup for easier handling
            soup = BeautifulSoup(driver.page_source, "html.parser")
            
            # Simple check: If 'is-hidden' is NOT in the class attribute of the veil, it's deleted
            # This is the most reliable indicator based on the HTML examples
            deleted_veil = soup.select_one('.pvap-reserved-image-veil.imagebox-veil:not(.is-hidden)')
            
            # If the deletion indicator is found
            is_deleted = bool(deleted_veil)
            
            logger.info(f"Checked listing {url}: {'Deleted' if is_deleted else 'Available'}")
            
            return is_deleted
            
        finally:
            # Always close the driver
            driver.quit()
            
    except Exception as e:
        logger.error(f"Error checking listing availability: {str(e)}")
        return None

def run_housekeeping(data_dir, check_deleted=True):
    """Run housekeeping tasks to check for deleted listings."""
    global housekeeping_in_progress
    
    if housekeeping_in_progress:
        logger.warning("Housekeeping is already in progress")
        return False
    
    housekeeping_in_progress = True
    logger.info("Starting housekeeping...")
    
    # Create necessary directories
    listings_dir = os.path.join(data_dir, "listings")
    os.makedirs(listings_dir, exist_ok=True)
    
    try:
        # Load search configuration
        search_config_file = os.path.join(data_dir, "search_config.json")
        search_config = []
        
        if os.path.exists(search_config_file):
            with open(search_config_file, 'r') as f:
                search_config = json.load(f)
        
        # Load all listings from all search configurations
        all_listings = []
        
        for search in search_config:
            search_id = search.get('id')
            if not search_id:
                continue
                
            listings_file = os.path.join(listings_dir, f"listings_{search_id}.json")
            if os.path.exists(listings_file):
                try:
                    with open(listings_file, 'r') as f:
                        listings = json.load(f)
                        
                    # Add search ID to each listing if not already present
                    for listing in listings:
                        if 'search_id' not in listing:
                            listing['search_id'] = search_id
                        
                    all_listings.extend(listings)
                except (json.JSONDecodeError, FileNotFoundError) as e:
                    logger.error(f"Error loading listings file {listings_file}: {str(e)}")
        
        # Calculate listings to check (skip already deleted ones)
        listings_to_check = [listing for listing in all_listings 
                            if 'url' in listing and listing['url'] and 
                            not listing.get('is_deleted', False)]
        
        logger.info(f"Checking availability for {len(listings_to_check)} listings "
                   f"(skipping {len(all_listings) - len(listings_to_check)} already deleted listings)")
        
        # Check availability for each listing
        if check_deleted:
            updated_count = 0
            
            for i, listing in enumerate(listings_to_check):
                logger.info(f"Checking listing {i+1}/{len(listings_to_check)}: {listing.get('title', 'Unknown')}")
                
                # Check if listing is deleted
                is_deleted = check_listing_availability(listing['url'])
                
                # If we got a valid result and the listing is now deleted
                if is_deleted is True:
                    # Record both deleted status and deletion timestamp
                    listing['is_deleted'] = True
                    listing['deleted_at'] = time.time()
                    listing['last_checked'] = time.time()
                    updated_count += 1
                    
                    # Save the updated listing
                    if 'search_id' in listing:
                        search_id = listing['search_id']
                        listings_file = os.path.join(listings_dir, f"listings_{search_id}.json")
                        
                        if os.path.exists(listings_file):
                            try:
                                with open(listings_file, 'r') as f:
                                    file_listings = json.load(f)
                                    
                                # Find and update the listing
                                for i, file_listing in enumerate(file_listings):
                                    if file_listing.get('id') == listing.get('id'):
                                        file_listings[i] = listing
                                        break
                                
                                # Save the updated file
                                with open(listings_file, 'w') as f:
                                    json.dump(file_listings, f, indent=2, ensure_ascii=False)
                                    
                                logger.info(f"Updated listing {listing.get('id')}: is_deleted=True, deleted_at={listing['deleted_at']}")
                            except Exception as e:
                                logger.error(f"Error updating listing file: {str(e)}")
                # If the listing is still available, update last_checked time
                elif is_deleted is False:
                    listing['last_checked'] = time.time()
                    
                    # Save the updated listing
                    if 'search_id' in listing:
                        search_id = listing['search_id']
                        listings_file = os.path.join(listings_dir, f"listings_{search_id}.json")
                        
                        if os.path.exists(listings_file):
                            try:
                                with open(listings_file, 'r') as f:
                                    file_listings = json.load(f)
                                    
                                # Find and update the listing
                                for i, file_listing in enumerate(file_listings):
                                    if file_listing.get('id') == listing.get('id'):
                                        file_listings[i] = listing
                                        break
                                
                                # Save the updated file
                                with open(listings_file, 'w') as f:
                                    json.dump(file_listings, f, indent=2, ensure_ascii=False)
                            except Exception as e:
                                logger.error(f"Error updating listing file: {str(e)}")
                
                # Add a small delay between requests to avoid rate limiting
                time.sleep(1)
            
            logger.info(f"Housekeeping completed. Updated {updated_count} listings.")
            
            # Update the housekeeping settings with the last run time
            housekeeping_settings_file = os.path.join(data_dir, "housekeeping_settings.json")
            try:
                settings = {}
                if os.path.exists(housekeeping_settings_file):
                    with open(housekeeping_settings_file, 'r') as f:
                        settings = json.load(f)
                
                settings['last_run'] = time.time()
                
                with open(housekeeping_settings_file, 'w') as f:
                    json.dump(settings, f, indent=2)
            except Exception as e:
                logger.error(f"Error updating housekeeping settings: {str(e)}")
            
            return updated_count
        
    except Exception as e:
        logger.error(f"Error in housekeeping worker: {str(e)}")
        return False
    finally:
        housekeeping_in_progress = False
        return True

def get_housekeeping_settings(data_dir):
    """Get housekeeping settings from the file."""
    settings_file = os.path.join(data_dir, "housekeeping_settings.json")
    
    if not os.path.exists(settings_file):
        # Default settings
        settings = {
            "enabled": True,
            "hour": 3,  # Run at 3 AM by default
            "minute": 0,
            "check_deleted": True,
            "show_deleted": True,
            "last_run": None
        }
        
        save_housekeeping_settings(data_dir, settings)
    else:
        with open(settings_file, 'r') as f:
            settings = json.load(f)
    
    return settings

def save_housekeeping_settings(data_dir, settings):
    """Save housekeeping settings to the file."""
    settings_file = os.path.join(data_dir, "housekeeping_settings.json")
    with open(settings_file, 'w') as f:
        json.dump(settings, f, indent=2)

def start_housekeeping_thread(data_dir, check_deleted=True):
    """Start a background thread to run housekeeping tasks."""
    def worker():
        run_housekeeping(data_dir, check_deleted)
    
    thread = threading.Thread(target=worker)
    thread.daemon = True
    thread.start()
    
    return thread.ident

def is_housekeeping_in_progress():
    """Check if housekeeping is currently running."""
    return housekeeping_in_progress

def calculate_next_run_time(hour, minute):
    """Calculate the next run time based on the hour and minute settings."""
    now = datetime.datetime.now()
    target_time = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    
    # If the target time is already past for today, schedule for tomorrow
    if target_time <= now:
        target_time += datetime.timedelta(days=1)
    
    # Return the number of seconds until the target time
    return (target_time - now).total_seconds()

def scheduled_housekeeping_thread_func(data_dir):
    """Function for scheduled housekeeping thread."""
    global stop_scheduled_thread
    
    while not stop_scheduled_thread:
        try:
            # Get the housekeeping settings
            settings = get_housekeeping_settings(data_dir)
            
            # Check if scheduled housekeeping is enabled
            if not settings.get('enabled', True):
                logger.info("Scheduled housekeeping is disabled")
                # Sleep for an hour before checking settings again
                time.sleep(3600)
                continue
            
            # Get the scheduled hour and minute
            hour = settings.get('hour', 3)
            minute = settings.get('minute', 0)
            
            # Calculate the time until the next scheduled run
            seconds_until_next_run = calculate_next_run_time(hour, minute)
            next_run_time = datetime.datetime.now() + datetime.timedelta(seconds=seconds_until_next_run)
            
            logger.info(f"Next scheduled housekeeping will run at {next_run_time.strftime('%Y-%m-%d %H:%M:%S')} (in {seconds_until_next_run/3600:.2f} hours)")
            
            # Sleep until the next scheduled run time, checking periodically if we should stop
            for _ in range(int(seconds_until_next_run)):
                if stop_scheduled_thread:
                    break
                time.sleep(1)
                
            # Run housekeeping if not stopped
            if not stop_scheduled_thread:
                logger.info(f"Running scheduled housekeeping at {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
                run_housekeeping(data_dir, settings.get('check_deleted', True))
        except Exception as e:
            logger.error(f"Error in scheduled housekeeping thread: {str(e)}")
            # Sleep for 5 minutes before retrying
            time.sleep(300)

def setup_scheduled_housekeeping(data_dir):
    """Set up scheduled housekeeping based on settings."""
    global scheduled_housekeeping_thread, stop_scheduled_thread
    
    # Stop existing thread if running
    if scheduled_housekeeping_thread and scheduled_housekeeping_thread.is_alive():
        stop_scheduled_thread = True
        scheduled_housekeeping_thread.join(timeout=5)
        stop_scheduled_thread = False
    
    # Check if housekeeping is enabled
    settings = get_housekeeping_settings(data_dir)
    if not settings.get('enabled', True):
        logger.info("Scheduled housekeeping is disabled")
        return
    
    # Start new thread
    scheduled_housekeeping_thread = threading.Thread(
        target=scheduled_housekeeping_thread_func,
        args=(data_dir,)
    )
    scheduled_housekeeping_thread.daemon = True
    scheduled_housekeeping_thread.start()
    
    logger.info("Scheduled housekeeping thread started")
    
    # Return the thread ID
    return scheduled_housekeeping_thread.ident 