import os
import json
import time
import pickle
import logging
import re
import random
import string
import shutil
import glob
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from bs4 import BeautifulSoup
from config import DELAY_BETWEEN_PAGES, DELAY_BETWEEN_LISTINGS, PAGES_TO_SCRAPE

# Set up logging
logger = logging.getLogger(__name__)

def save_cookies(driver, path):
    """Save browser cookies to a file"""
    if not os.path.exists(os.path.dirname(path)):
        os.makedirs(os.path.dirname(path))
    with open(path, 'wb') as file:
        pickle.dump(driver.get_cookies(), file)
    logger.info(f"Cookies saved to {path}")

def load_cookies(driver, path):
    """Load cookies from file into browser session"""
    if not os.path.exists(path):
        logger.warning(f"Cookie file not found: {path}")
        return False
    
    with open(path, 'rb') as file:
        cookies = pickle.load(file)
        for cookie in cookies:
            # Some cookies might cause issues, so we handle exceptions
            try:
                driver.add_cookie(cookie)
            except Exception as e:
                logger.warning(f"Error loading cookie: {str(e)}")
    
    logger.info("Cookies loaded successfully")
    return True

def check_login_status(driver):
    """Check if the user is logged in"""
    # Navigate to the homepage
    driver.get("https://www.kleinanzeigen.de/")
    
    # Wait for the page to load
    time.sleep(2)
    
    # Look for elements that indicate a logged-in state
    try:
        # Check for user email or logout link which indicates logged-in state
        logged_in_indicators = driver.find_elements(By.CSS_SELECTOR, "#user-email, #user-logout")
        return len(logged_in_indicators) > 0
    except:
        return False

def manual_login(driver, cookies_path):
    """Handle login process with cookie persistence"""
    # First try to load cookies
    if os.path.exists(cookies_path):
        # Load the site first (cookies need a matching domain)
        driver.get("https://www.kleinanzeigen.de/")
        load_cookies(driver, cookies_path)
        driver.refresh()  # Refresh to apply cookies
        
        # Check if we're logged in
        if check_login_status(driver):
            logger.info("Successfully logged in using saved cookies")
            return
    
    # If we get here, we need manual login
    driver.get("https://www.kleinanzeigen.de/")
    input("Please log in manually and then press Enter to continue...")
    
    # Save the cookies for next time
    save_cookies(driver, cookies_path)
    logger.info("Manual login completed and cookies saved")

def get_detailed_description(driver, url):
    """Get detailed description from a listing's detail page"""
    try:
        # Store current URL to return to later
        current_url = driver.current_url
        
        # Navigate to the listing detail page
        logger.info(f"Getting detailed description from: {url}")
        driver.get(url)
        
        # Wait for the description to load
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "viewad-description"))
            )
        except TimeoutException:
            logger.warning(f"Timeout waiting for detailed description to load: {url}")
            driver.get(current_url)  # Go back to the search results
            return ""
        
        # Parse the page with BeautifulSoup
        soup = BeautifulSoup(driver.page_source, "html.parser")
        
        # Extract detailed description
        detailed_description = ""
        desc_elem = soup.select_one("#viewad-description-text")
        if desc_elem:
            detailed_description = desc_elem.get_text(separator='\n', strip=False)
        
        # Go back to the search results
        driver.get(current_url)
        
        return detailed_description
        
    except Exception as e:
        logger.error(f"Error getting detailed description: {str(e)}")
        # Try to go back to the search results
        try:
            driver.get(current_url)
        except:
            pass
        return ""

def scrape_page(driver, url, output_file=None, max_listings=None, process_immediately=False):
    """Scrape a page and get detailed descriptions without LLM processing"""
    # Import here to avoid circular imports
    if process_immediately:
        from process_listings import process_listing
    
    # Open the target URL and wait for the content to load
    logger.info(f"Scraping page: {url}")
    driver.get(url)
    
    # Wait for the main content to load
    try:
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "srchrslt-adtable"))
        )
    except TimeoutException:
        logger.error("Timeout waiting for page to load")
        return []
    
    # Parse the page with BeautifulSoup
    soup = BeautifulSoup(driver.page_source, "html.parser")
    
    # Load existing listings to check for duplicates
    existing_listings = []
    existing_ids = set()
    if output_file and os.path.exists(output_file):
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                existing_listings = json.load(f)
                existing_ids = {item.get('id', '') for item in existing_listings}
                logger.info(f"Loaded {len(existing_ids)} existing listing IDs to check for duplicates")
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"Error loading existing listings: {str(e)}")
            existing_listings = []
            existing_ids = set()
    
    # Loop through each listing in the search results
    scraped_listings = []
    listing_count = 0
    
    for item in soup.select("ul#srchrslt-adtable li.ad-listitem"):
        # Check if we've reached the maximum number of listings to process
        if max_listings is not None and listing_count >= max_listings:
            logger.info(f"Reached maximum number of listings to scrape: {max_listings}")
            break
            
        try:
            # Extract listing ID from data attributes first to check for duplicates
            listing_id = ""
            article_elem = item.select_one("article.aditem")
            if article_elem and article_elem.has_attr('data-adid'):
                listing_id = article_elem['data-adid']
            
            # Skip if this listing ID already exists in our data
            if listing_id in existing_ids:
                logger.info(f"Skipping already scraped listing ID: {listing_id}")
                continue
            
            # Extract basic listing information
            title_elem = item.select_one("h2 a")
            title = title_elem.get_text(strip=True) if title_elem else ""
            
            # Extract the listing URL for detailed view
            listing_url = ""
            if title_elem and title_elem.has_attr('href'):
                listing_url = "https://www.kleinanzeigen.de" + title_elem['href']
            
            price_elem = item.select_one("p.aditem-main--middle--price-shipping--price")
            price = price_elem.get_text(strip=True) if price_elem else ""
            
            desc_elem = item.select_one("p.aditem-main--middle--description")
            short_description = desc_elem.get_text(strip=True) if desc_elem else ""
            
            location_elem = item.select_one(".aditem-main--top--left")
            location = location_elem.get_text(strip=True) if location_elem else ""
            
            # Create listing object with basic info
            listing = {
                "id": listing_id,
                "title": title,
                "price": price,
                "short_description": short_description,
                "location": location,
                "url": listing_url,
                "detailed_description": "",
                "llm_processed": False
            }
            
            # If we have a valid URL, get detailed information
            if listing_url:
                # Get detailed description
                detailed_description = get_detailed_description(driver, listing_url)
                listing["detailed_description"] = detailed_description
                
                # Process the listing immediately if requested
                if process_immediately and detailed_description:
                    logger.info(f"Processing listing immediately: {title}")
                    separator_line = "-" * 70
                    logger.info(f"{separator_line}")
                    logger.info(f"Processing {title}")
                    logger.info(f"{separator_line}")
                    
                    chatgpt_results = process_listing(title, detailed_description)
                    listing.update(chatgpt_results)
                
                # Save after each detailed fetch if output_file is provided
                if output_file:
                    # Add current listing to existing listings and save
                    existing_listings.append(listing)
                    with open(output_file, 'w', encoding='utf-8') as f:
                        json.dump(existing_listings, f, ensure_ascii=False, indent=4)
                    logger.info(f"Saved scraped listing to {output_file}: {title}")
                
                listing_count += 1
                scraped_listings.append(listing)
                
                # Add a small delay between processing listings to avoid rate limits
                time.sleep(DELAY_BETWEEN_LISTINGS)
            
        except Exception as e:
            logger.error(f"Error scraping listing: {str(e)}")
            continue
    
    logger.info(f"Scraped {len(scraped_listings)} new listings from {url}")
    return scraped_listings

def cleanup_chrome_profiles(data_dir):
    """Clean up old Chrome profiles to prevent conflicts"""
    try:
        # Find all chrome profile directories older than 1 hour
        chrome_profiles = glob.glob(os.path.join(data_dir, "chrome_profile_*"))
        current_time = time.time()
        one_hour_ago = current_time - 3600  # 1 hour in seconds
        
        for profile_dir in chrome_profiles:
            try:
                # Get the directory's creation time
                dir_time = os.path.getctime(profile_dir)
                if dir_time < one_hour_ago:
                    logger.info(f"Removing old Chrome profile: {profile_dir}")
                    shutil.rmtree(profile_dir, ignore_errors=True)
            except Exception as e:
                logger.warning(f"Error checking/removing Chrome profile {profile_dir}: {str(e)}")
        
        logger.info("Chrome profiles cleanup completed")
    except Exception as e:
        logger.warning(f"Error during Chrome profiles cleanup: {str(e)}")

def scrape_listings(urls, output_file, max_listings=None, process_immediately=False):
    """Main function to scrape listings from multiple URLs"""
    # Import here to avoid circular imports
    from config import PAGES_TO_SCRAPE, DELAY_BETWEEN_PAGES
    
    # Define paths for persistent data
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(backend_dir)  # Go up one level to the project root
    data_dir = os.path.join(project_root, "data")  # Data is at the project root
    cookies_path = os.path.join(data_dir, "cookies.pkl")
    
    # Clean up old Chrome profiles to prevent conflicts
    cleanup_chrome_profiles(data_dir)
    
    # Generate a unique user data directory for this run
    random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    timestamp = int(time.time())
    user_data_dir = os.path.join(data_dir, f"chrome_profile_{timestamp}_{random_suffix}")
    
    # Create directories if they don't exist
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(user_data_dir, exist_ok=True)
    
    # Initialize driver variable
    driver = None
    
    try:
        # Initialize your Selenium driver with persistent profile
        options = webdriver.ChromeOptions()
        options.add_argument(f"user-data-dir={user_data_dir}")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)
        
        # Check if we should run in headless mode (default to headless for server environments)
        headless_mode = os.environ.get('CHROME_HEADLESS', '1').lower() in ('1', 'true', 'yes')
        if headless_mode:
            logger.info("Running Chrome in headless mode")
            options.add_argument("--headless=new")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
        
        # Create the driver
        logger.info(f"Initializing Chrome with user data directory: {user_data_dir}")
        driver = webdriver.Chrome(options=options)
        
        # Execute CDP commands to make the browser less detectable
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
            "source": """
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            })
            """
        })
        
        # Handle login with cookie persistence
        manual_login(driver, cookies_path)
        
        all_scraped_listings = []
        
        for base_url in urls:
            # Process multiple pages for each base URL
            for page in range(1, PAGES_TO_SCRAPE + 1):
                if page == 1:
                    # First page uses the original URL
                    current_url = base_url
                else:
                    # For subsequent pages, insert the page number into the URL
                    # Check if the URL already contains a page parameter
                    if "/seite:" in base_url:
                        # Replace existing page parameter
                        current_url = re.sub(r'/seite:\d+/', f'/seite:{page}/', base_url)
                    else:
                        # Find the position to insert the page parameter
                        # Typically after the search path but before any filters
                        parts = base_url.split('/')
                        domain_part = '/'.join(parts[:3])  # e.g., https://www.kleinanzeigen.de
                        path_part = parts[3]  # e.g., s-notebooks
                        
                        # Insert the page parameter after the path part
                        remaining_parts = '/'.join(parts[4:]) if len(parts) > 4 else ""
                        current_url = f"{domain_part}/{path_part}/seite:{page}/{remaining_parts}"
                
                logger.info(f"Scraping page {page} of {PAGES_TO_SCRAPE}: {current_url}")
                
                # Scrape the current page
                scraped_listings = scrape_page(
                    driver, 
                    current_url, 
                    output_file=output_file, 
                    max_listings=max_listings,
                    process_immediately=process_immediately
                )
                all_scraped_listings.extend(scraped_listings)
                
                # Add a delay between pages to avoid being flagged as a bot
                if page < PAGES_TO_SCRAPE:
                    time.sleep(DELAY_BETWEEN_PAGES)
        
        logger.info(f"Successfully scraped {len(all_scraped_listings)} listings across all pages")
        
    except Exception as e:
        logger.error(f"Error in scraping process: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
    finally:
        # Clean up the driver
        if driver is not None:
            try:
                driver.quit()
                logger.info("Chrome driver closed successfully")
            except Exception as e:
                logger.error(f"Error closing Chrome driver: {str(e)}")
        
        # Clean up the user data directory
        try:
            if os.path.exists(user_data_dir):
                shutil.rmtree(user_data_dir, ignore_errors=True)
                logger.info(f"Removed Chrome user data directory: {user_data_dir}")
        except Exception as e:
            logger.warning(f"Error removing Chrome user data directory: {str(e)}") 