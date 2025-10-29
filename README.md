# PANfm - Palo Alto Networks Firewall Monitor

![Version](https://img.shields.io/badge/Version-1.5.1-brightgreen?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.9+-blue?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-Web_Framework-black?style=for-the-badge&logo=flask&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)
![Visitors](https://api.visitorbadge.io/api/visitors?path=csmblade%2Fpanfm&countColor=%23FA582D&style=for-the-badge&labelStyle=upper)

A real-time monitoring dashboard for Palo Alto Networks firewalls with automated PAN-OS upgrades, content management, and multi-device support.

## Quick Start

### Prerequisites
- Docker and Docker Compose

### Deploy with Docker

```bash
# Clone the repository
git clone <your-repo-url>
cd panfm

# First-time setup: Create required files
./setup.sh

# Start the application
docker-compose up -d

# View logs
docker-compose logs -f
```

**Note:** The `setup.sh` script creates:
- `settings.json` - Default application settings
- `devices.json` - Empty device list
- `encryption.key` - Encryption key for sensitive data
- `data/` - Data directory

The dashboard will be available at **http://localhost:3000**

### First Login

**Default Credentials:**
- Username: `admin`
- Password: `admin`

**IMPORTANT:** You will be required to change the default password on first login.

## Updating the Application

When you update the code (git pull), restart the Docker container:

```bash
# Quick restart (preserves data)
docker-compose restart

# Full rebuild (if dependencies changed)
docker-compose down
docker-compose up -d --build
```

### Windows Users

Use the provided batch scripts for convenience:

```cmd
quick-restart.bat      # Quick restart (keeps data)
restart-docker.bat     # Full restart (clears volumes)
```

## Data Persistence

The following data persists across container restarts:
- `encryption.key` - Encryption key (DO NOT LOSE THIS)
- `settings.json` - Application settings (encrypted)
- `devices.json` - Firewall device configurations (encrypted)
- `auth.json` - User authentication data (encrypted)

**IMPORTANT:** Backup `encryption.key` securely. Losing it means losing access to all encrypted data.

## Features

- Multi-device firewall monitoring
- Real-time throughput and system metrics
- Automated PAN-OS upgrades
- Content update management
- Traffic and threat log analysis
- Connected devices tracking
- Security policy management
- All sensitive data encrypted at rest

## Support

For issues or questions, check the application logs:

```bash
docker-compose logs -f
```

Enable debug logging in the Settings page for detailed troubleshooting.

---

Built for network security professionals
