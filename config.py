"""
Configuration constants and settings for the Palo Alto Firewall Dashboard
"""
import os
import json
from encryption import encrypt_dict, decrypt_dict, migrate_unencrypted_data

# Palo Alto Firewall Configuration (moved to settings)
# These are fallback defaults only
DEFAULT_FIREWALL_IP = "192.168.10.253"
DEFAULT_API_KEY = "LUFRPT1pZm4vZXZ6M21zTjUzSjZrR1NLNmFXVWI1QkE9SytjaEZHa2NEM0pCRDNSSTVyNHlMVFFFTmRrakFrL1dFamE5SGU1Z2EvRE8wbVBlWHM4SmxIQnl0TnltMTFHNQ=="

# File paths
DEBUG_LOG_FILE = os.path.join(os.path.dirname(__file__), 'debug.log')
SETTINGS_FILE = os.path.join(os.path.dirname(__file__), 'settings.json')
DEVICES_FILE = os.path.join(os.path.dirname(__file__), 'devices.json')

# Default settings
DEFAULT_SETTINGS = {
    'refresh_interval': 5,
    'match_count': 5,
    'top_apps_count': 5,
    'debug_logging': False,
    'selected_device_id': '',
    'monitored_interface': 'ethernet1/12'
}

# Lazy import to avoid circular dependency
def _get_logger():
    """Import logger functions lazily to avoid circular import"""
    from logger import debug, error, warning
    return debug, error, warning

def ensure_settings_file_exists():
    """Create settings.json if it doesn't exist"""
    if not os.path.exists(SETTINGS_FILE):
        # Create with default settings
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(DEFAULT_SETTINGS, f, indent=2)

def load_settings():
    """
    Load settings from file or return defaults.
    Automatically decrypts encrypted settings.

    Note: This function does NOT use logging to avoid circular dependencies
    since logger.is_debug_enabled() calls load_settings().
    """
    # Ensure file exists before loading
    ensure_settings_file_exists()

    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r') as f:
                encrypted_settings = json.load(f)

                # Decrypt all string values in settings
                settings = decrypt_dict(encrypted_settings)
                return settings

        return DEFAULT_SETTINGS.copy()
    except Exception:
        return DEFAULT_SETTINGS.copy()

def save_settings(settings):
    """
    Save settings to file with encryption.
    All string values are encrypted before saving.
    """
    debug, error, _ = _get_logger()
    debug("Saving settings to file")
    try:
        # Encrypt all string values in settings
        encrypted_settings = encrypt_dict(settings)
        debug(f"Encrypted {len(settings)} settings")

        with open(SETTINGS_FILE, 'w') as f:
            json.dump(encrypted_settings, f, indent=2)
            f.flush()
            os.fsync(f.fileno())

        debug("Settings saved successfully")
        return True
    except Exception as e:
        error(f"Failed to save settings: {e}")
        return False


def migrate_existing_settings():
    """
    Migrate existing unencrypted settings to encrypted format.
    This is a one-time operation for upgrading existing installations.
    """
    debug, error, _ = _get_logger()
    debug("Starting settings migration")
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)

            # Migrate and save encrypted settings
            encrypted_settings = migrate_unencrypted_data(settings)
            with open(SETTINGS_FILE, 'w') as f:
                json.dump(encrypted_settings, f, indent=2)
                f.flush()
                os.fsync(f.fileno())

            debug("Settings migration completed successfully")
            return True
        else:
            debug("No existing settings file to migrate")
            return True
    except Exception as e:
        error(f"Failed to migrate settings: {e}")
        return False
