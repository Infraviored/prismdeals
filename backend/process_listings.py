import os
import json
import datetime
import logging
from openai import OpenAI
from config import API_KEY, LLM_MODEL, PRINT_PROMPT
from prompts import get_laptop_analysis_prompt
from info_config import INFO_OF_INTEREST

# Set up logging
logger = logging.getLogger(__name__)

# Instantiate the OpenAI client
client = OpenAI(api_key=API_KEY)

def process_listing(title, description):
    """Send the listing title and description to ChatGPT and process the response."""
    # Get the prompt from the prompts module
    prompt = get_laptop_analysis_prompt(title, description)
    
    if PRINT_PROMPT:
        print("\nPrompt sent to LLM:")
        print("-" * 40)
        print(prompt)
        print("-" * 40)

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500  # Increased to ensure we get the full response
        )

        # Extract the response text
        response_text = response.choices[0].message.content.strip()
        logger.info(f"Received LLM response for: {title}")
        
        if PRINT_PROMPT:
            print(f"\nModel response: {response_text}")  # Log the model's response for debugging

        # Initialize result dictionary with default values
        result = {
            "llm_processed": True,
            "llm_processed_time": datetime.datetime.now().isoformat(),
            "full_info_obtained": False
        }
        
        # Initialize all info types to "unknown"
        for info_type in INFO_OF_INTEREST.keys():
            result[info_type] = "unknown"
        
        # Parse the response to extract the values
        for line in response_text.split('\n'):
            line = line.strip().lower()  # Convert to lowercase for easier matching
            
            for info_type in INFO_OF_INTEREST.keys():
                if line.startswith(f"{info_type.lower()} ="):
                    if "true" in line:
                        result[info_type] = True
                    elif "false" in line:
                        result[info_type] = False
                    elif "unknown" in line:
                        result[info_type] = "unknown"
                
            if line.startswith("full_info_obtained ="):
                if "true" in line:
                    result["full_info_obtained"] = True
                elif "false" in line:
                    result["full_info_obtained"] = False
        
        # If full_info_obtained wasn't explicitly set, calculate it
        if "full_info_obtained" not in result or result["full_info_obtained"] is None:
            # If any value is "unknown", full_info_obtained should be False
            result["full_info_obtained"] = all(result[key] != "unknown" for key in INFO_OF_INTEREST.keys())

        return result

    except Exception as e:
        logger.error(f"Error processing listing with LLM: {str(e)}")
        result = {
            "llm_processed": False,
            "llm_processed_time": datetime.datetime.now().isoformat(),
            "full_info_obtained": False
        }
        
        # Set all info types to "unknown" for failed processing
        for info_type in INFO_OF_INTEREST.keys():
            result[info_type] = "unknown"
            
        return result

def update_listings_with_chatgpt(input_file):
    """Read listings from a JSON file, process them with ChatGPT, and update the file in place."""
    if not os.path.exists(input_file):
        logger.error(f"Input file not found: {input_file}")
        return
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            listings = json.load(f)
    except json.JSONDecodeError:
        logger.error(f"Error: Could not parse input file {input_file}.")
        return
    
    # Count total and unprocessed listings
    total_listings = len(listings)
    unprocessed_listings = sum(1 for listing in listings if not listing.get('llm_processed', False))
    
    logger.info(f"Total listings: {total_listings}")
    logger.info(f"Unprocessed listings: {unprocessed_listings}")
    logger.info(f"Already processed: {total_listings - unprocessed_listings}")
    
    if unprocessed_listings == 0:
        logger.info("All listings have already been processed. Nothing to do.")
        return
    
    logger.info(f"Starting processing of {unprocessed_listings} listings...")
    
    # Track how many listings we've processed in this run
    processed_count = 0
    
    # Process each listing
    for i, listing in enumerate(listings):
        listing_id = listing.get('id')
        title = listing.get('title', 'Unknown Title')
        
        # Skip if already processed
        if listing.get('llm_processed', False):
            continue
        
        if "detailed_description" in listing and listing["detailed_description"]:
            # Display nice separated headline
            separator_line = "-" * 70
            logger.info(f"{separator_line}")
            logger.info(f"Processing {title} ({processed_count+1}/{unprocessed_listings})")
            logger.info(f"{separator_line}")
            
            # Pass both title and description to the process_listing function
            chatgpt_results = process_listing(title, listing["detailed_description"])
            listing.update(chatgpt_results)
            processed_count += 1
            
            # Write the updated listings back to the file after each processing
            try:
                with open(input_file, 'w', encoding='utf-8') as f:
                    json.dump(listings, f, ensure_ascii=False, indent=4)
                
                logger.info(f"Updated listing saved to {input_file}: {title} (ID: {listing_id})")
            except Exception as e:
                logger.error(f"Error saving updates: {str(e)}")
                logger.info("Continuing with next listing...")
    
    logger.info(f"Processing completed. Processed {processed_count} out of {unprocessed_listings} unprocessed listings.")

if __name__ == "__main__":
    # Set up logging when run as a standalone script
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    input_file = os.path.join(data_dir, "listings.json")
    
    update_listings_with_chatgpt(input_file)