#!/bin/bash
set -e

# Ensure the /app/data directory exists and has correct permissions
mkdir -p /app/data

# The encryption key will be automatically created by the Python app
# in /app/data/.encryption_key with proper permissions

# Execute the main application
exec python app.py
