#!/usr/bin/env python3
"""
Migration script to fix API keys that were stored in old format.

This script detects API keys that are not properly Fernet-encrypted
and re-encrypts them using the correct encryption method.

Run this once if you see encrypted device names in the API or
if API keys are not working properly after encryption updates.
"""

import json
import base64
from encryption import encrypt_string, decrypt_string
from logger import info, error

def is_fernet_encrypted(value):
    """Check if a value is Fernet-encrypted by trying to decode it."""
    if not value:
        return False
    try:
        decoded = base64.b64decode(value)
        # Fernet tokens start with version byte 0x80 followed by timestamp
        # After base64 encoding, they typically start with 'gAAAAA' or similar
        return decoded.startswith(b'gAAAAA') or decoded[0:1] == b'\x80'
    except:
        return False

def migrate_api_keys():
    """Migrate API keys from old format to Fernet encryption."""
    info("Starting API key migration...")
    
    try:
        # Load devices
        with open('devices.json', 'r') as f:
            data = json.load(f)
        
        devices = data.get('devices', [])
        migrated_count = 0
        
        for device in devices:
            device_name = device.get('name', 'Unknown')
            api_key = device.get('api_key', '')
            
            if not api_key:
                continue
            
            # Check if already properly encrypted
            if is_fernet_encrypted(api_key):
                info(f"Device '{device_name}': API key already encrypted properly")
                continue
            
            # Try to decrypt first (in case it's partially encrypted)
            decrypted_key = decrypt_string(api_key)
            
            # If decryption didn't work, try base64 decode (old format)
            if decrypted_key == api_key:
                try:
                    decrypted_key = base64.b64decode(api_key).decode('utf-8')
                    info(f"Device '{device_name}': Detected old base64 format")
                except:
                    info(f"Device '{device_name}': Using key as-is")
            
            # Re-encrypt with Fernet
            encrypted_key = encrypt_string(decrypted_key)
            device['api_key'] = encrypted_key
            migrated_count += 1
            info(f"Device '{device_name}': Migrated to new encryption format")
        
        if migrated_count > 0:
            # Save updated devices
            with open('devices.json', 'w') as f:
                json.dump(data, f, indent=2)
            info(f"Migration complete: {migrated_count} device(s) updated")
            return True
        else:
            info("No migration needed - all API keys already in correct format")
            return True
            
    except Exception as e:
        error(f"Migration failed: {e}")
        return False

if __name__ == '__main__':
    print("=" * 60)
    print("API Key Migration Tool")
    print("=" * 60)
    success = migrate_api_keys()
    print("=" * 60)
    if success:
        print("✓ Migration completed successfully")
    else:
        print("✗ Migration failed - check logs for details")
    print("=" * 60)
