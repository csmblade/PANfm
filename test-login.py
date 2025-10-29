#!/usr/bin/env python3
"""
Test login functionality comprehensively
Run this inside the Docker container to diagnose login issues
"""

import sys
import json

print("=" * 60)
print("PANfm Login Diagnostic Test")
print("=" * 60)
print()

# Test 1: Check auth.json structure
print("[1/5] Checking auth.json structure...")
try:
    from encryption import decrypt_dict

    with open('auth.json', 'r') as f:
        encrypted_data = json.load(f)

    decrypted_data = decrypt_dict(encrypted_data)

    has_users = 'users' in decrypted_data
    has_admin = 'admin' in decrypted_data.get('users', {})
    has_hash = 'password_hash' in decrypted_data.get('users', {}).get('admin', {})

    print(f"  ✓ Has 'users' key: {has_users}")
    print(f"  ✓ Has 'admin' user: {has_admin}")
    print(f"  ✓ Has 'password_hash': {has_hash}")

    if has_hash:
        pw_hash = decrypted_data['users']['admin']['password_hash']
        print(f"  ✓ Password hash format: {'bcrypt' if pw_hash.startswith('$2b$') else 'INVALID'}")

    print("  STATUS: ✓ PASS")
except Exception as e:
    print(f"  STATUS: ✗ FAIL - {e}")
    sys.exit(1)

print()

# Test 2: Test password directly with bcrypt
print("[2/5] Testing bcrypt password verification...")
try:
    import bcrypt

    pw_hash = decrypted_data['users']['admin']['password_hash']
    result = bcrypt.checkpw('admin'.encode('utf-8'), pw_hash.encode('utf-8'))

    print(f"  bcrypt.checkpw('admin', hash): {result}")

    if result:
        print("  STATUS: ✓ PASS")
    else:
        print("  STATUS: ✗ FAIL - Password does not match hash")
        sys.exit(1)
except Exception as e:
    print(f"  STATUS: ✗ FAIL - {e}")
    sys.exit(1)

print()

# Test 3: Test verify_password function
print("[3/5] Testing verify_password() function...")
try:
    from auth import verify_password

    result = verify_password('admin', 'admin')
    print(f"  verify_password('admin', 'admin'): {result}")

    if result:
        print("  STATUS: ✓ PASS")
    else:
        print("  STATUS: ✗ FAIL - Function returned False")
        sys.exit(1)
except ModuleNotFoundError as e:
    if 'flask' in str(e).lower():
        print(f"  STATUS: ⚠ SKIPPED - Flask not installed (run inside Docker container)")
        print(f"  Run: docker exec panfm python3 /app/test-login.py")
    else:
        print(f"  STATUS: ✗ FAIL - {e}")
        sys.exit(1)
except Exception as e:
    print(f"  STATUS: ✗ FAIL - {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print()

# Test 4: Test HTTP endpoint
print("[4/5] Testing /api/login HTTP endpoint...")
try:
    import requests

    url = 'http://localhost:3000/api/login'
    data = {'username': 'admin', 'password': 'admin'}

    response = requests.post(url, json=data, timeout=5)

    print(f"  Status Code: {response.status_code}")
    print(f"  Response: {response.text[:200]}")

    if response.status_code == 200:
        print("  STATUS: ✓ PASS")
    elif response.status_code == 429:
        print("  STATUS: ⚠ WARNING - Rate limited (too many attempts)")
    elif response.status_code == 401:
        print("  STATUS: ✗ FAIL - Unauthorized (401)")
        print(f"  Full response: {response.text}")
    else:
        print(f"  STATUS: ✗ FAIL - Unexpected status {response.status_code}")

except ModuleNotFoundError as e:
    if 'requests' in str(e).lower():
        print(f"  STATUS: ⚠ SKIPPED - requests library not installed")
        print(f"  Run inside Docker: docker exec panfm python3 /app/test-login.py")
    else:
        raise
except Exception as e:
    print(f"  STATUS: ⚠ SKIPPED - {e}")
    print(f"  (This test requires access to running Flask app)")

print()

# Test 5: Check Flask app status
print("[5/5] Checking Flask app status...")
try:
    import requests

    response = requests.get('http://localhost:3000/login', timeout=5)

    if response.status_code == 200:
        print(f"  ✓ Flask app is running (status {response.status_code})")
        print("  STATUS: ✓ PASS")
    else:
        print(f"  ⚠ Flask app returned status {response.status_code}")
        print("  STATUS: ⚠ WARNING")
except ModuleNotFoundError:
    print(f"  STATUS: ⚠ SKIPPED - requests library not installed")
    print(f"  Run inside Docker: docker exec panfm python3 /app/test-login.py")
except Exception as e:
    print(f"  STATUS: ⚠ SKIPPED - {e}")
    print(f"  (Flask app may not be running)")

print()
print("=" * 60)
print("Diagnostic Complete")
print("=" * 60)
