#!/usr/bin/env python3
import os
import json
import uuid
import hashlib
import secrets
import argparse
import getpass

# Path configurations
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")

# User roles
ROLE_ADMIN = "admin"

def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(8)
    hash_obj = hashlib.sha256((password + salt).encode())
    return hash_obj.hexdigest(), salt

def get_users():
    try:
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        # If file doesn't exist or is invalid, create a new one
        os.makedirs(DATA_DIR, exist_ok=True)
        return {"users": []}

def save_users(users_data):
    with open(USERS_FILE, 'w') as f:
        json.dump(users_data, f, indent=2)

def find_user(username, users_data):
    for user in users_data["users"]:
        if user["username"] == username:
            return user
    return None

def create_admin_user(username, password):
    users_data = get_users()
    
    # Check if user already exists
    existing_user = find_user(username, users_data)
    if existing_user:
        print(f"User '{username}' already exists.")
        if existing_user["role"] == ROLE_ADMIN:
            print(f"User '{username}' is already an admin.")
            return
        else:
            # Promote to admin
            existing_user["role"] = ROLE_ADMIN
            save_users(users_data)
            print(f"User '{username}' has been promoted to admin.")
            return
    
    # Create new admin user
    password_hash, salt = hash_password(password)
    
    new_user = {
        "id": str(uuid.uuid4()),
        "username": username,
        "password_hash": password_hash,
        "salt": salt,
        "role": ROLE_ADMIN
    }
    
    users_data["users"].append(new_user)
    save_users(users_data)
    
    print(f"Admin user '{username}' created successfully.")

def main():
    parser = argparse.ArgumentParser(description='Create an admin user for KleinanzeigenScraper')
    parser.add_argument('--username', '-u', help='Admin username')
    parser.add_argument('--password', '-p', help='Admin password (not recommended, use interactive mode instead)')
    
    args = parser.parse_args()
    
    username = args.username
    password = args.password
    
    # Interactive mode if username or password not provided
    if not username:
        username = input("Enter admin username: ")
    
    if not password:
        password = getpass.getpass("Enter admin password: ")
        password_confirm = getpass.getpass("Confirm admin password: ")
        
        if password != password_confirm:
            print("Passwords do not match. Exiting.")
            return
    
    create_admin_user(username, password)

if __name__ == "__main__":
    main() 