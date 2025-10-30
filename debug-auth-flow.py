#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Debug script to trace the auth flow and password change enforcement
Run this to see what's happening when a user logs in
"""
import sys
import os

# Fix Windows console encoding
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def debug_auth_flow():
    """Debug the authentication flow"""
    print("=" * 70)
    print("PANfm Authentication Flow Debug")
    print("=" * 70)

    # Step 1: Check if auth.json exists
    print("\n1. Checking auth.json file...")
    auth_file = 'auth.json'
    if os.path.exists(auth_file):
        print(f"   ✓ {auth_file} exists")
        file_size = os.path.getsize(auth_file)
        print(f"   File size: {file_size} bytes")

        if file_size == 0:
            print("   ⚠ WARNING: auth.json is empty!")
            print("   The app will initialize it on startup")
    else:
        print(f"   ✗ {auth_file} does not exist")
        print("   The app will create it on first startup with init_auth_file()")

    # Step 2: Try to load auth module (requires dependencies)
    print("\n2. Loading auth module...")
    try:
        from auth import load_auth_data, must_change_password, verify_password
        from flask import Flask
        print("   ✓ Auth module loaded successfully")

        # Step 3: Load auth data
        print("\n3. Loading auth data...")
        auth_data = load_auth_data()

        if not auth_data:
            print("   ✗ Failed to load auth data")
            print("   This means auth.json is corrupted or missing")
            return False

        print("   ✓ Auth data loaded")
        print(f"   Structure: {list(auth_data.keys())}")

        # Step 4: Check structure
        print("\n4. Validating auth data structure...")
        if 'users' not in auth_data:
            print("   ✗ CRITICAL: 'users' key not found!")
            print(f"   Keys found: {list(auth_data.keys())}")
            print("   This is the BUG - init_auth_file() created wrong structure")
            return False

        print("   ✓ 'users' key exists")

        if 'admin' not in auth_data['users']:
            print("   ✗ 'admin' user not found")
            return False

        print("   ✓ 'admin' user exists")

        admin_data = auth_data['users']['admin']
        print(f"   Admin user keys: {list(admin_data.keys())}")

        # Step 5: Check must_change_password flag
        print("\n5. Checking must_change_password flag...")
        if 'must_change_password' not in admin_data:
            print("   ✗ 'must_change_password' key not found")
            return False

        flag_value = admin_data['must_change_password']
        print(f"   ✓ must_change_password = {flag_value}")

        if flag_value != True:
            print(f"   ⚠ WARNING: Expected True, got {flag_value}")
            print("   Password change will NOT be enforced!")
        else:
            print("   ✓ Password change WILL be enforced")

        # Step 6: Test verify_password
        print("\n6. Testing password verification...")
        if verify_password('admin', 'admin'):
            print("   ✓ Default credentials (admin/admin) work")
        else:
            print("   ✗ Default credentials failed")
            return False

        # Step 7: Test must_change_password() function
        print("\n7. Testing must_change_password() function...")
        app = Flask(__name__)
        app.secret_key = 'test-secret-key'

        with app.test_request_context():
            from auth import create_session
            create_session('admin')

            result = must_change_password()
            print(f"   must_change_password() returned: {result}")

            if result:
                print("   ✓ Password change enforcement is ACTIVE")
                print("   Backend will return must_change_password: true")
            else:
                print("   ✗ Password change enforcement is DISABLED")
                print("   Backend will NOT return must_change_password: true")
                print("   User will NOT be prompted to change password!")

        # Summary
        print("\n" + "=" * 70)
        if flag_value and result:
            print("✓ AUTHENTICATION FLOW IS CORRECT")
            print("=" * 70)
            print("\nExpected behavior on login:")
            print("1. User logs in with admin/admin")
            print("2. Backend returns: {'status': 'success', 'must_change_password': true}")
            print("3. Frontend redirects to: /?must_change_password=true")
            print("4. Settings page opens with Security tab")
            print("5. Warning banner appears")
        else:
            print("✗ AUTHENTICATION FLOW HAS ISSUES")
            print("=" * 70)
            print("\nPassword change enforcement will NOT work!")

        return True

    except ImportError as e:
        print(f"   ✗ Cannot import auth module: {e}")
        print("   This script needs Flask, bcrypt, and cryptography installed")
        print("\n   Run with dependencies:")
        print("   pip install flask bcrypt cryptography")
        print("   OR use Docker container:")
        print("   docker exec -it panfm python debug-auth-flow.py")
        return False
    except Exception as e:
        print(f"   ✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    try:
        success = debug_auth_flow()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n✗ DEBUG FAILED: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
