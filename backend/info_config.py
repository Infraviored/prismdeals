# Configuration file for information of interest in laptop listings

# Define the information of interest for laptop listings
INFO_OF_INTEREST = {
    "RAM_more": {
        "true": "RAM is 32GB or more",
        "false": "RAM is less than 32GB",
        "unknown": "RAM size is unknown"
    },
    "screen_small": {
        "true": "Screen size is 14 inches or smaller",
        "false": "Screen size is larger than 14 inches",
        "unknown": "Screen size is unknown"
    },
    "screen_highres": {
        "true": "Screen has high resolution (1440p or higher)",
        "false": "Screen has standard resolution (1080p or lower)",
        "unknown": "Screen resolution is unknown"
    }
}

def get_info_description(info_type, value):
    """Get a human-readable description of an information value."""
    if info_type in INFO_OF_INTEREST and value in INFO_OF_INTEREST[info_type]:
        return INFO_OF_INTEREST[info_type][value]
    return f"Unknown value '{value}' for info type '{info_type}'"

def generate_combinations():
    """Generate all possible combinations of information values."""
    # Define possible values for each information type
    values = ["true", "false", "unknown"]
    
    # Start with an empty combination
    combinations = [{}]
    
    # For each information type, create new combinations with each possible value
    for info_type in INFO_OF_INTEREST.keys():
        new_combinations = []
        for combo in combinations:
            for value in values:
                new_combo = combo.copy()
                new_combo[info_type] = value
                new_combinations.append(new_combo)
        combinations = new_combinations
    
    return combinations