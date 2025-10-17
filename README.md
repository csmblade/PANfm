# PANfm: Palo Alto Networks - firewall monitor

A light weight real-time monitoring dashboard for a small number of Palo Alto Networks firewalls in a home lab or simlar.

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

## Additional Notes: 
- This is a POC designed by a human but coded with AI agents. 
- There is currently no authentication for the project, that will be added later
- Create a read-only user on the firewall with enough permission to read data.

## License

MIT License - Feel free to modify and distribute

---

Built with ❤️ for network security professionals
