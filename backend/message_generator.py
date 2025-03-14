import os
import json
import logging
from openai import OpenAI
from config import API_KEY, LLM_MODEL

# Set up logging
logger = logging.getLogger(__name__)

# Instantiate the OpenAI client
client = OpenAI(api_key=API_KEY)

# Import INFO_OF_INTEREST at the module level to avoid NameError
from info_config import INFO_OF_INTEREST, generate_combinations, get_info_description

# Paths for template files
DEFAULT_TEMPLATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "default_message_prompt_template.txt")
VENDOR_CONTACT_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "vendor_contact.json")

def load_vendor_contact_data():
    """Load the vendor contact data from JSON file."""
    if os.path.exists(VENDOR_CONTACT_FILE):
        try:
            with open(VENDOR_CONTACT_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            logger.info(f"Loaded vendor contact data from {VENDOR_CONTACT_FILE}")
            return data
        except json.JSONDecodeError:
            logger.error(f"Error: Could not parse vendor contact file {VENDOR_CONTACT_FILE}.")
            return {"custom_template": "", "messages": {}}
        except Exception as e:
            logger.error(f"Error loading vendor contact data: {str(e)}")
            return {"custom_template": "", "messages": {}}
    else:
        logger.info(f"Vendor contact file not found: {VENDOR_CONTACT_FILE}")
        return {"custom_template": "", "messages": {}}

def save_vendor_contact_data(data):
    """Save the vendor contact data to JSON file."""
    try:
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(VENDOR_CONTACT_FILE), exist_ok=True)
        
        with open(VENDOR_CONTACT_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        logger.info(f"Saved vendor contact data to {VENDOR_CONTACT_FILE}")
        return True
    except Exception as e:
        logger.error(f"Error saving vendor contact data: {str(e)}")
        return False

def load_prompt_template():
    """Load the prompt template from custom file if it exists, otherwise from default file."""
    # First try to load from vendor contact data
    vendor_data = load_vendor_contact_data()
    custom_template = vendor_data.get("custom_template", "")
    
    if custom_template.strip():
        logger.info("Loaded custom prompt template from vendor contact data")
        return custom_template
    
    # If no custom template, load from default file
    try:
        if os.path.exists(DEFAULT_TEMPLATE_FILE):
            with open(DEFAULT_TEMPLATE_FILE, 'r', encoding='utf-8') as f:
                template = f.read()
            logger.info(f"Loaded default prompt template from {DEFAULT_TEMPLATE_FILE}")
            return template
        else:
            logger.error(f"Default template file not found at {DEFAULT_TEMPLATE_FILE}")
            return "Error: Default template file not found."
    except Exception as e:
        logger.error(f"Error loading default prompt template: {str(e)}")
        return "Error loading template: " + str(e)

def save_prompt_template(template):
    """Save the prompt template to vendor contact data."""
    try:
        vendor_data = load_vendor_contact_data()
        vendor_data["custom_template"] = template
        success = save_vendor_contact_data(vendor_data)
        if success:
            logger.info("Saved custom prompt template to vendor contact data")
        return success
    except Exception as e:
        logger.error(f"Error saving custom prompt template: {str(e)}")
        return False

def reset_prompt_template():
    """Reset to default template by removing the custom template from vendor contact data."""
    try:
        vendor_data = load_vendor_contact_data()
        vendor_data["custom_template"] = ""
        success = save_vendor_contact_data(vendor_data)
        if success:
            logger.info("Reset prompt template to default")
        return success
    except Exception as e:
        logger.error(f"Error resetting prompt template: {str(e)}")
        return False

def get_default_prompt_template():
    """Return the default prompt template."""
    try:
        if os.path.exists(DEFAULT_TEMPLATE_FILE):
            with open(DEFAULT_TEMPLATE_FILE, 'r', encoding='utf-8') as f:
                template = f.read()
            return template
        else:
            logger.error(f"Default template file not found at {DEFAULT_TEMPLATE_FILE}")
            return "Error: Default template file not found."
    except Exception as e:
        logger.error(f"Error loading default prompt template: {str(e)}")
        return "Error loading template: " + str(e)

def generate_message_for_combination(prompt_template, combination, additional_question="", max_tokens=300):
    """Generate a message for a specific combination of missing information using JetGPT."""
    # Determine which information is missing
    missing_info = []
    for key in INFO_OF_INTEREST.keys():
        if combination[key] == "unknown":
            missing_info.append(key)
    
    # Create a human-readable list of missing information
    missing_info_descriptions = []
    for info in missing_info:
        if info == "RAM_more":
            missing_info_descriptions.append("RAM-Größe (Arbeitsspeicher)")
        elif info == "screen_small":
            missing_info_descriptions.append("Bildschirmgröße (in Zoll)")
        elif info == "screen_highres":
            missing_info_descriptions.append("Bildschirmauflösung")
    
    missing_info_list = "\n".join([f"- {desc}" for desc in missing_info_descriptions])
    
    # Format the prompt with the specific information
    # Ensure the template has the placeholders, or add them if they're missing
    if "{missing_info_list}" not in prompt_template:
        prompt_template += "\n\nMissing information:\n{missing_info_list}"
    if "{additional_question}" not in prompt_template:
        prompt_template += "\n\nAdditional question:\n{additional_question}"
    
    prompt = prompt_template.format(
        missing_info_list=missing_info_list,
        additional_question=additional_question
    )
    
    # Create a key for this combination
    combination_key = "_".join([
        f"{key.lower()}_{'unknown' if combination[key] == 'unknown' else 'known'}"
        for key in INFO_OF_INTEREST.keys()
    ])
    
    try:
        # Call JetGPT to generate the message
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=max_tokens
        )
        
        # Extract the response text
        message = response.choices[0].message.content.strip()
        logger.info(f"Generated message for combination: {combination_key}")
        
        return {
            "combination": combination,
            "missing_info": missing_info,
            "combination_key": combination_key,
            "message": message,
            "additional_question": additional_question
        }
        
    except Exception as e:
        logger.error(f"Error generating message with JetGPT: {str(e)}")
        return {
            "combination": combination,
            "missing_info": missing_info,
            "combination_key": combination_key,
            "message": f"Error generating message: {str(e)}",
            "additional_question": additional_question,
            "error": True
        }

def generate_all_messages(prompt_template=None, additional_question="", max_tokens=300):
    """Generate messages for all possible combinations of missing information."""
    # Load the prompt template if not provided
    if prompt_template is None:
        prompt_template = load_prompt_template()
    
    messages = {}
    
    # Get all possible combinations
    combinations = generate_combinations()
    
    for combination in combinations:
        # Skip combinations where nothing is unknown (no need to contact vendor)
        if all(combination[key] != "unknown" for key in INFO_OF_INTEREST.keys()):
            continue
            
        result = generate_message_for_combination(
            prompt_template, 
            combination, 
            additional_question=additional_question,
            max_tokens=max_tokens
        )
        messages[result["combination_key"]] = result
    
    return messages

def save_messages(messages):
    """Save the generated messages to the vendor contact data."""
    try:
        vendor_data = load_vendor_contact_data()
        vendor_data["messages"] = messages
        success = save_vendor_contact_data(vendor_data)
        if success:
            logger.info("Saved messages to vendor contact data")
        return success
    except Exception as e:
        logger.error(f"Error saving messages: {str(e)}")
        return False

def load_messages():
    """Load messages from the vendor contact data."""
    vendor_data = load_vendor_contact_data()
    return vendor_data.get("messages", {})

def update_message_template(message_key, new_message):
    """Update a specific message template in the vendor contact data."""
    vendor_data = load_vendor_contact_data()
    messages = vendor_data.get("messages", {})
    
    if message_key not in messages:
        logger.error(f"Message key not found: {message_key}")
        return False
    
    messages[message_key]["message"] = new_message
    vendor_data["messages"] = messages
    return save_vendor_contact_data(vendor_data)

def regenerate_messages(prompt_template=None, additional_question="", max_tokens=300):
    """Regenerate all messages using a new prompt template."""
    messages = generate_all_messages(
        prompt_template=prompt_template,
        additional_question=additional_question,
        max_tokens=max_tokens
    )
    return save_messages(messages)

if __name__ == "__main__":
    # Set up logging when run as a standalone script
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    
    # Generate and save messages
    messages = generate_all_messages()
    save_messages(messages) 