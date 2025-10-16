"""
Settings management for PANfm application.
Handles loading and saving application configuration.
"""
import os
import json
from typing import Dict, Any
from .logger import PANfmLogger, get_logger
from .config import SETTINGS_FILE, DEFAULT_SETTINGS

logger = get_logger()


def load_settings() -> Dict[str, Any]:
    """
    Load settings from file or return defaults.

    Returns:
        Dictionary of settings
    """
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)

                # Merge with defaults to ensure all keys exist
                merged_settings = DEFAULT_SETTINGS.copy()
                merged_settings.update(settings)

                return merged_settings
        else:
            return DEFAULT_SETTINGS.copy()
    except (FileNotFoundError, json.JSONDecodeError, IOError) as e:
        logger.warning(f"Could not load settings: {e}, using defaults")
        return DEFAULT_SETTINGS.copy()


def save_settings(settings: Dict[str, Any]) -> bool:
    """
    Save settings to file and update logger settings.

    Args:
        settings: Dictionary of settings to save

    Returns:
        True if successful, False otherwise
    """
    try:
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(settings, f, indent=2)
            f.flush()
            os.fsync(f.fileno())

        # Update logger debug mode if setting changed
        debug_enabled = settings.get('debug_logging', False)
        PANfmLogger.set_debug(debug_enabled)

        logger.info(f"Settings saved successfully (debug_logging={debug_enabled})")
        return True
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")
        return False
