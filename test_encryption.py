#!/usr/bin/env python3
"""
Test suite for encryption functionality in PANfm.
Tests encryption/decryption of strings and dictionaries.
"""

import os
import sys
from encryption import (
    encrypt_string, decrypt_string,
    encrypt_dict, decrypt_dict,
    is_encrypted, migrate_unencrypted_data,
    KEY_FILE
)


def test_string_encryption():
    """Test basic string encryption and decryption"""
    print("Testing string encryption...")

    test_cases = [
        "simple_string",
        "API_KEY_12345678",
        "192.168.1.1",
        "special!@#$%^&*()chars",
        "unicode_test_™®©",
        ""  # Empty string
    ]

    for original in test_cases:
        encrypted = encrypt_string(original)
        decrypted = decrypt_string(encrypted)

        if decrypted == original:
            print(f"  ✓ '{original}' encrypted/decrypted successfully")
        else:
            print(f"  ✗ FAILED: '{original}' -> '{decrypted}'")
            return False

    print("  ✓ String encryption tests passed\n")
    return True


def test_dict_encryption():
    """Test dictionary encryption with various data types"""
    print("Testing dictionary encryption...")

    original_data = {
        "string_value": "test_string",
        "api_key": "LUFRPT1pZm4vZXZ6M21zTjUzSjZrR1NL",
        "number_value": 42,
        "float_value": 3.14159,
        "bool_true": True,
        "bool_false": False,
        "null_value": None,
        "empty_string": "",
        "nested_dict": {
            "inner_string": "nested_test",
            "inner_number": 100
        },
        "array_strings": ["item1", "item2", "item3"],
        "array_mixed": ["string", 123, True, None]
    }

    # Encrypt the dictionary
    encrypted_data = encrypt_dict(original_data)

    # Verify strings are encrypted, non-strings are unchanged
    checks = {
        "string_value should be encrypted": encrypted_data["string_value"] != original_data["string_value"],
        "api_key should be encrypted": encrypted_data["api_key"] != original_data["api_key"],
        "number_value should be unchanged": encrypted_data["number_value"] == 42,
        "float_value should be unchanged": encrypted_data["float_value"] == 3.14159,
        "bool_true should be unchanged": encrypted_data["bool_true"] is True,
        "bool_false should be unchanged": encrypted_data["bool_false"] is False,
        "null_value should be unchanged": encrypted_data["null_value"] is None,
        "nested string should be encrypted": encrypted_data["nested_dict"]["inner_string"] != "nested_test",
        "nested number should be unchanged": encrypted_data["nested_dict"]["inner_number"] == 100,
        "array strings should be encrypted": encrypted_data["array_strings"][0] != "item1",
        "array number should be unchanged": encrypted_data["array_mixed"][1] == 123,
    }

    for check_name, result in checks.items():
        if result:
            print(f"  ✓ {check_name}")
        else:
            print(f"  ✗ FAILED: {check_name}")
            return False

    # Decrypt and verify we get back the original
    decrypted_data = decrypt_dict(encrypted_data)

    if decrypted_data == original_data:
        print("  ✓ Decrypted data matches original")
    else:
        print("  ✗ FAILED: Decrypted data doesn't match original")
        print(f"    Original: {original_data}")
        print(f"    Decrypted: {decrypted_data}")
        return False

    print("  ✓ Dictionary encryption tests passed\n")
    return True


def test_is_encrypted():
    """Test the is_encrypted helper function"""
    print("Testing is_encrypted function...")

    plaintext = "this is plaintext"
    encrypted = encrypt_string(plaintext)

    checks = {
        "plaintext should not appear encrypted": not is_encrypted(plaintext),
        "encrypted value should appear encrypted": is_encrypted(encrypted),
        "empty string should not appear encrypted": not is_encrypted(""),
        "number should not appear encrypted": not is_encrypted(123),
        "short string should not appear encrypted": not is_encrypted("abc"),
    }

    for check_name, result in checks.items():
        if result:
            print(f"  ✓ {check_name}")
        else:
            print(f"  ✗ FAILED: {check_name}")
            return False

    print("  ✓ is_encrypted tests passed\n")
    return True


def test_migration():
    """Test migration of unencrypted data"""
    print("Testing data migration...")

    # Unencrypted data
    unencrypted_data = {
        "api_key": "plaintext_api_key",
        "password": "plaintext_password",
        "refresh_interval": 5
    }

    # Migrate data
    migrated_data = migrate_unencrypted_data(unencrypted_data)

    # Verify strings are now encrypted
    checks = {
        "api_key should be encrypted": migrated_data["api_key"] != "plaintext_api_key",
        "password should be encrypted": migrated_data["password"] != "plaintext_password",
        "refresh_interval should be unchanged": migrated_data["refresh_interval"] == 5,
    }

    for check_name, result in checks.items():
        if result:
            print(f"  ✓ {check_name}")
        else:
            print(f"  ✗ FAILED: {check_name}")
            return False

    # Verify we can decrypt the migrated data
    decrypted_data = decrypt_dict(migrated_data)

    if decrypted_data == unencrypted_data:
        print("  ✓ Migrated data can be decrypted to original")
    else:
        print("  ✗ FAILED: Decrypted migrated data doesn't match original")
        return False

    # Test migration of already-encrypted data (should not re-encrypt)
    already_encrypted = migrate_unencrypted_data(migrated_data)

    if already_encrypted == migrated_data:
        print("  ✓ Migration of already-encrypted data is idempotent")
    else:
        print("  ✗ FAILED: Re-migration changed the data")
        return False

    print("  ✓ Migration tests passed\n")
    return True


def test_key_generation():
    """Test encryption key generation and loading"""
    print("Testing key generation...")

    # Import to trigger key generation if needed
    from encryption import load_key
    load_key()  # Ensure key is generated

    # Key should exist now
    if os.path.exists(KEY_FILE):
        print(f"  ✓ Encryption key file exists at {KEY_FILE}")
    else:
        print(f"  ✗ FAILED: Encryption key file not found at {KEY_FILE}")
        return False

    # Key should be readable
    try:
        with open(KEY_FILE, 'rb') as f:
            key = f.read()
        if len(key) > 0:
            print(f"  ✓ Encryption key is readable ({len(key)} bytes)")
        else:
            print("  ✗ FAILED: Encryption key is empty")
            return False
    except Exception as e:
        print(f"  ✗ FAILED: Cannot read encryption key: {e}")
        return False

    print("  ✓ Key generation tests passed\n")
    return True


def test_edge_cases():
    """Test edge cases and error handling"""
    print("Testing edge cases...")

    # Test with None
    try:
        result = encrypt_string(None)
        if result == "":
            print("  ✓ encrypt_string(None) returns empty string")
        else:
            print(f"  ✗ FAILED: encrypt_string(None) returned '{result}'")
            return False
    except Exception as e:
        print(f"  ✗ FAILED: encrypt_string(None) raised exception: {e}")
        return False

    # Test decrypt with invalid data
    try:
        result = decrypt_string("invalid_encrypted_data")
        if result == "":
            print("  ✓ decrypt_string with invalid data returns empty string")
        else:
            print(f"  ✗ FAILED: decrypt_string with invalid data returned '{result}'")
            return False
    except Exception:
        # Should handle exception gracefully
        print("  ✗ FAILED: decrypt_string with invalid data raised exception")
        return False

    # Test with very long string
    long_string = "A" * 10000
    encrypted_long = encrypt_string(long_string)
    decrypted_long = decrypt_string(encrypted_long)
    if decrypted_long == long_string:
        print("  ✓ Long string encryption/decryption works")
    else:
        print("  ✗ FAILED: Long string encryption/decryption failed")
        return False

    print("  ✓ Edge case tests passed\n")
    return True


def main():
    """Run all encryption tests"""
    print("=" * 60)
    print("PANfm Encryption Test Suite")
    print("=" * 60)
    print()

    tests = [
        test_key_generation,
        test_string_encryption,
        test_dict_encryption,
        test_is_encrypted,
        test_migration,
        test_edge_cases,
    ]

    passed = 0
    failed = 0

    for test_func in tests:
        try:
            if test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  ✗ EXCEPTION: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print("=" * 60)
    print(f"Test Results: {passed} passed, {failed} failed")
    print("=" * 60)

    if failed == 0:
        print("\n✓ All encryption tests passed successfully!")
        return 0
    else:
        print(f"\n✗ {failed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
