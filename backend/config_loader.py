import os
import json
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Determine the project root directory
PROJECT_ROOT = Path(__file__).parent.parent.absolute()

# Configuration file paths
CONFIG_FILE = os.path.join(PROJECT_ROOT, "config.json")
EXAMPLE_CONFIG_FILE = os.path.join(PROJECT_ROOT, "config.example.json")

# Global configuration object
_config = None

def load_config():
    """Load configuration from config.json file."""
    global _config
    
    if _config is not None:
        return _config
    
    # Check if config file exists
    if not os.path.exists(CONFIG_FILE):
        # If not, check if example config exists
        if os.path.exists(EXAMPLE_CONFIG_FILE):
            logger.warning(f"Configuration file {CONFIG_FILE} not found. Creating from example.")
            # Create config from example
            with open(EXAMPLE_CONFIG_FILE, 'r') as f:
                example_config = json.load(f)
            
            # Interactive configuration setup
            example_config = setup_interactive_config(example_config)
            
            # Save the new configuration
            with open(CONFIG_FILE, 'w') as f:
                json.dump(example_config, f, indent=2)
            
            _config = example_config
        else:
            logger.error(f"Neither configuration file {CONFIG_FILE} nor example {EXAMPLE_CONFIG_FILE} found.")
            _config = {}
    else:
        # Load existing configuration
        try:
            with open(CONFIG_FILE, 'r') as f:
                _config = json.load(f)
            logger.info(f"Configuration loaded from {CONFIG_FILE}")
        except Exception as e:
            logger.error(f"Error loading configuration: {str(e)}")
            _config = {}
    
    return _config

def setup_interactive_config(config):
    """Set up configuration interactively."""
    print("\n=== KleinanzeigenScraper Configuration Setup ===\n")
    print("Please provide the following information to configure the application.")
    print("Press Enter to accept the default value shown in brackets.\n")
    
    # Server configuration
    config["server"]["port"] = int(input(f"API server port [{config['server']['port']}]: ") or config["server"]["port"])
    
    # Service configuration
    config["service"]["user"] = input(f"Service user [{config['service']['user']}]: ") or config["service"]["user"]
    config["service"]["working_directory"] = input(f"Working directory [{config['service']['working_directory']}]: ") or config["service"]["working_directory"]
    
    # OpenAI configuration
    config["openai"]["api_key"] = input(f"OpenAI API key (leave empty if using environment variable): ") or config["openai"]["api_key"]
    config["openai"]["model"] = input(f"OpenAI model [{config['openai']['model']}]: ") or config["openai"]["model"]
    
    print("\nConfiguration complete! Saving to config.json\n")
    return config

def get_config():
    """Get the configuration object."""
    if _config is None:
        return load_config()
    return _config

# Helper functions to access specific configuration sections
def get_server_config():
    """Get server configuration."""
    return get_config().get("server", {})

def get_service_config():
    """Get service configuration."""
    return get_config().get("service", {})

def get_openai_config():
    """Get OpenAI configuration."""
    return get_config().get("openai", {})

# Load configuration when module is imported
load_config() 