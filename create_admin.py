#!/usr/bin/env python3
"""
Create default admin account for PANfm
Run this script to reset admin credentials to admin/admin
"""
import json
import os
import bcrypt

# Use the same paths as the app
AUTH_FILE = 'auth.json'

def create_default_admin():
    """Create auth.json with default admin/admin credentials"""
    print("Creating default admin account...")

    # Hash the default password
    hashed_password = bcrypt.hashpw('admin'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    # Create auth data structure (same as auth.py)
    auth_data = {
        'users': {
            'admin': {
                'password_hash': hashed_password,
                'must_change_password': True
            }
        }
    }

    # Save to file (unencrypted - app will encrypt on first load)
    with open(AUTH_FILE, 'w') as f:
        json.dump(auth_data, f, indent=2)

    print(f"✓ Created {AUTH_FILE} with default credentials")
    print("  Username: admin")
    print("  Password: admin")
    print("  (Must be changed on first login)")
    print(f"\nFile size: {os.path.getsize(AUTH_FILE)} bytes")

    # Show what was created
    print("\nContents:")
    with open(AUTH_FILE, 'r') as f:
        content = f.read()
        # Show first 200 chars
        print(content[:200] + "..." if len(content) > 200 else content)

if __name__ == '__main__':
    try:
        create_default_admin()
    except Exception as e:
        print(f"Error: {e}")
        print("\nMake sure bcrypt is installed:")
        print("  pip install bcrypt")
