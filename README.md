# PANfm: Palo Alto Networks - firewall monitor

A light weight real-time monitoring dashboard for Palo Alto Networks firewalls built with Flask and Chart.js.

## Features

- **Multi-Device Management**: Monitor multiple Palo Alto firewalls from a single dashboard
- **Real-Time Throughput Monitoring**: View network traffic in Mbps with interactive charts
- **Threat Intelligence**: Track critical threats, medium threats, and blocked URLs
- **Session Monitoring**: Monitor active TCP, UDP, and ICMP sessions
- **Traffic Logs**: View and search through detailed traffic logs
- **System Logs**: Monitor system events and warnings
- **Security Policies**: View and security policy rules
- **Top Applications**: See which applications are consuming the most bandwidth
- **Per-Device Configuration**: Each device can monitor a different interface
- **Responsive UI**: Modern, gradient-based design with real-time updates

## Prerequisites

- Docker and Docker Compose (recommended)
- OR Python 3.9+ with pip

## Quick Start with Docker (Recommended)

### 1. Clone the Repository


git clone https://github.com/csmblade/PANfm



### 2. Run with Docker Compose

To run the container:

docker-compose build

docker-compose up

The application will be available at http://localhost:8189



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

https://docs.paloaltonetworks.com/pan-os/11-0/pan-os-panorama-api/get-started-with-the-pan-os-xml-api/get-your-api-key


# Generate an API key via SSH or the web interface
curl -k 'https:///api/?type=keygen&user=<username>&password=<password>'

### Settings

Access the Settings page to configure:
- **Refresh Interval**: How often to poll the firewall (seconds)
- **Match Count**: Number of threat/log entries to display
- **Top Apps Count**: Number of top applications to show
- **Debug Logging**: Enable detailed logging for troubleshooting


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

- API keys are stored encrypted locally
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
docker-compose logs panfm

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
