from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import logging
import threading
import time
import sys
import traceback
import uuid

# Add the parent directory to the Python path to allow imports from the backend directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Now import the modules
from backend.scraper import scrape_listings
from backend.process_listings import update_listings_with_chatgpt
from backend.message_generator import (
    load_messages, 
    update_message_template, 
    regenerate_messages, 
    load_prompt_template,
    save_prompt_template,
    get_default_prompt_template,
    reset_prompt_template,
    VENDOR_CONTACT_FILE
)

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Path configurations
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)  # Go up one level to the project root
DATA_DIR = os.path.join(PROJECT_ROOT, "data")  # Data is at the project root
LISTINGS_DIR = os.path.join(DATA_DIR, "listings")  # Directory for individual listing files
SEARCH_CONFIG_FILE = os.path.join(DATA_DIR, "search_config.json")
SCHEDULE_CONFIG_FILE = os.path.join(DATA_DIR, "schedule_config.json")

# Create necessary directories if they don't exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(LISTINGS_DIR, exist_ok=True)

# Global variables for scheduling
scheduled_thread = None
stop_scheduled_thread = False
scraping_in_progress = False

# API endpoint to get all listings from all search files
@app.route('/api/listings', methods=['GET'])
def get_all_listings():
    try:
        all_listings = []
        search_config = get_search_config()
        
        # Iterate through all search configurations
        for search in search_config:
            search_id = search.get('id')
            search_name = search.get('name', 'Unnamed Search')
            
            if search_id:
                listings_file = os.path.join(LISTINGS_DIR, f"listings_{search_id}.json")
                if os.path.exists(listings_file):
                    with open(listings_file, 'r') as f:
                        listings = json.load(f)
                        # Add search name to each listing
                        for listing in listings:
                            listing['search_name'] = search_name
                            listing['search_id'] = search_id
                        all_listings.extend(listings)
        
        return jsonify(all_listings)
    except Exception as e:
        logger.error(f"Error reading listings: {str(e)}")
        return jsonify({"error": "Failed to retrieve listings data"}), 500

# API endpoint to get listings for a specific search
@app.route('/api/listings/<search_id>', methods=['GET'])
def get_listings_by_search(search_id):
    try:
        listings_file = os.path.join(LISTINGS_DIR, f"listings_{search_id}.json")
        if os.path.exists(listings_file):
            with open(listings_file, 'r') as f:
                listings = json.load(f)
            return jsonify(listings)
        else:
            return jsonify([])
    except Exception as e:
        logger.error(f"Error reading listings for search {search_id}: {str(e)}")
        return jsonify({"error": f"Failed to retrieve listings data for search {search_id}"}), 500

# Helper function to get search configuration
def get_search_config():
    if os.path.exists(SEARCH_CONFIG_FILE):
        with open(SEARCH_CONFIG_FILE, 'r') as f:
            return json.load(f)
    return []

# API endpoint to get search configuration
@app.route('/api/search-config', methods=['GET'])
def get_search_config_api():
    try:
        search_config = get_search_config()
        return jsonify(search_config)
    except Exception as e:
        logger.error(f"Error reading search configuration: {str(e)}")
        return jsonify({"error": "Failed to retrieve search configuration"}), 500

# API endpoint to update search configuration
@app.route('/api/search-config', methods=['POST'])
def update_search_config():
    try:
        search_config = request.json
        
        # Ensure each search has an ID
        for search in search_config:
            if 'id' not in search:
                search['id'] = str(uuid.uuid4())
        
        with open(SEARCH_CONFIG_FILE, 'w') as f:
            json.dump(search_config, f, indent=2)
        
        return jsonify({"success": True, "config": search_config})
    except Exception as e:
        logger.error(f"Error saving search configuration: {str(e)}")
        return jsonify({"error": "Failed to save search configuration"}), 500

# API endpoint to add a new search
@app.route('/api/search-config/add', methods=['POST'])
def add_search():
    try:
        new_search = request.json
        
        # Generate a UUID for the new search if not provided
        if 'id' not in new_search:
            new_search['id'] = str(uuid.uuid4())
        
        # Ensure name is provided
        if 'name' not in new_search or not new_search['name']:
            new_search['name'] = f"Search {new_search['id'][:8]}"
        
        # Load existing configuration
        search_config = get_search_config()
        
        # Add the new search
        search_config.append(new_search)
        
        # Save updated configuration
        with open(SEARCH_CONFIG_FILE, 'w') as f:
            json.dump(search_config, f, indent=2)
        
        return jsonify({"success": True, "search": new_search})
    except Exception as e:
        logger.error(f"Error adding new search: {str(e)}")
        return jsonify({"error": "Failed to add new search"}), 500

# API endpoint to trigger scraping manually
@app.route('/api/scrape', methods=['POST'])
def trigger_scrape():
    global scraping_in_progress
    
    try:
        # Check if scraping is already in progress
        if scraping_in_progress:
            return jsonify({
                "success": False,
                "message": "Scraping is already in progress",
            }), 409  # 409 Conflict
        
        data = request.json
        mode = data.get('mode', 'both')
        search_ids = data.get('search_ids', [])
        max_listings = data.get('maxListings')
        
        # Set headless mode from request or default to environment variable
        headless = data.get('headless', os.environ.get('CHROME_HEADLESS', '1').lower() in ('1', 'true', 'yes'))
        if headless:
            os.environ['CHROME_HEADLESS'] = '1'
        else:
            os.environ['CHROME_HEADLESS'] = '0'
        
        # Start scraping in a separate thread to not block the API response
        thread = threading.Thread(
            target=run_scraper,
            args=(mode, search_ids, max_listings)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            "success": True,
            "message": "Scraping process started",
            "thread_id": thread.ident,
            "headless_mode": headless
        })
    except Exception as e:
        logger.error(f"Error starting scraper: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Failed to start scraper", "details": str(e)}), 500

# API endpoint to get scraping schedule
@app.route('/api/schedule', methods=['GET'])
def get_schedule():
    try:
        if os.path.exists(SCHEDULE_CONFIG_FILE):
            with open(SCHEDULE_CONFIG_FILE, 'r') as f:
                config = json.load(f)
            return jsonify(config)
        else:
            default_config = {"interval": 60, "enabled": True}
            with open(SCHEDULE_CONFIG_FILE, 'w') as f:
                json.dump(default_config, f, indent=2)
            return jsonify(default_config)
    except Exception as e:
        logger.error(f"Error reading schedule config: {str(e)}")
        return jsonify({"error": "Failed to retrieve schedule config"}), 500

# API endpoint to update scraping schedule
@app.route('/api/schedule', methods=['POST'])
def update_schedule():
    try:
        config = request.json
        with open(SCHEDULE_CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        
        # Restart the scheduling
        setup_scheduled_scraping()
        
        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"Error saving schedule config: {str(e)}")
        return jsonify({"error": "Failed to save schedule config"}), 500

# API endpoint to get server status
@app.route('/api/status', methods=['GET'])
def get_status():
    global scraping_in_progress
    
    try:
        import psutil
        process = psutil.Process(os.getpid())
        
        return jsonify({
            "status": "running",
            "uptime": time.time() - process.create_time(),
            "memory": {
                "rss": f"{process.memory_info().rss / (1024 * 1024):.1f} MB",
                "vms": f"{process.memory_info().vms / (1024 * 1024):.1f} MB"
            },
            "cpu_percent": process.cpu_percent(),
            "scraping_in_progress": scraping_in_progress,
            "headless_mode": os.environ.get('CHROME_HEADLESS', '1').lower() in ('1', 'true', 'yes')
        })
    except Exception as e:
        logger.error(f"Error getting server status: {str(e)}")
        return jsonify({"error": "Failed to get server status"}), 500

# Function to run the scraper (called by API and scheduler)
def run_scraper(mode='both', search_ids=None, max_listings=None):
    global scraping_in_progress
    
    # Set scraping_in_progress flag
    scraping_in_progress = True
    
    try:
        logger.info(f"Starting scraper with mode={mode}")
        
        # Load search configuration
        search_config = get_search_config()
        
        # If no search IDs provided, use all enabled searches
        if not search_ids:
            search_ids = [search['id'] for search in search_config if search.get('enabled', True)]
        
        # Process each search
        for search_id in search_ids:
            # Find the search configuration
            search = next((s for s in search_config if s['id'] == search_id), None)
            
            if not search:
                logger.warning(f"Search ID {search_id} not found in configuration")
                continue
            
            if not search.get('enabled', True):
                logger.info(f"Skipping disabled search: {search.get('name', search_id)}")
                continue
            
            url = search.get('url')
            if not url:
                logger.warning(f"No URL found for search ID {search_id}")
                continue
            
            listings_file = os.path.join(LISTINGS_DIR, f"listings_{search_id}.json")
            
            if mode in ["scrape", "both"]:
                logger.info(f"Starting scraping for search: {search.get('name', search_id)}")
                from backend.scraper import scrape_listings
                scrape_listings([url], listings_file, max_listings=max_listings, process_immediately=(mode == "both"))
            
            if mode in ["process", "both"]:
                logger.info(f"Starting processing for search: {search.get('name', search_id)}")
                from backend.process_listings import update_listings_with_chatgpt
                update_listings_with_chatgpt(listings_file)
        
        logger.info("All operations completed")
    except Exception as e:
        logger.error(f"Error in run_scraper: {str(e)}")
        logger.error(traceback.format_exc())
    finally:
        # Reset scraping_in_progress flag
        scraping_in_progress = False

# Function for scheduled scraping
def scheduled_scraping_thread():
    global stop_scheduled_thread
    
    while not stop_scheduled_thread:
        try:
            # Load schedule config
            if os.path.exists(SCHEDULE_CONFIG_FILE):
                with open(SCHEDULE_CONFIG_FILE, 'r') as f:
                    config = json.load(f)
                
                interval_minutes = config.get('interval', 60)
                enabled = config.get('enabled', True)
                
                if enabled:
                    logger.info(f"Running scheduled scraping (interval: {interval_minutes} minutes)")
                    run_scraper()
                else:
                    logger.info("Scheduled scraping is disabled")
            else:
                logger.info("No schedule config found, using default (60 minutes)")
                interval_minutes = 60
                run_scraper()
            
            # Sleep for the configured interval
            for _ in range(interval_minutes * 60):
                if stop_scheduled_thread:
                    break
                time.sleep(1)
        except Exception as e:
            logger.error(f"Error in scheduled scraping: {str(e)}")
            logger.error(traceback.format_exc())
            # Sleep for 5 minutes before retrying after an error
            time.sleep(300)

# Function to set up scheduled scraping
def setup_scheduled_scraping():
    global scheduled_thread, stop_scheduled_thread
    
    # Stop existing thread if running
    if scheduled_thread and scheduled_thread.is_alive():
        stop_scheduled_thread = True
        scheduled_thread.join(timeout=5)
        stop_scheduled_thread = False
    
    # Start new thread
    scheduled_thread = threading.Thread(target=scheduled_scraping_thread)
    scheduled_thread.daemon = True
    scheduled_thread.start()
    logger.info("Scheduled scraping thread started")

# Vendor Contact Endpoints

@app.route('/api/messages', methods=['GET'])
def get_messages():
    """Get all vendor message templates."""
    try:
        messages = load_messages()
        return jsonify(messages)
    except Exception as e:
        logger.error(f"Error getting messages: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/messages/<message_key>', methods=['PUT'])
def update_message(message_key):
    """Update a specific message template."""
    try:
        data = request.json
        new_message = data.get('message')
        
        if not new_message:
            return jsonify({'status': 'error', 'message': 'No message provided'}), 400
        
        success = update_message_template(message_key, new_message)
        
        if success:
            return jsonify({'status': 'success', 'message': 'Message template updated'})
        else:
            return jsonify({'status': 'error', 'message': 'Failed to update message template'}), 500
    except Exception as e:
        logger.error(f"Error updating message: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/prompt', methods=['GET'])
def get_prompt_template():
    """Get the current prompt template."""
    try:
        template = load_prompt_template()
        return jsonify({"prompt_template": template})
    except Exception as e:
        logger.error(f"Error getting prompt template: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/prompt', methods=['PUT'])
def update_prompt_template():
    """Update the prompt template."""
    try:
        data = request.json
        template = data.get('prompt_template', '')
        success = save_prompt_template(template)
        if success:
            return jsonify({"status": "success"})
        else:
            return jsonify({"error": "Failed to save prompt template"}), 500
    except Exception as e:
        logger.error(f"Error updating prompt template: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/default-prompt', methods=['GET'])
def get_default_prompt_template():
    """Get the default prompt template."""
    try:
        default_template = get_default_prompt_template()
        return jsonify({"default_prompt_template": default_template})
    except Exception as e:
        logger.error(f"Error getting default prompt template: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/reset-prompt', methods=['POST'])
def reset_prompt_template_endpoint():
    """Reset the prompt template to default by removing the custom template."""
    try:
        success = reset_prompt_template()
        if success:
            return jsonify({"status": "success"})
        else:
            return jsonify({"error": "Failed to reset prompt template"}), 500
    except Exception as e:
        logger.error(f"Error resetting prompt template: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/regenerate', methods=['POST'])
def regenerate_messages_endpoint():
    """Regenerate all message templates with optional parameters."""
    try:
        data = request.json or {}
        
        # Get parameters from request
        prompt_template = data.get('prompt_template')  # Optional custom prompt
        additional_question = data.get('additional_question', '')  # Optional additional question
        max_tokens = data.get('max_tokens', 300)  # Optional token limit
        
        # If no custom prompt provided, load the saved one
        if not prompt_template:
            prompt_template = load_prompt_template()
        
        # Regenerate messages
        success = regenerate_messages(
            prompt_template=prompt_template,
            additional_question=additional_question,
            max_tokens=max_tokens
        )
        
        if success:
            return jsonify({
                'status': 'success', 
                'message': 'Messages regenerated',
                'additional_question': additional_question,
                'max_tokens': max_tokens
            })
        else:
            return jsonify({'status': 'error', 'message': 'Failed to regenerate messages'}), 500
    except Exception as e:
        logger.error(f"Error regenerating messages: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Start the Flask server when run directly
if __name__ == '__main__':
    # Ensure the data directory exists
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(LISTINGS_DIR, exist_ok=True)
    
    # Set default headless mode for Chrome (1 = headless, 0 = visible)
    if 'CHROME_HEADLESS' not in os.environ:
        os.environ['CHROME_HEADLESS'] = '1'  # Default to headless mode for server environments
    
    # Migrate old data if needed
    old_listings_file = os.path.join(DATA_DIR, "listings.json")
    old_search_urls_file = os.path.join(DATA_DIR, "search_urls.json")
    
    # Migrate old listings to new format if they exist
    if os.path.exists(old_listings_file) and not os.path.exists(SEARCH_CONFIG_FILE):
        try:
            # Create a default search for old listings
            default_search_id = str(uuid.uuid4())
            default_search = {
                "id": default_search_id,
                "name": "Legacy Search",
                "url": "https://www.kleinanzeigen.de/s-notebooks/preis::1400/rtx4060/k0c278",
                "enabled": True
            }
            
            # Create search config with the default search
            with open(SEARCH_CONFIG_FILE, 'w') as f:
                json.dump([default_search], f, indent=2)
            
            # Copy old listings to new file
            if os.path.exists(old_listings_file):
                with open(old_listings_file, 'r') as f:
                    old_listings = json.load(f)
                
                new_listings_file = os.path.join(LISTINGS_DIR, f"listings_{default_search_id}.json")
                with open(new_listings_file, 'w') as f:
                    json.dump(old_listings, f, indent=2)
            
            logger.info("Migrated old listings to new format")
        except Exception as e:
            logger.error(f"Error migrating old data: {str(e)}")
    
    # Migrate old search URLs if they exist
    if os.path.exists(old_search_urls_file) and not os.path.exists(SEARCH_CONFIG_FILE):
        try:
            with open(old_search_urls_file, 'r') as f:
                old_urls = json.load(f)
            
            # Convert old URLs to new format
            search_config = []
            for i, url_data in enumerate(old_urls):
                search_config.append({
                    "id": str(uuid.uuid4()),
                    "name": f"Search {i+1}",
                    "url": url_data.get('url', ''),
                    "enabled": url_data.get('enabled', True)
                })
            
            # Save new search config
            with open(SEARCH_CONFIG_FILE, 'w') as f:
                json.dump(search_config, f, indent=2)
            
            logger.info("Migrated old search URLs to new format")
        except Exception as e:
            logger.error(f"Error migrating old search URLs: {str(e)}")
    
    # Start scheduled scraping
    setup_scheduled_scraping()
    
    # Start the Flask server
    app.run(host='0.0.0.0', port=3030, debug=False)