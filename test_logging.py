#!/usr/bin/env python3
"""
Test script for the centralized logging system
Tests rotating file handler and conditional logging
"""
import os
import json
from logger import debug, info, warning, error, exception
from config import DEBUG_LOG_FILE, SETTINGS_FILE, save_settings, load_settings

def test_logging_disabled():
    """Test that logging doesn't write when disabled"""
    print("=== Test 1: Logging Disabled (Default) ===")

    # Ensure debug logging is disabled
    settings = load_settings()
    settings['debug_logging'] = False
    save_settings(settings)

    # Delete log file if it exists
    if os.path.exists(DEBUG_LOG_FILE):
        os.remove(DEBUG_LOG_FILE)

    # Try to log
    debug("This should NOT appear in log file")
    info("This info should NOT appear either")

    # Check if log file was created
    if os.path.exists(DEBUG_LOG_FILE):
        print("❌ FAIL: Log file was created when logging disabled")
        with open(DEBUG_LOG_FILE, 'r') as f:
            print(f"Contents: {f.read()}")
    else:
        print("✅ PASS: Log file not created when logging disabled")

def test_logging_enabled():
    """Test that logging works when enabled"""
    print("\n=== Test 2: Logging Enabled ===")

    # Enable debug logging
    settings = load_settings()
    settings['debug_logging'] = True
    save_settings(settings)

    # Delete log file if it exists
    if os.path.exists(DEBUG_LOG_FILE):
        os.remove(DEBUG_LOG_FILE)

    # Log some messages
    debug("Debug message test")
    info("Info message test")
    warning("Warning message test")

    # Check if log file was created and has content
    if os.path.exists(DEBUG_LOG_FILE):
        with open(DEBUG_LOG_FILE, 'r') as f:
            content = f.read()
            if "Debug message test" in content and "Info message test" in content:
                print("✅ PASS: Log file created with expected content")
                print(f"\nLog content:\n{content}")
            else:
                print("❌ FAIL: Log file missing expected content")
                print(f"Contents: {content}")
    else:
        print("❌ FAIL: Log file not created when logging enabled")

def test_exception_logging():
    """Test exception logging with traceback"""
    print("\n=== Test 3: Exception Logging ===")

    # Ensure debug logging is enabled
    settings = load_settings()
    settings['debug_logging'] = True
    save_settings(settings)

    # Clear log file contents but keep it
    if os.path.exists(DEBUG_LOG_FILE):
        with open(DEBUG_LOG_FILE, 'w') as f:
            pass

    # Trigger an exception
    try:
        result = 1 / 0
    except Exception as e:
        exception("Division by zero occurred: %s", str(e))

    # Check if traceback is in log
    if os.path.exists(DEBUG_LOG_FILE):
        with open(DEBUG_LOG_FILE, 'r') as f:
            content = f.read()
            if "ZeroDivisionError" in content and "Traceback" in content:
                print("✅ PASS: Exception logged with traceback")
            else:
                print("❌ FAIL: Exception logged but missing traceback")
                print(f"Contents: {content}")
    else:
        print("❌ FAIL: Log file not created")

def test_log_rotation():
    """Test that log rotation configuration is correct"""
    print("\n=== Test 4: Log Rotation Configuration ===")

    from logger import get_logger
    logger = get_logger()

    # Check handler configuration
    if logger.handlers:
        handler = logger.handlers[0]
        from logging.handlers import RotatingFileHandler

        if isinstance(handler, RotatingFileHandler):
            max_bytes = handler.maxBytes
            backup_count = handler.backupCount

            if max_bytes == 10 * 1024 * 1024:  # 10MB
                print(f"✅ PASS: Max file size set to 10MB")
            else:
                print(f"❌ FAIL: Max file size is {max_bytes}, expected {10 * 1024 * 1024}")

            if backup_count == 5:
                print(f"✅ PASS: Backup count set to 5")
            else:
                print(f"❌ FAIL: Backup count is {backup_count}, expected 5")

            print(f"\nRotation Config:")
            print(f"  - Max file size: {max_bytes / (1024*1024):.1f}MB")
            print(f"  - Backup files: {backup_count}")
            print(f"  - Total max storage: {(max_bytes * (backup_count + 1)) / (1024*1024):.1f}MB")
        else:
            print("❌ FAIL: Handler is not RotatingFileHandler")
    else:
        print("❌ FAIL: No handlers configured")

def cleanup():
    """Clean up test artifacts"""
    print("\n=== Cleanup ===")

    # Restore default settings
    settings = load_settings()
    settings['debug_logging'] = False
    save_settings(settings)
    print("✅ Debug logging disabled (default)")

    # Optionally remove test log file
    # if os.path.exists(DEBUG_LOG_FILE):
    #     os.remove(DEBUG_LOG_FILE)
    #     print("✅ Test log file removed")

if __name__ == '__main__':
    print("Testing PANfm Centralized Logging System\n")

    test_logging_disabled()
    test_logging_enabled()
    test_exception_logging()
    test_log_rotation()
    cleanup()

    print("\n=== All Tests Complete ===")
