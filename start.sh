#!/bin/bash
# PANfm startup script
# Activates virtual environment and starts the application

# Change to script directory
cd "$(dirname "$0")"

# Check if venv exists, create if not
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install/update dependencies
echo "Installing dependencies..."
pip install -q -r requirements.txt

# Start the application
echo "Starting PANfm..."
python app.py
