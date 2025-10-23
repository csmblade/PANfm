"""
Utility functions for API statistics tracking
Note: Debug logging has been moved to logger.py module
"""
import requests
import time
import socket
from logger import debug, exception

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

def reverse_dns_lookup(ip_addresses, timeout=2):
    """
    Perform reverse DNS lookups on a list of IP addresses.

    Args:
        ip_addresses: List of IP addresses to lookup
        timeout: Timeout in seconds for each lookup (default: 2)

    Returns:
        Dictionary mapping IP addresses to hostnames (or IP if lookup fails)
    """
    debug("Starting reverse DNS lookup for %d IP addresses with timeout=%ds", len(ip_addresses), timeout)

    results = {}
    success_count = 0
    fail_count = 0

    # Set socket timeout
    original_timeout = socket.getdefaulttimeout()
    socket.setdefaulttimeout(timeout)

    try:
        for ip in ip_addresses:
            try:
                # Perform reverse DNS lookup
                hostname, _, _ = socket.gethostbyaddr(ip)
                results[ip] = hostname
                success_count += 1
                debug("Successfully resolved %s to %s", ip, hostname)
            except socket.herror:
                # DNS lookup failed - no PTR record
                results[ip] = ip
                fail_count += 1
                debug("No PTR record found for %s", ip)
            except socket.gaierror:
                # Address resolution error
                results[ip] = ip
                fail_count += 1
                debug("Address resolution error for %s", ip)
            except socket.timeout:
                # Lookup timed out
                results[ip] = ip
                fail_count += 1
                debug("DNS lookup timeout for %s", ip)
            except Exception as e:
                # Catch any other exceptions
                results[ip] = ip
                fail_count += 1
                exception("Unexpected error during DNS lookup for %s: %s", ip, str(e))
    finally:
        # Restore original timeout
        socket.setdefaulttimeout(original_timeout)

    debug("Reverse DNS lookup completed: %d successful, %d failed", success_count, fail_count)
    return results
