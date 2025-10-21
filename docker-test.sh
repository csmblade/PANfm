#!/bin/bash
# Docker deployment validation script for PANfm
# Tests that the Docker setup is functional

set -e  # Exit on error

echo "======================================"
echo "PANfm Docker Deployment Test"
echo "======================================"
echo ""

# Check if Docker is installed
echo "1. Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo "   ✗ Docker not found. Please install Docker first."
    exit 1
fi
echo "   ✓ Docker found: $(docker --version)"

# Check if docker-compose is installed
echo ""
echo "2. Checking docker-compose installation..."
if ! command -v docker-compose &> /dev/null; then
    echo "   ✗ docker-compose not found. Please install docker-compose first."
    exit 1
fi
echo "   ✓ docker-compose found: $(docker-compose --version)"

# Check if Dockerfile exists
echo ""
echo "3. Checking Dockerfile..."
if [ ! -f "Dockerfile" ]; then
    echo "   ✗ Dockerfile not found"
    exit 1
fi
echo "   ✓ Dockerfile exists"

# Check if docker-compose.yml exists
echo ""
echo "4. Checking docker-compose.yml..."
if [ ! -f "docker-compose.yml" ]; then
    echo "   ✗ docker-compose.yml not found"
    exit 1
fi
echo "   ✓ docker-compose.yml exists"

# Check if requirements.txt includes cryptography
echo ""
echo "5. Checking requirements.txt for cryptography..."
if ! grep -q "cryptography" requirements.txt; then
    echo "   ✗ cryptography not found in requirements.txt"
    exit 1
fi
echo "   ✓ cryptography dependency found"

# Build the Docker image
echo ""
echo "6. Building Docker image..."
if docker-compose build 2>&1 | tail -5; then
    echo "   ✓ Docker image built successfully"
else
    echo "   ✗ Docker build failed"
    exit 1
fi

# Check if the image was created
echo ""
echo "7. Verifying Docker image..."
if docker images | grep -q "panfm\|palo-alto"; then
    echo "   ✓ Docker image verified"
else
    echo "   ✗ Docker image not found"
    exit 1
fi

# Test container startup (non-blocking)
echo ""
echo "8. Testing container startup..."
echo "   Starting container in background..."
docker-compose up -d

# Wait for container to start
echo "   Waiting 10 seconds for application to initialize..."
sleep 10

# Check if container is running
echo ""
echo "9. Checking container status..."
if docker ps | grep -q "panfm"; then
    echo "   ✓ Container is running"
else
    echo "   ✗ Container is not running"
    docker-compose logs --tail=20
    docker-compose down
    exit 1
fi

# Check if application is responding
echo ""
echo "10. Testing application response..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "   ✓ Application is responding on port 3000"
else
    echo "   ✗ Application is not responding"
    echo "   Container logs:"
    docker-compose logs --tail=20
    docker-compose down
    exit 1
fi

# Check if encryption module is available in container
echo ""
echo "11. Testing encryption module in container..."
if docker-compose exec -T panfm python -c "from encryption import encrypt_string; print('OK')" 2>&1 | grep -q "OK"; then
    echo "   ✓ Encryption module available in container"
else
    echo "   ✗ Encryption module not available"
    docker-compose down
    exit 1
fi

# Stop the container
echo ""
echo "12. Stopping container..."
docker-compose down
echo "   ✓ Container stopped"

echo ""
echo "======================================"
echo "✓ All Docker deployment tests passed!"
echo "======================================"
echo ""
echo "To run the application with Docker:"
echo "  docker-compose up -d"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f"
echo ""
echo "To stop:"
echo "  docker-compose down"
echo ""
