#!/usr/bin/env python3
import logging
import sys
import os

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add the parent directory to the Python path to allow imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.housekeeping import check_listing_availability

def test_listing_availability(url):
    """Test the check_listing_availability function with a real listing URL."""
    print(f"Checking listing availability for: {url}")
    is_deleted = check_listing_availability(url)
    
    if is_deleted is None:
        print("Error checking listing availability")
    elif is_deleted:
        print("Listing is DELETED")
    else:
        print("Listing is AVAILABLE")
    
    return is_deleted

if __name__ == "__main__":
    # URL 1 is a deleted listing
    url1 = "https://www.kleinanzeigen.de/s-anzeige/asus-rog-flow-x13-ryzen-9-32gb-rtx-4070-1tb-ssd-stift-ovp/3019156124-278-7"
    # URL 2 is an available listing
    url2 = "https://www.kleinanzeigen.de/s-anzeige/asus-rog-flow-x13/3016355392-278-884?simcid=1478d725-d4b4-43f1-923a-967c2942d7b3"
    
    print("Testing URL 1 (should be deleted):")
    result1 = test_listing_availability(url1)
    print(f"Result: {result1}")
    
    print("\nTesting URL 2 (should be available):")
    result2 = test_listing_availability(url2)
    print(f"Result: {result2}") 