#!/bin/bash
# CLI (Python3) deployment validation script for PANfm
# Tests that the CLI setup is functional

set -e  # Exit on error

echo "======================================"
echo "PANfm CLI Deployment Test"
echo "======================================"
echo ""

# Check if Python3 is installed
echo "1. Checking Python3 installation..."
if ! command -v python3 &> /dev/null; then
    echo "   ✗ Python3 not found. Please install Python3 first."
    exit 1
fi
echo "   ✓ Python3 found: $(python3 --version)"

# Check Python version (3.9+)
echo ""
echo "2. Checking Python version..."
python_version=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
major=$(echo "$python_version" | cut -d. -f1)
minor=$(echo "$python_version" | cut -d. -f2)
if [ "$major" -lt 3 ] || ([ "$major" -eq 3 ] && [ "$minor" -lt 9 ]); then
    echo "   ✗ Python 3.9+ required (found $python_version)"
    exit 1
fi
echo "   ✓ Python version $python_version is compatible"

# Check if venv module is available
echo ""
echo "3. Checking venv module..."
if ! python3 -m venv --help > /dev/null 2>&1; then
    echo "   ✗ venv module not available"
    exit 1
fi
echo "   ✓ venv module available"

# Check if requirements.txt exists
echo ""
echo "4. Checking requirements.txt..."
if [ ! -f "requirements.txt" ]; then
    echo "   ✗ requirements.txt not found"
    exit 1
fi
echo "   ✓ requirements.txt exists"

# Check if requirements.txt includes cryptography
echo ""
echo "5. Checking requirements.txt for cryptography..."
if ! grep -q "cryptography" requirements.txt; then
    echo "   ✗ cryptography not found in requirements.txt"
    exit 1
fi
echo "   ✓ cryptography dependency found"

# Check if start.sh exists
echo ""
echo "6. Checking start.sh script..."
if [ ! -f "start.sh" ]; then
    echo "   ✗ start.sh not found"
    exit 1
fi
if [ ! -x "start.sh" ]; then
    echo "   ✗ start.sh is not executable"
    chmod +x start.sh
    echo "   ✓ Made start.sh executable"
fi
echo "   ✓ start.sh exists and is executable"

# Create/verify virtual environment
echo ""
echo "7. Setting up virtual environment..."
if [ ! -d "venv" ]; then
    echo "   Creating virtual environment..."
    python3 -m venv venv
    echo "   ✓ Virtual environment created"
else
    echo "   ✓ Virtual environment already exists"
fi

# Activate virtual environment
echo ""
echo "8. Activating virtual environment..."
source venv/bin/activate
echo "   ✓ Virtual environment activated"

# Install dependencies
echo ""
echo "9. Installing dependencies..."
pip install -q -r requirements.txt
echo "   ✓ Dependencies installed"

# Test encryption module import
echo ""
echo "10. Testing encryption module..."
if python -c "from encryption import encrypt_string; print('OK')" 2>&1 | grep -q "OK"; then
    echo "   ✓ Encryption module works"
else
    echo "   ✗ Encryption module failed"
    exit 1
fi

# Test config module import
echo ""
echo "11. Testing config module..."
if python -c "from config import load_settings; print('OK')" 2>&1 | grep -q "OK"; then
    echo "   ✓ Config module works"
else
    echo "   ✗ Config module failed"
    exit 1
fi

# Test logger module import
echo ""
echo "12. Testing logger module..."
if python -c "from logger import debug; print('OK')" 2>&1 | grep -q "OK"; then
    echo "   ✓ Logger module works"
else
    echo "   ✗ Logger module failed"
    exit 1
fi

# Test device_manager module import
echo ""
echo "13. Testing device_manager module..."
if python -c "from device_manager import device_manager; print('OK')" 2>&1 | grep -q "OK"; then
    echo "   ✓ Device manager module works"
else
    echo "   ✗ Device manager module failed"
    exit 1
fi

# Test full app import
echo ""
echo "14. Testing full application import..."
if python -c "import app; print('OK')" 2>&1 | grep -q "OK"; then
    echo "   ✓ Application imports successfully"
else
    echo "   ✗ Application import failed"
    exit 1
fi

# Test encryption functionality
echo ""
echo "15. Testing encryption functionality..."
python << 'EOF'
from encryption import encrypt_string, decrypt_string

original = "test_value_123"
encrypted = encrypt_string(original)
decrypted = decrypt_string(encrypted)

if decrypted == original:
    print("   ✓ Encryption/decryption works")
else:
    print("   ✗ Encryption/decryption failed")
    exit(1)
EOF

# Test settings encryption
echo ""
echo "16. Testing settings encryption..."
python << 'EOF'
from config import load_settings, save_settings
import os

# Load or create settings
settings = load_settings()
test_value = "test_encrypted_value"
settings['test_key'] = test_value

# Save (should encrypt)
if save_settings(settings):
    # Load again (should decrypt)
    loaded = load_settings()
    if loaded.get('test_key') == test_value:
        print("   ✓ Settings encryption works")
        # Clean up test key
        del loaded['test_key']
        save_settings(loaded)
    else:
        print("   ✗ Settings decryption failed")
        exit(1)
else:
    print("   ✗ Settings save failed")
    exit(1)
EOF

# Check if encryption.key was created
echo ""
echo "17. Verifying encryption key..."
if [ -f "encryption.key" ]; then
    echo "   ✓ Encryption key exists"
else
    echo "   ✗ Encryption key not created"
    exit 1
fi

echo ""
echo "======================================"
echo "✓ All CLI deployment tests passed!"
echo "======================================"
echo ""
echo "To run the application:"
echo "  ./start.sh"
echo ""
echo "Or manually:"
echo "  source venv/bin/activate"
echo "  python app.py"
echo ""
echo "Then access: http://localhost:3000"
echo ""
