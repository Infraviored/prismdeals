from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
import os
import json
import logging
import threading
import time
import sys
import traceback
import uuid
import hashlib
import secrets
from functools import wraps
from bs4 import BeautifulSoup

# Add the parent directory to the Python path to allow imports from the backend directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Now import the modules
from backend.housekeeping import (
    check_listing_availability,
    run_housekeeping,
    get_housekeeping_settings,
    save_housekeeping_settings,
    start_housekeeping_thread,
    is_housekeeping_in_progress,
    setup_scheduled_housekeeping
)
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
app.secret_key = secrets.token_hex(16)  # Generate a random secret key for sessions
CORS(app, supports_credentials=True)  # Enable CORS with credentials support

# Path configurations
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)  # Go up one level to the project root
DATA_DIR = os.path.join(PROJECT_ROOT, "data")  # Data is at the project root
LISTINGS_DIR = os.path.join(DATA_DIR, "listings")  # Directory for individual listing files
SEARCH_CONFIG_FILE = os.path.join(DATA_DIR, "search_config.json")
SCHEDULE_CONFIG_FILE = os.path.join(DATA_DIR, "schedule_config.json")
USERS_FILE = os.path.join(DATA_DIR, "users.json")  # File to store user data

# Create necessary directories if they don't exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(LISTINGS_DIR, exist_ok=True)

# Global variables for scheduling
scheduled_thread = None
stop_scheduled_thread = False
scraping_in_progress = False

# User roles
ROLE_ADMIN = "admin"
ROLE_USER = "user"

# Initialize users file if it doesn't exist
def init_users_file():
    if not os.path.exists(USERS_FILE):
        with open(USERS_FILE, 'w') as f:
            json.dump({"users": []}, f)
        logger.info(f"Created empty users file at {USERS_FILE}")

init_users_file()

# User management functions
def get_users():
    try:
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        # If file doesn't exist or is invalid, create a new one
        init_users_file()
        return {"users": []}

def save_users(users_data):
    with open(USERS_FILE, 'w') as f:
        json.dump(users_data, f, indent=2)

def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(8)
    hash_obj = hashlib.sha256((password + salt).encode())
    return hash_obj.hexdigest(), salt

def verify_password(password, stored_hash, salt):
    computed_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(computed_hash, stored_hash)

def find_user(username):
    users_data = get_users()
    for user in users_data["users"]:
        if user["username"] == username:
            return user
    return None

# Authentication decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({"error": "Authentication required"}), 401
        
        users_data = get_users()
        user = next((u for u in users_data["users"] if u["id"] == session['user_id']), None)
        
        if not user or user["role"] != ROLE_ADMIN:
            return jsonify({"error": "Admin privileges required"}), 403
        
        return f(*args, **kwargs)
    return decorated_function

# Authentication routes
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    
    user = find_user(username)
    if not user or not verify_password(password, user["password_hash"], user["salt"]):
        return jsonify({"error": "Invalid username or password"}), 401
    
    # Set session
    session['user_id'] = user["id"]
    
    # Return user info (excluding sensitive data)
    return jsonify({
        "id": user["id"],
        "username": user["username"],
        "role": user["role"]
    })

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({"message": "Logged out successfully"})

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    if 'user_id' in session:
        users_data = get_users()
        user = next((u for u in users_data["users"] if u["id"] == session['user_id']), None)
        
        if user:
            return jsonify({
                "authenticated": True,
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "role": user["role"]
                }
            })
    
    return jsonify({"authenticated": False})

@app.route('/api/auth/users', methods=['GET'])
@admin_required
def get_all_users():
    users_data = get_users()
    # Remove sensitive information
    safe_users = []
    for user in users_data["users"]:
        safe_users.append({
            "id": user["id"],
            "username": user["username"],
            "role": user["role"]
        })
    return jsonify(safe_users)

@app.route('/api/auth/users', methods=['POST'])
@admin_required
def create_user():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', ROLE_USER)
    
    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    
    if role not in [ROLE_ADMIN, ROLE_USER]:
        return jsonify({"error": "Invalid role"}), 400
    
    if find_user(username):
        return jsonify({"error": "Username already exists"}), 409
    
    users_data = get_users()
    password_hash, salt = hash_password(password)
    
    new_user = {
        "id": str(uuid.uuid4()),
        "username": username,
        "password_hash": password_hash,
        "salt": salt,
        "role": role
    }
    
    users_data["users"].append(new_user)
    save_users(users_data)
    
    return jsonify({
        "id": new_user["id"],
        "username": new_user["username"],
        "role": new_user["role"]
    }), 201

@app.route('/api/auth/users/<user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    users_data = get_users()
    
    # Prevent deleting the last admin
    admin_count = sum(1 for user in users_data["users"] if user["role"] == ROLE_ADMIN)
    user_to_delete = next((u for u in users_data["users"] if u["id"] == user_id), None)
    
    if not user_to_delete:
        return jsonify({"error": "User not found"}), 404
    
    if user_to_delete["role"] == ROLE_ADMIN and admin_count <= 1:
        return jsonify({"error": "Cannot delete the last admin user"}), 400
    
    users_data["users"] = [u for u in users_data["users"] if u["id"] != user_id]
    save_users(users_data)
    
    return jsonify({"message": "User deleted successfully"})

@app.route('/api/auth/settings', methods=['GET'])
@admin_required
def get_auth_settings():
    # Get the current authentication settings
    try:
        with open(os.path.join(DATA_DIR, "auth_settings.json"), 'r') as f:
            return jsonify(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        # Default settings if file doesn't exist
        default_settings = {"public_access": False}
        with open(os.path.join(DATA_DIR, "auth_settings.json"), 'w') as f:
            json.dump(default_settings, f)
        return jsonify(default_settings)

@app.route('/api/auth/settings', methods=['PUT'])
@admin_required
def update_auth_settings():
    data = request.json
    settings = {
        "public_access": data.get("public_access", False)
    }
    
    with open(os.path.join(DATA_DIR, "auth_settings.json"), 'w') as f:
        json.dump(settings, f)
    
    return jsonify(settings)

# Helper function to check if public access is enabled
def is_public_access_enabled():
    try:
        with open(os.path.join(DATA_DIR, "auth_settings.json"), 'r') as f:
            settings = json.load(f)
            return settings.get("public_access", False)
    except (FileNotFoundError, json.JSONDecodeError):
        return False

# Modified decorator that allows access if public access is enabled or user is authenticated
def auth_or_public(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if is_public_access_enabled():
            return f(*args, **kwargs)
        
        if 'user_id' not in session:
            return jsonify({"error": "Authentication required"}), 401
        
        return f(*args, **kwargs)
    return decorated_function

# API endpoint to get all listings from all search files
@app.route('/api/listings', methods=['GET'])
@auth_or_public
def get_all_listings():
    try:
        all_listings = []
        search_config = get_search_config()
        
        # Get housekeeping settings to check if we should show deleted listings
        show_deleted = True
        try:
            housekeeping_settings = get_housekeeping_settings(DATA_DIR)
            show_deleted = housekeeping_settings.get('show_deleted', True)
        except Exception:
            # Default to showing deleted listings if there's an error
            show_deleted = True
        
        # Get the show_deleted parameter from the query string if provided
        show_deleted_param = request.args.get('show_deleted', None)
        if show_deleted_param is not None:
            show_deleted = show_deleted_param.lower() in ('true', '1', 'yes', 'y')
        
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
                            
                            # Default is_deleted to False if not present
                            if 'is_deleted' not in listing:
                                listing['is_deleted'] = False
                        
                        # Filter out deleted listings if not showing them
                        if not show_deleted:
                            listings = [l for l in listings if not l.get('is_deleted', False)]
                            
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
@admin_required
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
@admin_required
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
@admin_required
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
@admin_required
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
@auth_or_public
def get_messages():
    """Get all vendor message templates."""
    try:
        messages = load_messages()
        return jsonify(messages)
    except Exception as e:
        logger.error(f"Error getting messages: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/messages/<message_key>', methods=['PUT'])
@admin_required
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
@auth_or_public
def get_prompt_template():
    """Get the current prompt template."""
    try:
        template = load_prompt_template()
        return jsonify({"prompt_template": template})
    except Exception as e:
        logger.error(f"Error getting prompt template: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/prompt', methods=['PUT'])
@admin_required
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
@auth_or_public
def get_default_prompt_template():
    """Get the default prompt template."""
    try:
        default_template = get_default_prompt_template()
        return jsonify({"default_prompt_template": default_template})
    except Exception as e:
        logger.error(f"Error getting default prompt template: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/reset-prompt', methods=['POST'])
@admin_required
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
@admin_required
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

@app.route('/api/check-listing', methods=['POST'])
@auth_or_public
def check_listing_endpoint():
    """API endpoint to check if a single listing is still available."""
    try:
        data = request.json
        url = data.get('url')
        
        if not url:
            return jsonify({"error": "URL is required"}), 400
        
        # Directly use the check_listing_availability function
        is_deleted = check_listing_availability(url)
        
        if is_deleted is None:
            return jsonify({
                "status": "error",
                "message": "Failed to check listing availability"
            }), 500
            
        return jsonify({
            "status": "success",
            "url": url,
            "is_deleted": is_deleted
        })
        
    except Exception as e:
        logger.error(f"Error in check_listing endpoint: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/housekeeping', methods=['POST'])
@admin_required
def run_housekeeping_endpoint():
    """Run housekeeping to check the status of all listings."""
    try:
        # Check if housekeeping is already running
        if is_housekeeping_in_progress():
            return jsonify({
                "status": "error", 
                "message": "Housekeeping is already in progress"
            }), 409
        
        # Get housekeeping settings
        settings = get_housekeeping_settings(DATA_DIR)
        
        # Start housekeeping in a background thread
        thread_id = start_housekeeping_thread(
            DATA_DIR,
            check_deleted=settings.get('check_deleted', True)
        )
        
        # Update last run time in settings
        settings['last_run'] = time.time()
        save_housekeeping_settings(DATA_DIR, settings)
        
        return jsonify({
            "status": "success",
            "message": "Housekeeping started",
            "thread_id": thread_id
        })
        
    except Exception as e:
        logger.error(f"Error starting housekeeping: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/housekeeping/settings', methods=['GET'])
@auth_or_public
def get_housekeeping_settings_endpoint():
    """Get housekeeping settings."""
    try:
        settings = get_housekeeping_settings(DATA_DIR)
        return jsonify(settings)
    except Exception as e:
        logger.error(f"Error getting housekeeping settings: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/housekeeping/settings', methods=['PUT'])
@admin_required
def update_housekeeping_settings_endpoint():
    """Update housekeeping settings."""
    try:
        data = request.json
        settings = get_housekeeping_settings(DATA_DIR)
        
        # Update settings with new values
        if 'enabled' in data:
            settings['enabled'] = bool(data['enabled'])
        if 'hour' in data:
            settings['hour'] = int(data['hour'])
        if 'minute' in data:
            settings['minute'] = int(data['minute'])
        if 'check_deleted' in data:
            settings['check_deleted'] = bool(data['check_deleted'])
        if 'show_deleted' in data:
            settings['show_deleted'] = bool(data['show_deleted'])
        
        save_housekeeping_settings(DATA_DIR, settings)
        
        # Restart scheduled housekeeping with new settings
        setup_scheduled_housekeeping(DATA_DIR)
        
        return jsonify(settings)
    except Exception as e:
        logger.error(f"Error updating housekeeping settings: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

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
    
    # Start scheduled housekeeping
    setup_scheduled_housekeeping(DATA_DIR)
    
    # Start the Flask server
    app.run(host='0.0.0.0', port=3030, debug=False)