#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test script to verify password change enforcement on fresh install
This script tests the auth.json structure and password change flow
"""
import os
import sys
import json

# Fix Windows console encoding
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_auth_structure():
    """Test that auth.json is created with correct structure"""
    print("=" * 60)
    print("Testing Auth Structure for Password Change Enforcement")
    print("=" * 60)

    # Remove existing auth.json if it exists
    auth_file = 'auth.json'
    if os.path.exists(auth_file):
        print(f"\n1. Removing existing {auth_file}")
        os.remove(auth_file)
        print(f"   ✓ Removed {auth_file}")
    else:
        print(f"\n1. No existing {auth_file} found")

    # Import after cleanup
    from auth import init_auth_file, load_auth_data, verify_password, must_change_password, create_session
    from encryption import decrypt_dict

    # Initialize auth file
    print("\n2. Initializing auth file...")
    result = init_auth_file()
    if not result:
        print("   ✗ FAILED to initialize auth file")
        return False
    print("   ✓ Auth file initialized")

    # Check file exists
    print("\n3. Checking file exists...")
    if not os.path.exists(auth_file):
        print(f"   ✗ FAILED: {auth_file} was not created")
        return False
    print(f"   ✓ {auth_file} exists")

    # Load and decrypt auth data
    print("\n4. Loading auth data...")
    auth_data = load_auth_data()
    if not auth_data:
        print("   ✗ FAILED to load auth data")
        return False
    print("   ✓ Auth data loaded")

    # Check structure
    print("\n5. Checking auth data structure...")
    print(f"   Keys in auth_data: {list(auth_data.keys())}")

    if 'users' not in auth_data:
        print("   ✗ FAILED: 'users' key not found in auth_data")
        print(f"   Auth data structure: {json.dumps(auth_data, indent=2, default=str)}")
        return False
    print("   ✓ 'users' key exists")

    if 'admin' not in auth_data['users']:
        print("   ✗ FAILED: 'admin' user not found")
        return False
    print("   ✓ 'admin' user exists")

    admin_data = auth_data['users']['admin']
    if 'password_hash' not in admin_data:
        print("   ✗ FAILED: 'password_hash' not found in admin data")
        return False
    print("   ✓ 'password_hash' exists")

    if 'must_change_password' not in admin_data:
        print("   ✗ FAILED: 'must_change_password' not found in admin data")
        return False
    print("   ✓ 'must_change_password' exists")

    # Check must_change_password is True
    print("\n6. Checking must_change_password flag...")
    if admin_data['must_change_password'] != True:
        print(f"   ✗ FAILED: must_change_password is {admin_data['must_change_password']}, expected True")
        return False
    print("   ✓ must_change_password is True")

    # Test password verification
    print("\n7. Testing password verification...")
    if not verify_password('admin', 'admin'):
        print("   ✗ FAILED: Could not verify default password")
        return False
    print("   ✓ Default credentials (admin/admin) verified")

    # Test invalid password
    print("\n8. Testing invalid password rejection...")
    if verify_password('admin', 'wrongpassword'):
        print("   ✗ FAILED: Invalid password was accepted")
        return False
    print("   ✓ Invalid password correctly rejected")

    # Test must_change_password function
    print("\n9. Testing must_change_password() function...")
    # Create a session first
    from flask import Flask
    app = Flask(__name__)
    app.secret_key = 'test-secret-key'

    with app.test_request_context():
        create_session('admin')
        if not must_change_password():
            print("   ✗ FAILED: must_change_password() returned False, expected True")
            return False
        print("   ✓ must_change_password() correctly returns True")

    print("\n" + "=" * 60)
    print("✓ ALL TESTS PASSED")
    print("=" * 60)
    print("\nPassword change enforcement is working correctly!")
    print("When a user logs in with default credentials (admin/admin),")
    print("they should be redirected to Settings > Security tab.")
    return True

if __name__ == '__main__':
    try:
        success = test_auth_structure()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n✗ TEST FAILED WITH EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
