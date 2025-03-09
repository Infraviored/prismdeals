#!/usr/bin/env python3
import os
import json
import uuid
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Path configurations
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
OLD_LISTINGS_FILE = os.path.join(DATA_DIR, "listings.json")
OLD_SEARCH_URLS_FILE = os.path.join(DATA_DIR, "search_urls.json")
LISTINGS_DIR = os.path.join(DATA_DIR, "listings")
SEARCH_CONFIG_FILE = os.path.join(DATA_DIR, "search_config.json")

# Create listings directory if it doesn't exist
os.makedirs(LISTINGS_DIR, exist_ok=True)

def migrate_listings():
    """Migrate listings from a single file to separate files based on search terms."""
    logger.info("Starting migration of listings...")
    
    # Check if old files exist
    if not os.path.exists(OLD_LISTINGS_FILE):
        logger.error(f"Old listings file not found: {OLD_LISTINGS_FILE}")
        return False
    
    if not os.path.exists(OLD_SEARCH_URLS_FILE):
        logger.error(f"Old search URLs file not found: {OLD_SEARCH_URLS_FILE}")
        return False
    
    # Load old listings
    try:
        with open(OLD_LISTINGS_FILE, 'r') as f:
            all_listings = json.load(f)
        logger.info(f"Loaded {len(all_listings)} listings from {OLD_LISTINGS_FILE}")
    except Exception as e:
        logger.error(f"Error loading old listings: {str(e)}")
        return False
    
    # Load old search URLs
    try:
        with open(OLD_SEARCH_URLS_FILE, 'r') as f:
            old_search_urls = json.load(f)
        logger.info(f"Loaded {len(old_search_urls)} search URLs from {OLD_SEARCH_URLS_FILE}")
    except Exception as e:
        logger.error(f"Error loading old search URLs: {str(e)}")
        return False
    
    # Create search configurations with names and UUIDs
    search_config = []
    search_terms = {}  # Map search terms to search IDs
    
    for url_data in old_search_urls:
        url = url_data.get('url', '')
        enabled = url_data.get('enabled', True)
        
        # Extract search term from URL
        search_term = None
        if 'rtx4060' in url.lower() or 'rtx-4060' in url.lower():
            search_term = 'rtx4060'
            name = 'RTX 4060'
        elif 'rtx4070' in url.lower() or 'rtx-4070' in url.lower():
            search_term = 'rtx4070'
            name = 'RTX 4070'
        else:
            # If we can't determine the search term, use a generic name
            search_term = 'other'
            name = 'Other Search'
        
        search_id = str(uuid.uuid4())
        search_terms[search_term] = search_id
        
        search_config.append({
            "id": search_id,
            "name": name,
            "url": url,
            "enabled": enabled
        })
    
    # Save search configuration
    try:
        with open(SEARCH_CONFIG_FILE, 'w') as f:
            json.dump(search_config, f, indent=2)
        logger.info(f"Saved search configuration to {SEARCH_CONFIG_FILE}")
    except Exception as e:
        logger.error(f"Error saving search configuration: {str(e)}")
        return False
    
    # Initialize listings by search term
    listings_by_search = {term: [] for term in search_terms.keys()}
    unclassified_listings = []
    
    # Classify listings by search term
    for listing in all_listings:
        title = listing.get('title', '').lower()
        classified = False
        
        for term in search_terms.keys():
            if term != 'other' and term.lower() in title.replace(' ', ''):
                listings_by_search[term].append(listing)
                classified = True
                break
        
        if not classified:
            unclassified_listings.append(listing)
    
    # Save listings by search term
    for term, search_id in search_terms.items():
        listings = listings_by_search[term]
        listings_file = os.path.join(LISTINGS_DIR, f"listings_{search_id}.json")
        
        try:
            with open(listings_file, 'w') as f:
                json.dump(listings, f, indent=2)
            logger.info(f"Saved {len(listings)} listings for {term} to {listings_file}")
        except Exception as e:
            logger.error(f"Error saving listings for {term}: {str(e)}")
    
    # If there are unclassified listings, create a misc category
    if unclassified_listings:
        misc_id = str(uuid.uuid4())
        misc_file = os.path.join(LISTINGS_DIR, f"listings_{misc_id}.json")
        
        # Add misc search to config
        search_config.append({
            "id": misc_id,
            "name": "Unclassified Listings",
            "url": "",
            "enabled": True
        })
        
        # Save updated config
        try:
            with open(SEARCH_CONFIG_FILE, 'w') as f:
                json.dump(search_config, f, indent=2)
        except Exception as e:
            logger.error(f"Error updating search configuration with misc category: {str(e)}")
        
        # Save misc listings
        try:
            with open(misc_file, 'w') as f:
                json.dump(unclassified_listings, f, indent=2)
            logger.info(f"Saved {len(unclassified_listings)} unclassified listings to {misc_file}")
        except Exception as e:
            logger.error(f"Error saving unclassified listings: {str(e)}")
    
    # Create backup of original files
    try:
        with open(f"{OLD_LISTINGS_FILE}.migrated_backup", 'w') as f:
            json.dump(all_listings, f, indent=2)
        with open(f"{OLD_SEARCH_URLS_FILE}.migrated_backup", 'w') as f:
            json.dump(old_search_urls, f, indent=2)
        logger.info(f"Created backups of original files")
    except Exception as e:
        logger.error(f"Error creating backups: {str(e)}")
    
    logger.info("Migration completed successfully!")
    return True

if __name__ == "__main__":
    migrate_listings()