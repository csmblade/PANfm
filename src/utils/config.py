"""
Configuration and constants for PANfm application.
Centralizes all configuration values and file paths.
"""
import os
from typing import Dict, Any

# Base directories
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, 'data')

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# File paths
ENCRYPTION_KEY_FILE = os.path.join(DATA_DIR, '.encryption_key')
DEBUG_LOG_FILE = os.path.join(BASE_DIR, 'debug.log')
SETTINGS_FILE = os.path.join(BASE_DIR, 'settings.json')
DEVICES_FILE = os.path.join(BASE_DIR, 'devices.json')
CONNECTED_DEVICES_CACHE_FILE = os.path.join(DATA_DIR, 'connected_devices_cache.json')

# Default settings
DEFAULT_SETTINGS: Dict[str, Any] = {
    'refresh_interval': 30,
    'match_count': 5,
    'top_apps_count': 5,
    'debug_logging': False,
    'selected_device_id': ''
}

# Validation ranges
REFRESH_INTERVAL_MIN = 1
REFRESH_INTERVAL_MAX = 60
MATCH_COUNT_MIN = 1
MATCH_COUNT_MAX = 20
TOP_APPS_COUNT_MIN = 1
TOP_APPS_COUNT_MAX = 10

# Default device groups
DEFAULT_DEVICE_GROUPS = ["Headquarters", "Branch Offices", "DMZ", "Remote Sites"]

# Fallback Palo Alto credentials (for backward compatibility)
DEFAULT_FIREWALL_IP = "1.1.1.1"
DEFAULT_API_KEY = "123456"

# Server configuration
DEFAULT_HOST = '0.0.0.0'
DEFAULT_PORT = 8189
