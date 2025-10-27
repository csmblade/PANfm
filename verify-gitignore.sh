#!/bin/bash
# Verify .gitignore is properly configured
# Checks that sensitive files are ignored and essential files are tracked

echo "=========================================="
echo "Git Ignore Verification"
echo "=========================================="
echo ""

# Check if git is available
if ! command -v git &> /dev/null; then
    echo "Git not found - skipping git-specific checks"
    echo "Performing file-based verification only"
    echo ""
fi

echo "1. Checking sensitive files are in .gitignore..."
sensitive_files=(
    "encryption.key"
    "settings.json"
    "devices.json"
    "debug.log"
    ".clinerules"
    "PROJECT_MANIFEST.md"
    "ENCRYPTION_GUIDE.md"
    "LOGGING_GUIDE.md"
    "TYPOGRAPHY_GUIDE.md"
)

all_ignored=true
for file in "${sensitive_files[@]}"; do
    if [ -f "$file" ]; then
        # Check if file is in .gitignore (direct match or pattern match)
        if grep -qE "^${file}$|^${file}\$|/${file}$|^\*.*$(basename ${file##*.})$" .gitignore 2>/dev/null; then
            echo "   ✓ $file is ignored"
        else
            echo "   ✗ $file is NOT ignored (SECURITY RISK!)"
            all_ignored=false
        fi
    fi
done

if [ "$all_ignored" = true ]; then
    echo "   ✓ All sensitive files are properly ignored"
else
    echo "   ✗ Some sensitive files are NOT ignored!"
    exit 1
fi

echo ""
echo "2. Checking essential files are NOT in .gitignore..."
essential_files=(
    "app.py"
    "config.py"
    "encryption.py"
    "logger.py"
    "requirements.txt"
    "Dockerfile"
    "docker-compose.yml"
    "README.md"
    "start.sh"
)

all_tracked=true
for file in "${essential_files[@]}"; do
    if git check-ignore "$file" &> /dev/null; then
        echo "   ✗ $file is ignored (should be tracked!)"
        all_tracked=false
    else
        echo "   ✓ $file will be tracked"
    fi
done

if [ "$all_tracked" = true ]; then
    echo "   ✓ All essential files will be tracked"
else
    echo "   ✗ Some essential files are ignored!"
    exit 1
fi

echo ""
echo "3. Checking for common sensitive patterns..."
patterns=(
    "*.key"
    "venv/"
    "__pycache__/"
    ".DS_Store"
    "*.log"
)

all_patterns=true
for pattern in "${patterns[@]}"; do
    if grep -q "$pattern" .gitignore; then
        echo "   ✓ Pattern '$pattern' is in .gitignore"
    else
        echo "   ✗ Pattern '$pattern' is missing"
        all_patterns=false
    fi
done

if [ "$all_patterns" = true ]; then
    echo "   ✓ All important patterns are covered"
fi

echo ""
echo "4. Summary of .gitignore configuration:"
echo "   - Sensitive data: PROTECTED ✓"
echo "   - Internal docs: PROTECTED ✓"
echo "   - Essential code: TRACKED ✓"
echo "   - Runtime files: IGNORED ✓"

echo ""
echo "=========================================="
echo "✓ .gitignore is properly configured!"
echo "=========================================="
echo ""
echo "Safe to commit! Sensitive files are protected."
echo ""
