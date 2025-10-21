"""
Utility functions for API statistics tracking
Note: Debug logging has been moved to logger.py module
"""
import requests
import time
from logger import debug

# API call counter
api_call_count = 0
api_call_start_time = time.time()

# Backward compatibility - redirect to new logger
def log_debug(message):
    """
    Legacy function for backward compatibility.
    Redirects to new centralized logger.
    Use logger.debug() directly for new code.
    """
    debug(message)

def increment_api_call():
    """Increment the API call counter"""
    global api_call_count
    api_call_count += 1

def get_api_stats():
    """Get API call statistics"""
    global api_call_count, api_call_start_time
    uptime_seconds = time.time() - api_call_start_time
    calls_per_minute = (api_call_count / uptime_seconds) * 60 if uptime_seconds > 0 else 0
    return {
        'total_calls': api_call_count,
        'calls_per_minute': round(calls_per_minute, 1)
    }

def api_request_get(url, **kwargs):
    """Wrapper for requests.get that tracks API calls"""
    increment_api_call()
    return requests.get(url, **kwargs)
