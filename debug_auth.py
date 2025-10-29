#!/usr/bin/env python3
"""
Debug authentication issues for PANfm
Run this to check why login isn't working
"""
import json
import os
import sys

AUTH_FILE = 'auth.json'
ENCRYPTION_KEY_FILE = 'encryption.key'

def check_files():
    """Check if required files exist and have content"""
    print("=== Checking Authentication Files ===\n")

    # Check auth.json
    if not os.path.exists(AUTH_FILE):
        print(f"❌ {AUTH_FILE} does NOT exist")
        print(f"   Run: python create_admin.py")
        return False
    else:
        size = os.path.getsize(AUTH_FILE)
        print(f"✓ {AUTH_FILE} exists ({size} bytes)")

        if size == 0:
            print(f"   ❌ File is EMPTY!")
            print(f"   Run: python create_admin.py")
            return False

        # Try to parse it
        try:
            with open(AUTH_FILE, 'r') as f:
                data = json.load(f)

            print(f"   ✓ Valid JSON")

            # Check structure
            if 'users' in data:
                print(f"   ✓ Has 'users' key")
                if 'admin' in data['users']:
                    print(f"   ✓ Has 'admin' user")
                    if 'password_hash' in data['users']['admin']:
                        hash_val = data['users']['admin']['password_hash']
                        print(f"   ✓ Has password_hash ({len(hash_val)} chars)")

                        # Check if it looks like bcrypt
                        if hash_val.startswith('$2b$') or hash_val.startswith('$2a$'):
                            print(f"   ✓ Looks like bcrypt hash")
                        else:
                            print(f"   ❌ NOT a bcrypt hash!")
                            print(f"   Run: python create_admin.py")
                            return False
                    else:
                        print(f"   ❌ Missing password_hash")
                        return False
                else:
                    print(f"   ❌ No 'admin' user found")
                    return False
            else:
                print(f"   ❌ Missing 'users' key - file might be encrypted")
                print(f"   This is OK if file was created by app")
                print(f"   Try checking encryption.key")
        except json.JSONDecodeError as e:
            print(f"   ❌ Invalid JSON: {e}")
            print(f"   Run: python create_admin.py")
            return False

    print()

    # Check encryption.key
    if not os.path.exists(ENCRYPTION_KEY_FILE):
        print(f"❌ {ENCRYPTION_KEY_FILE} does NOT exist")
        print(f"   Run: ./setup.sh")
        return False
    else:
        size = os.path.getsize(ENCRYPTION_KEY_FILE)
        print(f"✓ {ENCRYPTION_KEY_FILE} exists ({size} bytes)")

        if size == 0:
            print(f"   ❌ File is EMPTY!")
            print(f"   Run: ./setup.sh")
            return False
        else:
            print(f"   ✓ Has content")

    print()
    return True

def main():
    print("PANfm Authentication Debugger\n")

    if check_files():
        print("=== Summary ===")
        print("✓ All required files exist and look correct")
        print("\nIf login still fails:")
        print("1. Check Docker logs: docker-compose logs panfm")
        print("2. Enable debug logging in Settings")
        print("3. Check debug.log file")
        print("\nDefault credentials:")
        print("  Username: admin")
        print("  Password: admin")
    else:
        print("\n=== Summary ===")
        print("❌ Found issues with authentication files")
        print("\nTo fix:")
        print("1. Run: python create_admin.py")
        print("2. Restart: docker-compose restart panfm")
        print("3. Try login with admin/admin")

if __name__ == '__main__':
    main()
