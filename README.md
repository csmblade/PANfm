# PANfm - Palo Alto Networks Firewall Monitor

A real-time monitoring dashboard for Palo Alto Networks firewalls built with Flask and Chart.js.

**NEW**: All sensitive data (settings and device credentials) are now automatically encrypted at rest using Fernet encryption!

## Features

- **Multi-Device Management**: Monitor multiple Palo Alto firewalls from a single dashboard
- **Real-Time Throughput Monitoring**: View network traffic in Mbps with interactive charts
- **Threat Intelligence**: Track critical threats, medium threats, and blocked URLs
- **Session Monitoring**: Monitor active TCP, UDP, and ICMP sessions
- **System Resources**: Track CPU usage (data plane and management plane) and memory
- **Traffic Logs**: View and search through detailed traffic logs
- **System Logs**: Monitor system events and warnings
- **Security Policies**: View and manage security policy rules
- **Top Applications**: See which applications are consuming the most bandwidth
- **Per-Device Configuration**: Each device can monitor a different interface
- **Responsive UI**: Modern, gradient-based design with real-time updates

## Prerequisites

- Docker and Docker Compose (recommended)
- OR Python 3.9+ with pip

## Quick Start with Docker (Recommended)

### 1. Clone the Repository

\`\`\`bash
git clone <your-repo-url>
cd panfm
\`\`\`

### 2. Run Setup Script

**IMPORTANT**: Run this before starting Docker to avoid file/directory conflicts:

\`\`\`bash
./setup.sh
\`\`\`

This creates required files:
- `settings.json` - Application settings
- `devices.json` - Device configurations
- `encryption.key` - Encryption key for sensitive data
- `data/` - Data directory

### 3. Run with Docker Compose

\`\`\`bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
\`\`\`

The application will be available at http://localhost:3000

### Development Mode

The docker-compose.yml is configured for development:
- Your local code is mounted into the container as a volume
- Flask runs with auto-reload enabled
- Changes to your code are immediately reflected without rebuilding

\`\`\`bash
# Edit files locally - changes are live!
# Restart if needed:
docker-compose restart
\`\`\`

## Manual Installation (Without Docker)

### Option 1: Using the startup script (Recommended)

\`\`\`bash
chmod +x start.sh
./start.sh
\`\`\`

The startup script will automatically:
- Create a virtual environment if it doesn't exist
- Install all required dependencies (including cryptography)
- Start the application

### Option 2: Manual setup

1. Create and activate a virtual environment:
\`\`\`bash
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
# OR on Windows:
# venv\\Scripts\\activate
\`\`\`

2. Install dependencies:
\`\`\`bash
pip install -r requirements.txt
\`\`\`

3. Run the application:
\`\`\`bash
python app.py
\`\`\`

The application will be available at **http://localhost:3000** (note: port changed from 5000 to 3000)

## Configuration

### Adding Firewalls

1. Navigate to the **Devices** page in the web interface
2. Click "Add Device"
3. Enter the following information:
   - **Name**: A friendly name for the firewall
   - **IP Address**: The management IP of the firewall
   - **API Key**: The API key for authentication
   - **Group**: Organizational group (optional)
   - **Monitored Interface**: Which interface to monitor for throughput (e.g., ethernet1/12)
   - **Description**: Optional description

### Getting a Palo Alto API Key

\`\`\`bash
# Generate an API key via SSH or the web interface
curl -k 'https://<firewall-ip>/api/?type=keygen&user=<username>&password=<password>'
\`\`\`

### Settings

Access the Settings page to configure:

**General Tab:**
- **Refresh Interval**: How often to poll the firewall (seconds)
- **Match Count**: Number of threat/log entries to display
- **Top Apps Count**: Number of top applications to show
- **Monitored Interface**: Which firewall interface to monitor

**Debug Tab:**
- **Debug Logging**: Enable detailed logging for troubleshooting
  - Disabled by default
  - Logs stored in `debug.log` with automatic rotation (10MB max, 5 backups)
  - See [LOGGING_GUIDE.md](LOGGING_GUIDE.md) for details

## Security & Encryption

**All sensitive data is automatically encrypted at rest!**

### What's Encrypted

- **Settings file** (`settings.json`) - API keys, device IDs, monitored interfaces
- **Device credentials** (`devices.json`) - IP addresses, API keys, device names

### Encryption Details

- **Algorithm**: Fernet symmetric encryption (AES 128 CBC + HMAC authentication)
- **Key Storage**: `encryption.key` file (auto-generated on first run)
- **Transparency**: Encryption/decryption happens automatically - no manual steps needed

### Important: Encryption Key Backup

The `encryption.key` file is critical:
- ⚠️ **Backup this file securely** - losing it means losing access to all encrypted data
- Never commit it to version control (already in `.gitignore`)
- Store it in a secure location separate from the application

### Migrating from Older Versions

If upgrading from a version without encryption, run this once:

\`\`\`bash
source venv/bin/activate
python3 << 'EOF'
from config import migrate_existing_settings
from device_manager import device_manager

migrate_existing_settings()
device_manager.migrate_existing_devices()
print("✓ Migration complete - all data now encrypted")
EOF
\`\`\`

For more details, see [ENCRYPTION_GUIDE.md](ENCRYPTION_GUIDE.md)

## Docker Development Workflow

### Making Changes

1. **Edit Files**: Make changes to any Python, HTML, CSS, or JavaScript files locally
2. **Auto-Reload**: Flask will automatically detect changes and reload
3. **View Logs**: Run \`docker-compose logs -f\` to see application output

### Rebuilding the Image

Only needed if you change \`requirements.txt\` or \`Dockerfile\`:

\`\`\`bash
docker-compose down
docker-compose build
docker-compose up -d
\`\`\`

### Accessing the Container

\`\`\`bash
# Open a shell in the running container
docker-compose exec palo-alto-monitor bash

# View real-time logs
docker-compose logs -f
\`\`\`

### Data Persistence

The following directories/files are persisted using Docker volumes:
- \`./data/\` - Application data (devices, settings)
- \`devices.json\` - Device configurations
- \`settings.json\` - Application settings

## GitHub Repository Setup

### Initial Setup

\`\`\`bash
# Initialize git repository (if not already done)
git init

# Add files
git add .

# Create initial commit
git commit -m "Initial commit: Palo Alto Networks Firewall Monitor"

# Add remote repository
git remote add origin <your-github-repo-url>

# Push to GitHub
git push -u origin main
\`\`\`

### .gitignore

The repository includes a \`.gitignore\` file that excludes:
- Sensitive data (devices.json, settings.json, API keys)
- Debug logs
- Python cache files
- IDE settings
- OS-specific files

**Important**: Never commit sensitive data like API keys or device configurations to GitHub!

## Architecture

### Backend (Flask)
- **app.py**: Main Flask application with API endpoints
- RESTful API for all data operations
- Multi-device management with per-device statistics
- Async job-based log queries for better performance

### Frontend
- **templates/index.html**: Single-page application structure
- **static/app.js**: JavaScript application logic
- **Chart.js**: Real-time throughput visualization
- **Responsive design**: Works on desktop and mobile

### Data Storage
- **devices.json**: Device configurations (IP, API key, monitored interface)
- **settings.json**: Application settings (refresh interval, match count, etc.)
- **debug.log**: Debug logging (when enabled)

## Security Considerations

- API keys are stored locally (not in the container by default)
- SSL verification is disabled for self-signed certificates
- Consider using environment variables for sensitive data in production
- Run behind a reverse proxy (nginx) in production
- Use HTTPS for the web interface in production

## Troubleshooting

### Enable Debug Logging

1. Go to Settings page
2. Enable "Debug Logging"
3. Check \`debug.log\` file for detailed information

### Docker Issues

\`\`\`bash
# View container logs
docker-compose logs palo-alto-monitor

# Restart containers
docker-compose restart

# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
\`\`\`

## License

MIT License - Feel free to modify and distribute

---

Built with ❤️ for network security professionals
