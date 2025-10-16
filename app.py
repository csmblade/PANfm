from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import requests
import urllib3
from datetime import datetime
import xml.etree.ElementTree as ET
import time
import os
import json
from cryptography.fernet import Fernet
import threading
import sys

# Add src directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
from utils.logger import PANfmLogger

# Disable SSL warnings for self-signed certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)
CORS(app)

# Initialize logger
logger = PANfmLogger.setup(debug=os.environ.get('DEBUG_LOGGING', 'False').lower() == 'true',
                            log_file='debug.log')

# ============================================================================
# Encryption Configuration
# ============================================================================

# Path to encryption key file - store in data directory for persistence
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
ENCRYPTION_KEY_FILE = os.path.join(DATA_DIR, '.encryption_key')

def get_or_create_encryption_key():
    """Get or create encryption key for securing sensitive data"""
    # Ensure data directory exists
    os.makedirs(DATA_DIR, exist_ok=True)

    if os.path.exists(ENCRYPTION_KEY_FILE):
        with open(ENCRYPTION_KEY_FILE, 'rb') as f:
            return f.read()
    else:
        # Generate a new key
        key = Fernet.generate_key()
        with open(ENCRYPTION_KEY_FILE, 'wb') as f:
            f.write(key)
        # Set file permissions to be readable only by owner
        os.chmod(ENCRYPTION_KEY_FILE, 0o600)
        return key

# Initialize encryption cipher
encryption_key = get_or_create_encryption_key()
cipher_suite = Fernet(encryption_key)

def encrypt_value(value):
    """Encrypt a string value"""
    if not value:
        return ""
    try:
        encrypted = cipher_suite.encrypt(value.encode())
        return encrypted.decode()
    except Exception as e:
        log_debug(f"Encryption error: {e}")
        return value

def decrypt_value(encrypted_value):
    """Decrypt a string value"""
    if not encrypted_value:
        return ""
    try:
        decrypted = cipher_suite.decrypt(encrypted_value.encode())
        return decrypted.decode()
    except Exception as e:
        log_debug(f"Decryption error: {e}")
        # If decryption fails, assume it's unencrypted and return as-is
        return encrypted_value

# Palo Alto Firewall Configuration (moved to settings)
# These are fallback defaults only
DEFAULT_FIREWALL_IP = "1.1.1.1"
DEFAULT_API_KEY = "123456"

# Store previous values for throughput calculation
# Store per-device statistics for rate calculation
previous_stats = {}
previous_stats_lock = threading.Lock()

# Store policy hit count history for trend calculation
policy_history = {}
policy_history_lock = threading.Lock()

# API call counter
api_call_count = 0
api_call_start_time = time.time()
api_call_lock = threading.Lock()

# Debug log file
DEBUG_LOG_FILE = os.path.join(os.path.dirname(__file__), 'debug.log')

# Settings file
SETTINGS_FILE = os.path.join(os.path.dirname(__file__), 'settings.json')

# Devices file
DEVICES_FILE = os.path.join(os.path.dirname(__file__), 'devices.json')

# Connected devices cache file
CONNECTED_DEVICES_CACHE_FILE = os.path.join(DATA_DIR, 'connected_devices_cache.json')

# Default settings
DEFAULT_SETTINGS = {
    'refresh_interval': 30,
    'match_count': 10,
    'top_apps_count': 10,
    'debug_logging': False,
    'selected_device_id': '',
    'monitored_interface': 'ethernet1/1'
}

def log_debug(message):
    """Write debug message using Python logging (backward compatibility wrapper)"""
    logger.debug(message)

def load_settings():
    """Load settings from file or return defaults"""
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)

                # Check if MAC vendor database file exists but metadata is missing
                db_path = os.path.join(DATA_DIR, 'mac-vendors-export.json')
                if os.path.exists(db_path) and not settings.get('mac_vendor_db', {}).get('uploaded', False):
                    # Database file exists but settings don't have metadata - rebuild it
                    try:
                        file_stats = os.stat(db_path)
                        with open(db_path, 'r') as db_file:
                            db_data = json.load(db_file)

                        settings['mac_vendor_db'] = {
                            'uploaded': True,
                            'filename': 'mac-vendors-export.json',
                            'entries': len(db_data) if isinstance(db_data, list) else 0,
                            'file_size': file_stats.st_size,
                            'upload_time': datetime.fromtimestamp(file_stats.st_mtime).isoformat()
                        }
                        # Save updated settings
                        save_settings(settings)
                        log_debug("MAC vendor database metadata restored to settings")
                    except Exception as e:
                        log_debug(f"Error rebuilding MAC vendor database metadata: {e}")

                return settings
        return DEFAULT_SETTINGS.copy()
    except Exception as e:
        return DEFAULT_SETTINGS.copy()

def save_settings(settings):
    """Save settings to file and update logger settings"""
    try:
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(settings, f, indent=2)
            f.flush()
            os.fsync(f.fileno())

        # Update logger debug mode if setting changed
        debug_enabled = settings.get('debug_logging', False)
        PANfmLogger.set_debug(debug_enabled)

        return True
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")
        return False

def increment_api_call():
    """Increment the API call counter (thread-safe)"""
    global api_call_count
    with api_call_lock:
        api_call_count += 1

def get_api_stats():
    """Get API call statistics (thread-safe)"""
    global api_call_count, api_call_start_time
    with api_call_lock:
        uptime_seconds = time.time() - api_call_start_time
        calls_per_minute = (api_call_count / uptime_seconds) * 60 if uptime_seconds > 0 else 0
        return {
            'total_calls': api_call_count,
            'calls_per_minute': round(calls_per_minute, 1)
        }

def api_request_get(url, **kwargs):
    """Wrapper for requests.get that tracks API calls"""
    increment_api_call()
    return requests.get(url, **kwargs)

def get_firewall_config(device_id=None):
    """Get firewall IP and API key from settings or from a specific device"""
    if device_id:
        # Get configuration for a specific device
        device = device_manager.get_device(device_id)
        if device:
            firewall_ip = device['ip']
            api_key = device['api_key']
            base_url = f"https://{firewall_ip}/api/"
            return firewall_ip, api_key, base_url

    # Fall back to settings (legacy single-device mode)
    settings = load_settings()
    firewall_ip = settings.get('firewall_ip', DEFAULT_FIREWALL_IP)
    api_key = settings.get('api_key', DEFAULT_API_KEY)

    # Check if we have a selected device in settings
    selected_device_id = settings.get('selected_device_id')
    if selected_device_id:
        device = device_manager.get_device(selected_device_id)
        if device and device.get('enabled', True):
            firewall_ip = device['ip']
            api_key = device['api_key']

    base_url = f"https://{firewall_ip}/api/"
    return firewall_ip, api_key, base_url

# ============================================================================
# Device Management Class
# ============================================================================

class DeviceManager:
    """Manages multiple firewall devices"""

    def __init__(self, devices_file=DEVICES_FILE):
        self.devices_file = devices_file
        self._ensure_file_exists()

    def _ensure_file_exists(self):
        """Create devices.json if it doesn't exist"""
        if not os.path.exists(self.devices_file):
            default_data = {
                "devices": [],
                "groups": ["Headquarters", "Branch Offices", "DMZ", "Remote Sites"]
            }
            with open(self.devices_file, 'w') as f:
                json.dump(default_data, f, indent=2)

    def load_devices(self):
        """Load all devices from file and decrypt sensitive data"""
        try:
            with open(self.devices_file, 'r') as f:
                data = json.load(f)
                devices = data.get('devices', [])

                # Decrypt sensitive fields for each device
                for device in devices:
                    if 'ip' in device:
                        device['ip'] = decrypt_value(device['ip'])
                    if 'api_key' in device:
                        device['api_key'] = decrypt_value(device['api_key'])

                return devices
        except Exception as e:
            log_debug(f"Error loading devices: {e}")
            return []

    def save_devices(self, devices):
        """Save devices to file with encryption for sensitive data"""
        try:
            # Try to read existing data to preserve groups
            try:
                with open(self.devices_file, 'r') as f:
                    data = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError, IOError) as e:
                # If file doesn't exist or can't be read, use default structure
                log_debug(f"Could not read devices file: {e}")
                data = {
                    "devices": [],
                    "groups": ["Headquarters", "Branch Offices", "DMZ", "Remote Sites"]
                }

            # Create a deep copy and encrypt sensitive fields
            encrypted_devices = []
            for device in devices:
                encrypted_device = device.copy()
                if 'ip' in encrypted_device:
                    encrypted_device['ip'] = encrypt_value(encrypted_device['ip'])
                if 'api_key' in encrypted_device:
                    encrypted_device['api_key'] = encrypt_value(encrypted_device['api_key'])
                encrypted_devices.append(encrypted_device)

            data['devices'] = encrypted_devices
            with open(self.devices_file, 'w') as f:
                json.dump(data, f, indent=2)
            return True
        except Exception as e:
            log_debug(f"Error saving devices: {e}")
            return False

    def get_device(self, device_id):
        """Get a specific device by ID"""
        devices = self.load_devices()
        for device in devices:
            if device.get('id') == device_id:
                return device
        return None

    def add_device(self, name, ip, api_key, group="Default", description="", monitored_interface="ethernet1/12", interface_speed_mbps=0):
        """Add a new device"""
        import uuid
        devices = self.load_devices()

        new_device = {
            "id": str(uuid.uuid4()),
            "name": name,
            "ip": ip,
            "api_key": api_key,
            "enabled": True,
            "group": group,
            "description": description,
            "added_date": datetime.now().isoformat(),
            "last_seen": None,
            "monitored_interface": monitored_interface,
            "interface_speed_mbps": interface_speed_mbps  # 0 means auto-detect
        }

        devices.append(new_device)
        self.save_devices(devices)
        return new_device

    def update_device(self, device_id, updates):
        """Update an existing device"""
        devices = self.load_devices()
        for i, device in enumerate(devices):
            if device.get('id') == device_id:
                devices[i].update(updates)
                self.save_devices(devices)
                return devices[i]
        return None

    def delete_device(self, device_id):
        """Delete a device"""
        devices = self.load_devices()
        devices = [d for d in devices if d.get('id') != device_id]
        return self.save_devices(devices)

    def get_groups(self):
        """Get list of device groups"""
        try:
            with open(self.devices_file, 'r') as f:
                data = json.load(f)
                groups = data.get('groups', [])
                # If no groups defined, return default groups
                if not groups:
                    return ["Headquarters", "Branch Offices", "DMZ", "Remote Sites"]
                return groups
        except (FileNotFoundError, json.JSONDecodeError, IOError) as e:
            log_debug(f"Could not read groups from file: {e}")
            return ["Headquarters", "Branch Offices", "DMZ", "Remote Sites"]

    def test_connection(self, ip, api_key):
        """Test connection to a device"""
        try:
            base_url = f"https://{ip}/api/"
            params = {
                'type': 'op',
                'cmd': '<show><system><info></info></system></show>',
                'key': api_key
            }
            response = requests.get(base_url, params=params, verify=False, timeout=5)
            if response.status_code == 200:
                root = ET.fromstring(response.text)
                # Check if we got a valid response
                if root.find('.//hostname') is not None:
                    return {"success": True, "message": "Connection successful"}
            return {"success": False, "message": "Invalid response from firewall"}
        except requests.exceptions.Timeout:
            return {"success": False, "message": "Connection timeout"}
        except Exception as e:
            return {"success": False, "message": f"Connection failed: {str(e)}"}

# Initialize device manager
device_manager = DeviceManager()

# ============================================================================

def get_system_resources():
    """Fetch system resource usage (CPU) from Palo Alto firewall"""
    try:
        _, api_key, base_url = get_firewall_config()

        # Query for dataplane CPU load
        cmd = "<show><running><resource-monitor></resource-monitor></running></show>"
        params = {
            'type': 'op',
            'cmd': cmd,
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=10)

        log_debug(f"\n=== CPU API Response ===")
        log_debug(f"Status: {response.status_code}")
        if response.status_code == 200:
            log_debug(f"Response XML (first 1000 chars):\n{response.text[:1000]}")

        data_plane_cpu = 0
        mgmt_plane_cpu = 0

        if response.status_code == 200:
            root = ET.fromstring(response.text)

            # Try to find data-plane CPU from resource monitor - look for minute average across all data processors
            # This will average across all dp0, dp1, dp2, etc. and all their cores
            all_cpu_values = []

            # Find all data processor entries (dp0, dp1, etc.)
            dp_processors = root.findall('.//data-processors/*')
            for dp in dp_processors:
                dp_entries = dp.findall('.//minute/cpu-load-average/entry')
                for entry in dp_entries:
                    value_elem = entry.find('value')
                    if value_elem is not None and value_elem.text:
                        # Value is a comma-separated list of CPU values for different cores
                        try:
                            values = [int(v) for v in value_elem.text.strip().split(',') if v.strip()]
                            all_cpu_values.extend(values)  # Add all core values to the list
                        except (ValueError, AttributeError) as e:
                            log_debug(f"Error parsing CPU values: {e}")
                            pass

            if all_cpu_values:
                data_plane_cpu = int(sum(all_cpu_values) / len(all_cpu_values))
                log_debug(f"Found data-plane CPU (1-min avg across {len(all_cpu_values)} cores): {data_plane_cpu}%")

            # If minute average not found, try second average
            if data_plane_cpu == 0:
                dp_entries = root.findall('.//data-processors/dp0/second/cpu-load-average/entry')
                if dp_entries:
                    total_cpu = 0
                    count = 0
                    for entry in dp_entries:
                        value_elem = entry.find('value')
                        if value_elem is not None and value_elem.text:
                            try:
                                values = [int(v) for v in value_elem.text.strip().split(',') if v.strip()]
                                if values:
                                    avg = sum(values) / len(values)
                                    total_cpu += avg
                                    count += 1
                            except (ValueError, AttributeError) as e:
                                log_debug(f"Error parsing second average CPU values: {e}")
                                pass
                    if count > 0:
                        data_plane_cpu = int(total_cpu / count)
                        log_debug(f"Found data-plane CPU (second avg from {count} entries): {data_plane_cpu}%")

            # Skip management plane CPU from resource monitor - we'll get it from system resources XML instead
            # mgmt_minute = root.find('.//resource-monitor/minute/cpu-load-average')
            # log_debug(f"Management plane CPU element found: {mgmt_minute is not None}")
            # if mgmt_minute is not None:
            #     log_debug(f"Management plane CPU text: {mgmt_minute.text}")
            # if mgmt_minute is not None and mgmt_minute.text:
            #     try:
            #         cpu_val = mgmt_minute.text.strip().replace('%', '')
            #         mgmt_plane_cpu = int(float(cpu_val))
            #         log_debug(f"Parsed management plane CPU: {mgmt_plane_cpu}%")
            #     except Exception as e:
            #         log_debug(f"Error parsing mgmt CPU: {e}")

        # Try the system resources command for management CPU and memory (only if not found in resource monitor)
        cmd2 = "<show><system><resources></resources></system></show>"
        params2 = {
            'type': 'op',
            'cmd': cmd2,
            'key': api_key
        }
        response2 = api_request_get(base_url, params=params2, verify=False, timeout=10)
        log_debug(f"Trying system resources command, status: {response2.status_code}")

        if response2.status_code == 200:
                # Export the XML response to a file for inspection
                try:
                    with open('system_resources_output.xml', 'w') as f:
                        f.write(response2.text)
                    log_debug("Exported system resources XML to system_resources_output.xml")
                except Exception as e:
                    log_debug(f"Error exporting XML: {e}")

                root2 = ET.fromstring(response2.text)

                # Try to get data plane CPU from XML field
                dp_cpu_elem = root2.find('.//dp-cpu-utilization')

                # Use data plane CPU from XML if not already found from resource monitor
                if dp_cpu_elem is not None and dp_cpu_elem.text and data_plane_cpu == 0:
                    data_plane_cpu = int(dp_cpu_elem.text)
                    log_debug(f"Data Plane CPU from XML: {data_plane_cpu}%")

                # Note: Management CPU will be parsed from the aggregate %Cpu(s) line in top output
                # This gives us the average across all management plane cores, which is more accurate

                result_text = root2.find('.//result')

                memory_used_pct = 0
                memory_total_mb = 0
                memory_used_mb = 0

                if result_text is not None and result_text.text:
                    lines = result_text.text.strip().split('\n')
                    log_debug(f"System resources output (first 500 chars):\n{result_text.text[:500]}")

                    for line in lines:
                        # Parse CPU line from top command
                        # Example: %Cpu(s):  2.1 us,  1.2 sy,  0.0 ni, 96.5 id,  0.1 wa,  0.0 hi,  0.1 si,  0.0 st
                        if '%Cpu(s):' in line or 'Cpu(s):' in line:
                            log_debug(f"Found CPU line: {line}")
                            try:
                                # Extract all CPU components
                                parts = line.split(':')[1].split(',')  # Get part after ':'
                                user_cpu = 0
                                sys_cpu = 0
                                idle_cpu = 0

                                for part in parts:
                                    part = part.strip()
                                    if 'us' in part:  # user CPU
                                        user_cpu = float(part.split()[0])
                                    elif 'sy' in part:  # system CPU
                                        sys_cpu = float(part.split()[0])
                                    elif 'id' in part:  # idle CPU
                                        idle_cpu = float(part.split()[0])

                                # Always use aggregate CPU from %Cpu(s) line (average across all cores)
                                # Management plane CPU shows usage percentage (user + system)
                                mgmt_plane_cpu = int(user_cpu + sys_cpu)
                                log_debug(f"Management CPU from system resources (aggregate): {mgmt_plane_cpu}% (user: {user_cpu}% + system: {sys_cpu}%)")

                                log_debug(f"Parsed CPU - User: {user_cpu}%, System: {sys_cpu}%, Idle: {idle_cpu}%")
                            except Exception as e:
                                log_debug(f"Error parsing CPU line: {e}")

                        # Parse memory information
                        # Example: MiB Mem :  31403.9 total,   3534.7 free,  14245.1 used,  13624.2 buff/cache
                        if 'Mem' in line and 'total' in line:
                            log_debug(f"Found memory line: {line}")
                            try:
                                parts = line.split(',')
                                for part in parts:
                                    if 'total' in part:
                                        total_str = part.split('total')[0].strip().split()[-1]
                                        memory_total_mb = float(total_str)
                                    if 'used' in part and 'buff/cache' not in part:
                                        used_str = part.split('used')[0].strip().split()[-1]
                                        memory_used_mb = float(used_str)

                                if memory_total_mb > 0:
                                    memory_used_pct = int((memory_used_mb / memory_total_mb) * 100)
                                    log_debug(f"Memory: {memory_used_mb:.1f}MB / {memory_total_mb:.1f}MB ({memory_used_pct}%)")
                            except Exception as e:
                                log_debug(f"Error calculating memory: {e}")

        log_debug(f"Final CPU - Data plane: {data_plane_cpu}%, Mgmt plane: {mgmt_plane_cpu}%")

        # Get system uptime
        uptime = None
        uptime_cmd = "<show><system><info></info></system></show>"
        uptime_params = {
            'type': 'op',
            'cmd': uptime_cmd,
            'key': api_key
        }
        uptime_response = api_request_get(base_url, params=uptime_params, verify=False, timeout=10)
        if uptime_response.status_code == 200:
            uptime_root = ET.fromstring(uptime_response.text)
            uptime_elem = uptime_root.find('.//uptime')
            if uptime_elem is not None and uptime_elem.text:
                uptime = uptime_elem.text

        return {
            'data_plane_cpu': data_plane_cpu,
            'mgmt_plane_cpu': mgmt_plane_cpu,
            'uptime': uptime,
            'memory_used_pct': memory_used_pct,
            'memory_used_mb': int(memory_used_mb),
            'memory_total_mb': int(memory_total_mb)
        }

    except Exception as e:
        log_debug(f"CPU Error: {str(e)}")
        return {'data_plane_cpu': 0, 'mgmt_plane_cpu': 0, 'uptime': None, 'memory_used_pct': 0, 'memory_used_mb': 0, 'memory_total_mb': 0}

def get_interface_stats():
    """Fetch interface statistics from Palo Alto firewall"""
    try:
        _, api_key, base_url = get_firewall_config()

        # Get interface statistics
        cmd = "<show><counter><interface>all</interface></counter></show>"
        params = {
            'type': 'op',
            'cmd': cmd,
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=10)
        log_debug(f"Interface stats API Status: {response.status_code}")

        interfaces = []
        total_errors = 0
        total_drops = 0

        if response.status_code == 200:
            root = ET.fromstring(response.text)
            log_debug(f"Interface stats XML (first 2000 chars):\n{response.text[:2000]}")

            # Parse interface entries
            for ifentry in root.findall('.//ifnet/entry'):
                name_elem = ifentry.find('name')
                ierrors_elem = ifentry.find('ierrors')
                oerrors_elem = ifentry.find('oerrors')
                idrops_elem = ifentry.find('idrops')

                if name_elem is not None:
                    interface_name = name_elem.text
                    ierrors = int(ierrors_elem.text) if ierrors_elem is not None and ierrors_elem.text else 0
                    oerrors = int(oerrors_elem.text) if oerrors_elem is not None and oerrors_elem.text else 0
                    idrops = int(idrops_elem.text) if idrops_elem is not None and idrops_elem.text else 0

                    total_errors += ierrors + oerrors
                    total_drops += idrops

                    # Only include interfaces with errors or drops
                    if ierrors > 0 or oerrors > 0 or idrops > 0:
                        interfaces.append({
                            'name': interface_name,
                            'ierrors': ierrors,
                            'oerrors': oerrors,
                            'idrops': idrops,
                            'total_errors': ierrors + oerrors
                        })

            log_debug(f"Found {len(interfaces)} interfaces with errors/drops")
            log_debug(f"Total errors: {total_errors}, Total drops: {total_drops}")

        return {
            'interfaces': interfaces,
            'total_errors': total_errors,
            'total_drops': total_drops
        }

    except Exception as e:
        log_debug(f"Interface stats error: {str(e)}")
        return {'interfaces': [], 'total_errors': 0, 'total_drops': 0}

def get_top_applications(top_count=5):
    """Fetch top applications from traffic logs"""
    try:
        _, api_key, base_url = get_firewall_config()

        # Query traffic logs
        log_query = "(subtype eq end)"
        params = {
            'type': 'log',
            'log-type': 'traffic',
            'query': log_query,
            'nlogs': '1000',
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=10)
        log_debug(f"Top apps traffic log query status: {response.status_code}")

        app_counts = {}

        if response.status_code == 200:
            root = ET.fromstring(response.text)
            job_id = root.find('.//job')

            if job_id is not None and job_id.text:
                log_debug(f"Top apps job ID: {job_id.text}")
                time.sleep(1)

                result_params = {
                    'type': 'log',
                    'action': 'get',
                    'job-id': job_id.text,
                    'key': api_key
                }

                result_response = api_request_get(base_url, params=result_params, verify=False, timeout=10)

                if result_response.status_code == 200:
                    result_root = ET.fromstring(result_response.text)

                    # Count applications
                    for entry in result_root.findall('.//entry'):
                        app_elem = entry.find('.//app')
                        if app_elem is not None and app_elem.text:
                            app_name = app_elem.text
                            if app_name not in app_counts:
                                app_counts[app_name] = 0
                            app_counts[app_name] += 1

        # Sort by count and get top N
        top_apps = sorted(app_counts.items(), key=lambda x: x[1], reverse=True)[:top_count]
        log_debug(f"Top {top_count} applications: {top_apps}")

        # Calculate total unique applications
        total_apps = len(app_counts)

        return {
            'apps': [{'name': app[0], 'count': app[1]} for app in top_apps],
            'total_count': total_apps
        }

    except Exception as e:
        log_debug(f"Top applications error: {str(e)}")
        return {'apps': [], 'total_count': 0}

def get_system_logs(max_logs=50):
    """Fetch system logs from Palo Alto firewall"""
    try:
        _, api_key, base_url = get_firewall_config()

        # Query for system logs using log query API
        params = {
            'type': 'log',
            'log-type': 'system',
            'nlogs': str(max_logs * 2),  # Request more to ensure we get enough
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=10)

        log_debug(f"\n=== SYSTEM LOG API Response ===")
        log_debug(f"Status: {response.status_code}")

        system_logs = []

        if response.status_code == 200:
            root = ET.fromstring(response.text)

            # Check if this is a job response (async log query)
            job_id = root.find('.//job')
            if job_id is not None and job_id.text:
                log_debug(f"System log job ID: {job_id.text}")

                # Wait briefly and fetch job results
                time.sleep(0.5)
                result_params = {
                    'type': 'log',
                    'action': 'get',
                    'job-id': job_id.text,
                    'key': api_key
                }

                result_response = api_request_get(base_url, params=result_params, verify=False, timeout=10)
                if result_response.status_code == 200:
                    root = ET.fromstring(result_response.text)
                    log_debug(f"System log job result fetched")

            # Parse system log entries with all fields
            for entry in root.findall('.//entry'):
                eventid = entry.find('.//eventid')
                description = entry.find('.//opaque') or entry.find('.//description')
                severity = entry.find('.//severity')
                receive_time = entry.find('.//receive_time') or entry.find('.//time_generated')
                module = entry.find('.//module')
                subtype = entry.find('.//subtype')
                result_elem = entry.find('.//result')

                # Create full log entry with all fields
                log_entry = {
                    'eventid': eventid.text if eventid is not None and eventid.text else 'N/A',
                    'description': description.text if description is not None and description.text else 'System Event',
                    'severity': severity.text if severity is not None and severity.text else 'N/A',
                    'module': module.text if module is not None and module.text else 'N/A',
                    'subtype': subtype.text if subtype is not None and subtype.text else 'N/A',
                    'result': result_elem.text if result_elem is not None and result_elem.text else 'N/A',
                    'time': receive_time.text if receive_time is not None and receive_time.text else 'N/A',
                    # Keep old format for homepage tile
                    'threat': description.text[:50] + '...' if description is not None and description.text and len(description.text) > 50 else (description.text if description is not None and description.text else 'System Event'),
                    'src': module.text if module is not None and module.text else 'N/A',
                    'dst': severity.text if severity is not None and severity.text else 'N/A',
                    'dport': eventid.text if eventid is not None and eventid.text else 'N/A',
                    'action': 'system'
                }

                if len(system_logs) < max_logs:
                    system_logs.append(log_entry)

            log_debug(f"Total system logs collected: {len(system_logs)}")

        return system_logs

    except Exception as e:
        log_debug(f"Error fetching system logs: {str(e)}")
        return []

def get_threat_stats(max_logs=5):
    """Fetch threat and URL filtering statistics from Palo Alto firewall"""
    try:
        firewall_ip, api_key, base_url = get_firewall_config()
        log_debug(f"=== get_threat_stats called ===")
        log_debug(f"Fetching threat stats from device: {firewall_ip}")

        # Query for threat logs using log query API
        params = {
            'type': 'log',
            'log-type': 'threat',
            'nlogs': '500',
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=10)

        import sys
        sys.stderr.write(f"\n=== THREAT API Response ===\nStatus: {response.status_code}\n")
        if response.status_code == 200:
            sys.stderr.write(f"Response XML (first 1000 chars):\n{response.text[:1000]}...\n")
        sys.stderr.flush()

        medium_count = 0
        critical_count = 0
        url_blocked = 0

        critical_logs = []
        medium_logs = []
        blocked_url_logs = []

        if response.status_code == 200:
            root = ET.fromstring(response.text)

            # Check if this is a job response (async log query)
            job_id = root.find('.//job')
            if job_id is not None and job_id.text:
                sys.stderr.write(f"Job ID received: {job_id.text}, fetching results...\n")
                sys.stderr.flush()

                # Wait briefly and fetch job results
                time.sleep(0.5)
                result_params = {
                    'type': 'log',
                    'action': 'get',
                    'job-id': job_id.text,
                    'key': api_key
                }

                result_response = api_request_get(base_url, params=result_params, verify=False, timeout=10)
                if result_response.status_code == 200:
                    root = ET.fromstring(result_response.text)
                    sys.stderr.write(f"Job result fetched, parsing logs...\n")
                    sys.stderr.flush()

            # Count total entries found
            entries = root.findall('.//entry')
            sys.stderr.write(f"Total threat entries found: {len(entries)}\n")
            sys.stderr.flush()
            log_debug(f"Total threat entries found in XML: {len(entries)}")

            # Count threats by severity and collect details
            entry_count = 0
            for entry in root.findall('.//entry'):
                entry_count += 1
                severity = entry.find('.//severity')
                threat_type = entry.find('.//type')
                subtype = entry.find('.//subtype')
                action = entry.find('.//action')
                threat_name = entry.find('.//threat-name')
                threat_id = entry.find('.//threatid')
                src = entry.find('.//src')
                dst = entry.find('.//dst')
                sport = entry.find('.//sport')
                dport = entry.find('.//dport')
                receive_time = entry.find('.//receive_time') or entry.find('.//time_generated')
                category = entry.find('.//category')
                url_field = entry.find('.//url') or entry.find('.//misc')
                app = entry.find('.//app')

                # Debug: log all available fields for first few entries to see structure
                if entry_count <= 3:
                    log_debug(f"=== Threat entry #{entry_count} XML fields ===")
                    for child in entry:
                        if child.text:
                            log_debug(f"  {child.tag}: {child.text[:200] if len(child.text) > 200 else child.text}")
                        else:
                            log_debug(f"  {child.tag}: (empty)")
                    log_debug("=== End of entry ===\n")

                # Extract threat ID and name
                threat_id_value = None
                if threat_id is not None and threat_id.text:
                    threat_id_value = threat_id.text.strip()

                threat_display = 'Unknown'
                if threat_name is not None and threat_name.text:
                    threat_display = threat_name.text
                    log_debug(f"Using threat name: {threat_display}")
                elif category is not None and category.text:
                    threat_display = category.text
                    log_debug(f"Using category: {threat_display}")

                # Create log entry
                log_entry = {
                    'threat': threat_display,
                    'threat_id': threat_id_value,
                    'src': src.text if src is not None and src.text else 'N/A',
                    'dst': dst.text if dst is not None and dst.text else 'N/A',
                    'sport': sport.text if sport is not None and sport.text else 'N/A',
                    'dport': dport.text if dport is not None and dport.text else 'N/A',
                    'time': receive_time.text if receive_time is not None and receive_time.text else 'N/A',
                    'action': action.text if action is not None and action.text else 'N/A',
                    'app': app.text if app is not None and app.text else 'N/A',
                    'category': category.text if category is not None and category.text else 'N/A',
                    'severity': severity.text if severity is not None and severity.text else 'N/A'
                }

                # Check severity (try different common severity values)
                if severity is not None and severity.text:
                    sev_lower = severity.text.lower()

                    if sev_lower in ['medium', 'med']:
                        medium_count += 1
                        if len(medium_logs) < max_logs:
                            medium_logs.append(log_entry)
                            log_debug(f"Added medium threat: {threat_display}")
                    elif sev_lower in ['critical', 'high', 'crit']:
                        critical_count += 1
                        if len(critical_logs) < max_logs:
                            critical_logs.append(log_entry)
                            log_debug(f"Added critical threat: {threat_display}")

                # Skip URL blocking from threat logs - we'll get them from URL filtering logs instead

            # Query URL filtering logs for blocked URLs
            url_params = {
                'type': 'log',
                'log-type': 'url',
                'nlogs': '500',
                'key': api_key
            }

            url_response = api_request_get(base_url, params=url_params, verify=False, timeout=10)
            if url_response.status_code == 200:
                url_root = ET.fromstring(url_response.text)
                job_id = url_root.find('.//job')

                if job_id is not None and job_id.text:
                    log_debug(f"URL filtering log job ID: {job_id.text}")
                    time.sleep(0.5)

                    result_params = {
                        'type': 'log',
                        'action': 'get',
                        'job-id': job_id.text,
                        'key': api_key
                    }

                    result_response = api_request_get(base_url, params=result_params, verify=False, timeout=10)
                    if result_response.status_code == 200:
                        url_root = ET.fromstring(result_response.text)

                        # Get blocked URLs from URL filtering logs
                        all_entries = url_root.findall('.//entry')
                        log_debug(f"Total URL filtering entries found: {len(all_entries)}")

                        # Iterate through entries and collect blocked URLs
                        for idx, entry in enumerate(all_entries):
                            action = entry.find('.//action')
                            url_category = entry.find('.//category') or entry.find('.//url-category')
                            url_field = entry.find('.//url') or entry.find('.//misc')
                            src = entry.find('.//src')
                            dst = entry.find('.//dst')
                            sport = entry.find('.//sport')
                            dport = entry.find('.//dport')
                            receive_time = entry.find('.//receive_time') or entry.find('.//time_generated')
                            app = entry.find('.//app')

                            # Debug: Log first few entries to understand the data
                            if idx < 10:
                                log_debug(f"\n=== URL Filtering Entry {idx} ===")
                                log_debug(f"Action: {action.text if action is not None and action.text else 'None'}")
                                log_debug(f"URL: {url_field.text if url_field is not None and url_field.text else 'None'}")
                                log_debug(f"Category: {url_category.text if url_category is not None and url_category.text else 'None'}")
                                log_debug(f"Source: {src.text if src is not None and src.text else 'None'}")

                            # Check if this is a blocked/denied entry
                            is_blocked = False
                            if action is not None and action.text:
                                action_lower = action.text.lower()
                                # URL filtering logs typically have 'block-url', 'block-continue', 'alert', etc.
                                if 'block' in action_lower or 'deny' in action_lower or 'drop' in action_lower:
                                    is_blocked = True
                                    log_debug(f"Found blocked URL by action: {action.text}")

                            if is_blocked and len(blocked_url_logs) < max_logs:
                                # Try to get meaningful description
                                url_display = 'Blocked URL'
                                if url_field is not None and url_field.text:
                                    url_display = url_field.text[:50]
                                elif url_category is not None and url_category.text:
                                    url_display = f"Category: {url_category.text}"

                                url_log = {
                                    'threat': url_display,
                                    'url': url_field.text if url_field is not None and url_field.text else 'N/A',
                                    'src': src.text if src is not None and src.text else 'N/A',
                                    'dst': dst.text if dst is not None and dst.text else 'N/A',
                                    'sport': sport.text if sport is not None and sport.text else 'N/A',
                                    'dport': dport.text if dport is not None and dport.text else 'N/A',
                                    'time': receive_time.text if receive_time is not None and receive_time.text else 'N/A',
                                    'action': action.text if action is not None and action.text else 'N/A',
                                    'app': app.text if app is not None and app.text else 'N/A',
                                    'category': url_category.text if url_category is not None and url_category.text else 'N/A',
                                    'severity': 'N/A'
                                }
                                blocked_url_logs.append(url_log)
                                url_blocked += 1

                        log_debug(f"Total blocked URLs found: {url_blocked}")

            # Get total URL filtering count (all events, not just blocked)
            url_filtering_total = 0
            if url_response.status_code == 200:
                url_root_all = ET.fromstring(url_response.text)
                job_id_all = url_root_all.find('.//job')

                if job_id_all is not None and job_id_all.text:
                    # Already fetched above, count all entries
                    all_url_entries = url_root.findall('.//entry')
                    url_filtering_total = len(all_url_entries)
                    log_debug(f"Total URL filtering events: {url_filtering_total}")

            # Calculate days since last critical threat and blocked URL
            critical_last_seen = None
            medium_last_seen = None
            blocked_url_last_seen = None

            if critical_logs:
                # Get the most recent critical threat time
                latest_critical = critical_logs[0]
                if latest_critical.get('time'):
                    critical_last_seen = latest_critical['time']

            if medium_logs:
                # Get the most recent medium threat time
                latest_medium = medium_logs[0]
                if latest_medium.get('time'):
                    medium_last_seen = latest_medium['time']

            if blocked_url_logs:
                # Get the most recent blocked URL time
                latest_blocked = blocked_url_logs[0]
                if latest_blocked.get('time'):
                    blocked_url_last_seen = latest_blocked['time']

            return {
                'medium_threats': medium_count,
                'critical_threats': critical_count,
                'blocked_urls': url_blocked,
                'url_filtering_total': url_filtering_total,
                'critical_logs': critical_logs,
                'medium_logs': medium_logs,
                'blocked_url_logs': blocked_url_logs,
                'critical_last_seen': critical_last_seen,
                'medium_last_seen': medium_last_seen,
                'blocked_url_last_seen': blocked_url_last_seen
            }
        else:
            return {
                'medium_threats': 0,
                'critical_threats': 0,
                'blocked_urls': 0,
                'url_filtering_total': 0,
                'critical_logs': [],
                'medium_logs': [],
                'blocked_url_logs': [],
                'critical_last_seen': None,
                'blocked_url_last_seen': None
            }

    except Exception as e:
        return {
            'medium_threats': 0,
            'critical_threats': 0,
            'blocked_urls': 0,
            'url_filtering_total': 0,
            'critical_logs': [],
            'medium_logs': [],
            'blocked_url_logs': [],
            'critical_last_seen': None,
            'blocked_url_last_seen': None
        }

def get_session_count():
    """Fetch session count from Palo Alto firewall"""
    try:
        _, api_key, base_url = get_firewall_config()

        cmd = "<show><session><info></info></session></show>"
        params = {
            'type': 'op',
            'cmd': cmd,
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=10)

        if response.status_code == 200:
            root = ET.fromstring(response.text)

            # Extract session counts
            num_active = root.find('.//num-active')
            num_tcp = root.find('.//num-tcp')
            num_udp = root.find('.//num-udp')
            num_icmp = root.find('.//num-icmp')

            return {
                'active': int(num_active.text) if num_active is not None and num_active.text else 0,
                'tcp': int(num_tcp.text) if num_tcp is not None and num_tcp.text else 0,
                'udp': int(num_udp.text) if num_udp is not None and num_udp.text else 0,
                'icmp': int(num_icmp.text) if num_icmp is not None and num_icmp.text else 0
            }
        else:
            return {'active': 0, 'tcp': 0, 'udp': 0, 'icmp': 0}

    except Exception as e:
        return {'active': 0, 'tcp': 0, 'udp': 0, 'icmp': 0}

def get_throughput_data():
    """Fetch throughput data from Palo Alto firewall"""
    try:
        # Load settings to get match count and firewall config
        settings = load_settings()
        max_logs = settings.get('match_count', 5)
        selected_device_id = settings.get('selected_device_id', '')
        firewall_ip, api_key, base_url = get_firewall_config()

        # Get monitored interface from the device, not from settings
        monitored_interface = 'ethernet1/12'  # default
        manual_interface_speed = 0  # 0 means auto-detect
        if selected_device_id:
            device = device_manager.get_device(selected_device_id)
            if device:
                if device.get('monitored_interface'):
                    monitored_interface = device['monitored_interface']
                if device.get('interface_speed_mbps'):
                    manual_interface_speed = int(device.get('interface_speed_mbps', 0))

        log_debug(f"=== get_throughput_data called ===")
        log_debug(f"Selected device from settings: {selected_device_id}")
        log_debug(f"Fetching throughput data from device: {firewall_ip}")
        log_debug(f"Monitored interface: {monitored_interface}")
        log_debug(f"Manual interface speed override: {manual_interface_speed} Mbps (0 = auto-detect)")

        # Use device ID as key for per-device stats, fallback to IP if no device ID
        device_key = selected_device_id if selected_device_id else firewall_ip

        # Check if manual speed is configured
        if manual_interface_speed > 0:
            interface_speed_mbps = manual_interface_speed
            log_debug(f"Using manual interface speed: {interface_speed_mbps} Mbps")
        else:
            # First, query for interface hardware information to get speed
            hw_cmd = f"<show><interface>{monitored_interface}</interface></show>"
            hw_params = {
                'type': 'op',
                'cmd': hw_cmd,
                'key': api_key
            }

            interface_speed_mbps = 1000  # Default to 1Gbps if we can't determine
            try:
                hw_response = api_request_get(base_url, params=hw_params, verify=False, timeout=10)
                if hw_response.status_code == 200:
                    # Export the XML response to a file for debugging
                    try:
                        with open('interface_hw_output.xml', 'w') as f:
                            f.write(hw_response.text)
                        log_debug("Exported interface hardware XML to interface_hw_output.xml")
                    except Exception as write_error:
                        log_debug(f"Error exporting interface hardware XML: {write_error}")

                    hw_root = ET.fromstring(hw_response.text)
                    log_debug(f"Interface hardware XML (first 2000 chars):\n{hw_response.text[:2000]}")

                    # First, try to find runtime link speed (actual negotiated speed)
                    # This is typically in a field like "Runtime link speed/duplex/state"
                    speed_elem = None

                    # Pattern 1: Look for runtime speed/duplex/state field
                    # This might be in various formats like "2.5Gb/s-full-up" or "1000/full/up"
                    for elem in hw_root.iter():
                        if elem.text is not None and ('runtime' in elem.tag.lower() or 'link' in elem.tag.lower()):
                            log_debug(f"Found potential runtime element: {elem.tag} = {elem.text}")
                            # Check if it contains speed info
                            if any(x in elem.text.lower() for x in ['gb/s', 'mb/s', 'full', 'half', 'duplex', '/up', '/down']):
                                speed_elem = elem
                                log_debug(f"Using runtime link speed from: {elem.tag}")
                                break

                    # Pattern 2: Direct speed element
                    if speed_elem is None:
                        speed_elem = hw_root.find('.//speed')

                    # Pattern 3: hw/speed
                    if speed_elem is None:
                        speed_elem = hw_root.find('.//hw/speed')

                    # Pattern 4: Check under ifnet/entry
                    if speed_elem is None:
                        speed_elem = hw_root.find('.//ifnet/entry/speed')

                    if speed_elem is not None and speed_elem.text:
                        speed_text = speed_elem.text.strip().lower()
                        log_debug(f"Raw speed text from XML: '{speed_text}'")

                        # Parse runtime link speed formats:
                        # Supported speeds: 10Mbps, 100Mbps, 1Gbps, 2.5Gbps, 5Gbps, 10Gbps
                        # Examples: "5Gb/s-full-up", "2.5Gb/s-full-up", "1000/full/up", "10Gb/s-full-up", "100Mb/s-full-up"

                        # Check for runtime format with "Gb/s" or "Mb/s"
                        if 'gb/s' in speed_text or 'mb/s' in speed_text:
                            log_debug("Detected runtime link speed format")
                            # Extract the speed value (e.g., "5" from "5Gb/s-full-up", "2.5" from "2.5Gb/s-full-up")
                            import re
                            # Match patterns like "10Gb/s", "5Gb/s", "2.5Gb/s", "100Mb/s"
                            gb_match = re.search(r'(\d+\.?\d*)\s*gb/s', speed_text)
                            mb_match = re.search(r'(\d+\.?\d*)\s*mb/s', speed_text)

                            if gb_match:
                                speed_val = float(gb_match.group(1))
                                interface_speed_mbps = int(speed_val * 1000)  # Convert Gb to Mb
                                log_debug(f"Parsed {speed_val} Gb/s as {interface_speed_mbps} Mbps")
                            elif mb_match:
                                speed_val = float(mb_match.group(1))
                                interface_speed_mbps = int(speed_val)
                                log_debug(f"Parsed {speed_val} Mb/s as {interface_speed_mbps} Mbps")
                        else:
                            # Parse traditional speed formats (e.g., "1000", "10000", "auto")
                            # Remove 'auto-' prefix if present
                            if 'auto-' in speed_text:
                                speed_text = speed_text.replace('auto-', '')

                            # Check for specific speed values (check higher speeds first to avoid partial matches)
                            # Supported: 10Mbps, 100Mbps, 1Gbps (1000Mbps), 2.5Gbps (2500Mbps), 5Gbps (5000Mbps), 10Gbps (10000Mbps)
                            if '10000' in speed_text or '10g' in speed_text or speed_text == '10g':
                                interface_speed_mbps = 10000
                            elif '5000' in speed_text or '5g' in speed_text or speed_text == '5g' or '5.0g' in speed_text:
                                interface_speed_mbps = 5000
                            elif '2500' in speed_text or '2.5g' in speed_text or speed_text == '2.5g' or '2500m' in speed_text:
                                interface_speed_mbps = 2500
                            elif '1000' in speed_text or '1g' in speed_text or speed_text == '1g':
                                interface_speed_mbps = 1000
                            elif speed_text == '100' or '100m' in speed_text:
                                interface_speed_mbps = 100
                            elif speed_text == '10' or '10m' in speed_text:
                                interface_speed_mbps = 10
                            # If speed is just "auto", try to find duplex or other indicators
                            elif 'auto' in speed_text:
                                log_debug("Speed is 'auto', looking for duplex or other speed indicators...")
                                # Try to find duplex which might indicate actual speed
                                duplex_elem = hw_root.find('.//duplex')
                                if duplex_elem is not None and duplex_elem.text:
                                    log_debug(f"Duplex setting: {duplex_elem.text}")
                                # Default to 1000 for auto
                                interface_speed_mbps = 1000

                        log_debug(f"Interface speed detected: {interface_speed_mbps} Mbps from text '{speed_text}'")
                    else:
                        log_debug("No speed element found in interface hardware XML")
                        # Try to extract from state element if available
                        state_elem = hw_root.find('.//state')
                        if state_elem is not None and state_elem.text:
                            log_debug(f"Interface state: {state_elem.text}")
            except Exception as e:
                log_debug(f"Error querying interface speed: {e}, using default 1000 Mbps")
                import traceback
                log_debug(f"Traceback: {traceback.format_exc()}")

            # Alternative: Try to get speed from system info if the above didn't work
            if interface_speed_mbps == 1000:  # Still at default
                try:
                    # Try network interfaces command which might have more detail
                    alt_cmd = "<show><interface>all</interface></show>"
                    alt_params = {
                        'type': 'op',
                        'cmd': alt_cmd,
                        'key': api_key
                    }
                    alt_response = api_request_get(base_url, params=alt_params, verify=False, timeout=10)
                    if alt_response.status_code == 200:
                        alt_root = ET.fromstring(alt_response.text)
                        # Find our specific interface in the list
                        for hw_entry in alt_root.findall('.//hw/entry'):
                            name_elem = hw_entry.find('name')
                            if name_elem is not None and name_elem.text == monitored_interface:
                                speed_elem = hw_entry.find('speed')
                                if speed_elem is not None and speed_elem.text:
                                    speed_text = speed_elem.text.strip().lower()
                                    log_debug(f"Found speed in 'show interface all' for {monitored_interface}: '{speed_text}'")
                                    # Parse the speed (check higher speeds first)
                                    # Supported: 10Mbps, 100Mbps, 1Gbps, 2.5Gbps, 5Gbps, 10Gbps
                                    if '10000' in speed_text or '10g' in speed_text:
                                        interface_speed_mbps = 10000
                                    elif '5000' in speed_text or '5g' in speed_text or '5.0g' in speed_text:
                                        interface_speed_mbps = 5000
                                    elif '2500' in speed_text or '2.5g' in speed_text or '2500m' in speed_text:
                                        interface_speed_mbps = 2500
                                    elif '1000' in speed_text or '1g' in speed_text:
                                        interface_speed_mbps = 1000
                                    elif '100' in speed_text:
                                        interface_speed_mbps = 100
                                    elif '10' in speed_text and '100' not in speed_text and '1000' not in speed_text:
                                        interface_speed_mbps = 10
                                    break
                except Exception as alt_error:
                    log_debug(f"Alternative speed query failed: {alt_error}")

            log_debug(f"Final interface speed for {monitored_interface}: {interface_speed_mbps} Mbps")

        # Query for interface statistics
        cmd = f"<show><counter><interface>{monitored_interface}</interface></counter></show>"
        params = {
            'type': 'op',
            'cmd': cmd,
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=10)

        if response.status_code == 200:
            # Export XML for debugging
            try:
                with open('interface_counter_output.xml', 'w') as f:
                    f.write(response.text)
                log_debug("Exported interface counter XML to interface_counter_output.xml")
            except Exception as e:
                log_debug(f"Error exporting interface counter XML: {e}")

            # Parse XML response
            root = ET.fromstring(response.text)

            total_ibytes = 0
            total_obytes = 0
            total_ipkts = 0
            total_opkts = 0

            # Extract interface statistics - find the main interface entry only
            hw_entry = root.find(f".//entry[name='{monitored_interface}']")
            if hw_entry is not None:
                ibytes = hw_entry.find('ibytes')
                obytes = hw_entry.find('obytes')
                ipackets = hw_entry.find('ipackets')
                opackets = hw_entry.find('opackets')

                log_debug(f"Packet fields found - ipackets: {ipackets is not None}, opackets: {opackets is not None}")

                if ibytes is not None and ibytes.text:
                    total_ibytes = int(ibytes.text)
                if obytes is not None and obytes.text:
                    total_obytes = int(obytes.text)
                if ipackets is not None and ipackets.text:
                    total_ipkts = int(ipackets.text)
                    log_debug(f"Extracted ipackets: {total_ipkts}")
                if opackets is not None and opackets.text:
                    total_opkts = int(opackets.text)
                    log_debug(f"Extracted opackets: {total_opkts}")
            else:
                log_debug(f"WARNING: Could not find {monitored_interface} entry in interface counter XML")

            # Initialize device stats if not exists (with thread safety)
            with previous_stats_lock:
                if device_key not in previous_stats:
                    previous_stats[device_key] = {
                        'ibytes': 0,
                        'obytes': 0,
                        'ipkts': 0,
                        'opkts': 0,
                        'timestamp': time.time()
                    }

                # Calculate throughput rate (bytes per second)
                current_time = time.time()
                device_stats = previous_stats[device_key]
                time_delta = current_time - device_stats['timestamp']

            if time_delta > 0 and device_stats['ibytes'] > 0:
                # Calculate bytes per second, then convert to Mbps
                ibytes_delta = total_ibytes - device_stats['ibytes']
                obytes_delta = total_obytes - device_stats['obytes']
                ipkts_delta = total_ipkts - device_stats['ipkts']
                opkts_delta = total_opkts - device_stats['opkts']

                # Avoid negative deltas from counter resets
                if ibytes_delta < 0:
                    ibytes_delta = 0
                if obytes_delta < 0:
                    obytes_delta = 0
                if ipkts_delta < 0:
                    ipkts_delta = 0
                if opkts_delta < 0:
                    opkts_delta = 0

                # Bytes per second
                inbound_bps = ibytes_delta / time_delta
                outbound_bps = obytes_delta / time_delta

                # Packets per second
                inbound_pps = ipkts_delta / time_delta
                outbound_pps = opkts_delta / time_delta
                total_pps = inbound_pps + outbound_pps

                # Log to help debug
                import sys
                sys.stderr.write(f"\nDEBUG: ibytes_delta={ibytes_delta:,}, obytes_delta={obytes_delta:,}, time={time_delta:.2f}s\n")
                sys.stderr.write(f"DEBUG: inbound_bps={inbound_bps:,.0f}, outbound_bps={outbound_bps:,.0f}\n")
                sys.stderr.write(f"DEBUG: inbound_pps={inbound_pps:,.0f}, outbound_pps={outbound_pps:,.0f}, total_pps={total_pps:,.0f}\n")
                sys.stderr.flush()

                # Convert bytes/sec to Mbps
                # Bytes/sec -> bits/sec (multiply by 8)
                # bits/sec -> Mbps (divide by 1,000,000)
                # Combined: (bytes/sec * 8) / 1,000,000 = bytes/sec / 125,000
                inbound_mbps = inbound_bps / 125000
                outbound_mbps = outbound_bps / 125000
                total_mbps = inbound_mbps + outbound_mbps

                sys.stderr.write(f"DEBUG: Result: inbound={inbound_mbps:.2f} Mbps, outbound={outbound_mbps:.2f} Mbps\n\n")
                sys.stderr.flush()
            else:
                # First run or invalid delta
                inbound_mbps = 0
                outbound_mbps = 0
                total_mbps = 0
                inbound_pps = 0
                outbound_pps = 0
                total_pps = 0

            # Update device stats for this device (with thread safety)
            with previous_stats_lock:
                device_stats['ibytes'] = total_ibytes
                device_stats['obytes'] = total_obytes
                device_stats['ipkts'] = total_ipkts
                device_stats['opkts'] = total_opkts
                device_stats['timestamp'] = current_time

            # Get session count data
            session_data = get_session_count()

            # Get system resource data
            resource_data = get_system_resources()

            # Load settings to get max_logs and top_apps_count
            settings = load_settings()
            max_logs = settings.get('match_count', 5)
            top_apps_count = settings.get('top_apps_count', 5)

            # Get threat statistics
            threat_data = get_threat_stats(max_logs)

            # Get system logs (limit to max_logs)
            system_logs = get_system_logs()[:max_logs]

            # Get interface statistics
            interface_data = get_interface_stats()

            # Get top applications
            top_apps = get_top_applications(top_apps_count)

            # Calculate interface utilization percentages
            inbound_utilization = (inbound_mbps / interface_speed_mbps * 100) if interface_speed_mbps > 0 else 0
            outbound_utilization = (outbound_mbps / interface_speed_mbps * 100) if interface_speed_mbps > 0 else 0
            total_utilization = (total_mbps / interface_speed_mbps * 100) if interface_speed_mbps > 0 else 0

            return {
                'timestamp': datetime.now().isoformat(),
                'inbound_mbps': round(max(0, inbound_mbps), 2),
                'outbound_mbps': round(max(0, outbound_mbps), 2),
                'total_mbps': round(max(0, total_mbps), 2),
                'inbound_pps': round(max(0, inbound_pps), 0),
                'outbound_pps': round(max(0, outbound_pps), 0),
                'total_pps': round(max(0, total_pps), 0),
                'interface_speed_mbps': interface_speed_mbps,
                'inbound_utilization': round(max(0, min(100, inbound_utilization)), 2),
                'outbound_utilization': round(max(0, min(100, outbound_utilization)), 2),
                'total_utilization': round(max(0, min(100, total_utilization)), 2),
                'sessions': session_data,
                'cpu': resource_data,
                'threats': threat_data,
                'system_logs': system_logs,
                'interfaces': interface_data,
                'top_applications': top_apps,
                'api_stats': get_api_stats(),
                'status': 'success'
            }
        else:
            return {'status': 'error', 'message': f'HTTP {response.status_code}'}

    except requests.exceptions.RequestException as e:
        return {'status': 'error', 'message': str(e)}
    except Exception as e:
        return {'status': 'error', 'message': f'Error: {str(e)}'}

@app.route('/')
def index():
    """Serve the main dashboard"""
    return render_template('index.html')

@app.route('/images/<path:filename>')
def serve_images(filename):
    """Serve image files"""
    from flask import send_from_directory
    images_dir = os.path.join(os.path.dirname(__file__), 'images')
    return send_from_directory(images_dir, filename)

@app.route('/api/throughput')
def throughput():
    """API endpoint for real-time throughput data"""
    data = get_throughput_data()
    response = jsonify(data)
    # Prevent caching to ensure fresh data on every request
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/api/health')
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'timestamp': datetime.now().isoformat()})

@app.route('/api/system-logs')
def system_logs_api():
    """API endpoint for system logs"""
    try:
        logs = get_system_logs(max_logs=50)
        return jsonify({
            'status': 'success',
            'logs': logs,
            'total': len(logs),
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e),
            'logs': []
        })

@app.route('/api/traffic-logs')
def traffic_logs_api():
    """API endpoint for traffic logs"""
    try:
        max_logs = request.args.get('max_logs', 50, type=int)
        logs = get_traffic_logs(max_logs)
        return jsonify({
            'status': 'success',
            'logs': logs,
            'total': len(logs),
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e),
            'logs': []
        })

@app.route('/api/connected-devices')
def connected_devices_api():
    """API endpoint for connected devices"""
    try:
        log_debug("=== Connected Devices API called ===")
        devices = get_connected_devices()
        log_debug(f"Found {len(devices)} devices")

        # Add MAC vendor lookup for devices with MAC addresses
        for device in devices:
            if device.get('mac'):
                log_debug(f"Looking up vendor for MAC: {device['mac']}")
                vendor_info = get_mac_vendor(device['mac'])
                device['vendor'] = vendor_info.get('vendor', '')
                device['country'] = vendor_info.get('country', '')
                log_debug(f"Vendor info: {vendor_info}")

        response = jsonify({
            'status': 'success',
            'devices': devices,
            'total': len(devices),
            'timestamp': datetime.now().isoformat()
        })
        # Prevent caching to ensure fresh device data
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    except Exception as e:
        log_debug(f"Error in connected_devices_api: {e}")
        import traceback
        log_debug(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'status': 'error',
            'message': str(e),
            'devices': []
        })

@app.route('/api/client-apps/<client_ip>')
def client_apps_api(client_ip):
    """API endpoint to get top applications for a specific client IP"""
    try:
        log_debug(f"=== Client Apps API called for IP: {client_ip} ===")

        # Get application data for the client
        app_data = get_client_applications(client_ip)

        return jsonify({
            'status': 'success',
            'client_ip': client_ip,
            'applications': app_data['applications'],
            'total_sessions': app_data['total_sessions'],
            'total_bytes': app_data['total_bytes'],
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        log_debug(f"Error in client_apps_api: {e}")
        import traceback
        log_debug(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'status': 'error',
            'message': str(e),
            'applications': []
        })

# Cache for MAC vendor lookups and database
mac_vendor_cache = {}
mac_vendor_database = None
mac_vendor_database_loaded = False

def load_mac_vendor_database():
    """Load MAC vendor database from JSON file"""
    global mac_vendor_database, mac_vendor_database_loaded

    if mac_vendor_database_loaded:
        return mac_vendor_database

    try:
        db_path = os.path.join(DATA_DIR, 'mac-vendors-export.json')
        if not os.path.exists(db_path):
            log_debug("MAC vendor database not found")
            mac_vendor_database_loaded = True
            return None

        with open(db_path, 'r') as f:
            data = json.load(f)

        # Build a lookup dictionary indexed by MAC prefix for fast lookups
        # Support various MAC prefix formats: AA:BB:CC, AA-BB-CC, AABBCC
        lookup_dict = {}
        for entry in data:
            # Get the MAC prefix from the entry
            # Support different possible field names
            mac_prefix = entry.get('macPrefix') or entry.get('mac_prefix') or entry.get('oui') or entry.get('assignment')

            if mac_prefix:
                # Normalize MAC prefix - remove separators and convert to uppercase
                normalized = mac_prefix.replace(':', '').replace('-', '').replace('.', '').upper()
                # Store with first 6 characters (OUI)
                if len(normalized) >= 6:
                    oui = normalized[:6]
                    lookup_dict[oui] = {
                        'vendor': entry.get('vendorName') or entry.get('vendor_name') or entry.get('companyName') or entry.get('organization') or '',
                        'country': entry.get('country') or entry.get('countryCode') or ''
                    }

        mac_vendor_database = lookup_dict
        mac_vendor_database_loaded = True
        log_debug(f"MAC vendor database loaded with {len(lookup_dict)} entries")
        return mac_vendor_database

    except Exception as e:
        log_debug(f"Error loading MAC vendor database: {e}")
        import traceback
        log_debug(f"Traceback: {traceback.format_exc()}")
        mac_vendor_database_loaded = True
        return None

def get_mac_vendor(mac_address):
    """Lookup MAC address vendor information from local database"""
    if not mac_address:
        return {'vendor': '', 'country': ''}

    # Check if database has been uploaded by checking settings metadata
    settings = load_settings()
    db_metadata = settings.get('mac_vendor_db', {})

    if not db_metadata.get('uploaded', False):
        # No database uploaded, skip lookup entirely
        return {'vendor': '', 'country': ''}

    # Check cache first
    if mac_address in mac_vendor_cache:
        return mac_vendor_cache[mac_address]

    try:
        # Load database if not already loaded
        db = load_mac_vendor_database()
        if not db:
            vendor_info = {'vendor': '', 'country': ''}
            mac_vendor_cache[mac_address] = vendor_info
            return vendor_info

        # Normalize MAC address - extract OUI (first 6 hex digits)
        normalized = mac_address.replace(':', '').replace('-', '').replace('.', '').upper()
        if len(normalized) >= 6:
            oui = normalized[:6]

            # Lookup in database
            if oui in db:
                vendor_info = db[oui]
                log_debug(f"MAC lookup for {mac_address} (OUI: {oui}): Found {vendor_info.get('vendor', 'Unknown')}")
            else:
                vendor_info = {'vendor': '', 'country': ''}
                log_debug(f"MAC lookup for {mac_address} (OUI: {oui}): Not found")
        else:
            vendor_info = {'vendor': '', 'country': ''}
            log_debug(f"MAC lookup for {mac_address}: Invalid MAC format")

        # Cache the result
        mac_vendor_cache[mac_address] = vendor_info
        return vendor_info

    except Exception as e:
        log_debug(f"Error looking up MAC vendor for {mac_address}: {e}")
        import traceback
        log_debug(f"Traceback: {traceback.format_exc()}")
        # Return empty and cache to avoid repeated failures
        vendor_info = {'vendor': '', 'country': ''}
        mac_vendor_cache[mac_address] = vendor_info
        return vendor_info

def get_client_applications(client_ip, max_logs=100):
    """
    Fetch and aggregate application usage for a specific client IP.
    Returns top applications with session counts and bandwidth usage.
    """
    try:
        _, api_key, base_url = get_firewall_config()

        # Query traffic logs for this specific client IP
        log_query = f"(addr.src in {client_ip})"
        params = {
            'type': 'log',
            'log-type': 'traffic',
            'query': log_query,
            'nlogs': str(max_logs),
            'key': api_key
        }

        log_debug(f"Querying traffic logs for client {client_ip}")
        response = api_request_get(base_url, params=params, verify=False, timeout=15)
        log_debug(f"Client apps query status: {response.status_code}")

        app_stats = {}
        total_sessions = 0
        total_bytes = 0

        if response.status_code == 200:
            root = ET.fromstring(response.text)

            # Check if this is a job response (async log query)
            job_id = root.find('.//job')
            if job_id is not None and job_id.text:
                log_debug(f"Job ID received: {job_id.text}, fetching results...")

                # Wait briefly and fetch job results
                time.sleep(1)
                result_params = {
                    'type': 'log',
                    'action': 'get',
                    'job-id': job_id.text,
                    'key': api_key
                }

                result_response = api_request_get(base_url, params=result_params, verify=False, timeout=15)
                if result_response.status_code == 200:
                    root = ET.fromstring(result_response.text)

            # Parse log entries
            log_entries = root.findall('.//entry')
            log_debug(f"Found {len(log_entries)} traffic log entries for {client_ip}")

            for entry in log_entries:
                app = entry.find('app')
                bytes_sent = entry.find('bytes_sent')
                bytes_received = entry.find('bytes_received')
                dst = entry.find('dst')
                dport = entry.find('dport')
                proto = entry.find('proto')

                app_name = app.text if app is not None else 'unknown'
                bytes_s = int(bytes_sent.text) if bytes_sent is not None and bytes_sent.text else 0
                bytes_r = int(bytes_received.text) if bytes_received is not None and bytes_received.text else 0
                total_bytes_session = bytes_s + bytes_r

                dst_ip = dst.text if dst is not None else ''
                dst_port = dport.text if dport is not None else ''
                protocol = proto.text if proto is not None else ''

                # Aggregate by application
                if app_name not in app_stats:
                    app_stats[app_name] = {
                        'app': app_name,
                        'sessions': 0,
                        'bytes_sent': 0,
                        'bytes_received': 0,
                        'total_bytes': 0,
                        'destinations': set(),
                        'ports': set(),
                        'protocols': set()
                    }

                app_stats[app_name]['sessions'] += 1
                app_stats[app_name]['bytes_sent'] += bytes_s
                app_stats[app_name]['bytes_received'] += bytes_r
                app_stats[app_name]['total_bytes'] += total_bytes_session

                if dst_ip:
                    app_stats[app_name]['destinations'].add(dst_ip)
                if dst_port:
                    app_stats[app_name]['ports'].add(dst_port)
                if protocol:
                    app_stats[app_name]['protocols'].add(protocol)

                total_sessions += 1
                total_bytes += total_bytes_session

        # Convert sets to lists and format data
        applications = []
        for app_name, stats in app_stats.items():
            applications.append({
                'app': app_name,
                'sessions': stats['sessions'],
                'bytes_sent': stats['bytes_sent'],
                'bytes_received': stats['bytes_received'],
                'total_bytes': stats['total_bytes'],
                'destinations_count': len(stats['destinations']),
                'ports': list(stats['ports'])[:5],  # Top 5 ports
                'protocols': list(stats['protocols'])
            })

        # Sort by total bytes descending
        applications.sort(key=lambda x: x['total_bytes'], reverse=True)

        log_debug(f"Found {len(applications)} unique applications for {client_ip}")

        return {
            'applications': applications,
            'total_sessions': total_sessions,
            'total_bytes': total_bytes
        }

    except Exception as e:
        log_debug(f"Error fetching client applications: {e}")
        import traceback
        log_debug(f"Traceback: {traceback.format_exc()}")
        return {
            'applications': [],
            'total_sessions': 0,
            'total_bytes': 0
        }

def get_traffic_logs(max_logs=50):
    """Fetch traffic logs from Palo Alto firewall"""
    try:
        _, api_key, base_url = get_firewall_config()

        # Query traffic logs
        log_query = "(subtype eq end)"
        params = {
            'type': 'log',
            'log-type': 'traffic',
            'query': log_query,
            'nlogs': str(max_logs),
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=10)
        log_debug(f"Traffic logs query status: {response.status_code}")

        traffic_logs = []

        if response.status_code == 200:
            root = ET.fromstring(response.text)

            # Check if this is a job response (async log query)
            job_id = root.find('.//job')
            if job_id is not None and job_id.text:
                log_debug(f"Job ID received: {job_id.text}, fetching traffic log results...")

                # Wait briefly and fetch job results
                time.sleep(0.5)
                result_params = {
                    'type': 'log',
                    'action': 'get',
                    'job-id': job_id.text,
                    'key': api_key
                }

                result_response = api_request_get(base_url, params=result_params, verify=False, timeout=10)
                if result_response.status_code == 200:
                    root = ET.fromstring(result_response.text)

            # Find all log entries
            for entry in root.findall('.//entry'):
                # Pull receive_time using recursive search like system logs
                receive_time_elem = entry.find('.//receive_time') or entry.find('.//time_generated')
                time_generated = receive_time_elem.text if receive_time_elem is not None and receive_time_elem.text else ''

                # Debug: Log time info for first entry
                if len(traffic_logs) == 0:
                    log_debug(f"First traffic log entry - receive_time: {time_generated}")

                src = entry.find('src')
                dst = entry.find('dst')
                sport = entry.find('sport')
                dport = entry.find('dport')
                app = entry.find('app')
                proto = entry.find('proto')
                action = entry.find('action')
                bytes_sent = entry.find('bytes_sent')
                bytes_received = entry.find('bytes')
                packets = entry.find('packets')
                session_end_reason = entry.find('session_end_reason')
                from_zone = entry.find('from')
                to_zone = entry.find('to')

                traffic_logs.append({
                    'time': time_generated,
                    'src': src.text if src is not None else '',
                    'dst': dst.text if dst is not None else '',
                    'sport': sport.text if sport is not None else '',
                    'dport': dport.text if dport is not None else '',
                    'app': app.text if app is not None else '',
                    'proto': proto.text if proto is not None else '',
                    'action': action.text if action is not None else '',
                    'bytes_sent': bytes_sent.text if bytes_sent is not None else '0',
                    'bytes_received': bytes_received.text if bytes_received is not None else '0',
                    'packets': packets.text if packets is not None else '0',
                    'session_end_reason': session_end_reason.text if session_end_reason is not None else '',
                    'from_zone': from_zone.text if from_zone is not None else '',
                    'to_zone': to_zone.text if to_zone is not None else ''
                })

            log_debug(f"Found {len(traffic_logs)} traffic log entries")

        return traffic_logs

    except Exception as e:
        log_debug(f"Error fetching traffic logs: {e}")
        return []

def get_connected_devices():
    """Fetch connected devices from Palo Alto firewall - includes ARP from layer 3 devices (routers)"""
    try:
        _, api_key, base_url = get_firewall_config()

        devices_dict = {}  # Use dict to track unique devices by IP+MAC

        # Step 1: Query the main firewall ARP table
        log_debug("Querying main firewall ARP table...")
        cmd = "<show><arp><entry name='all'/></arp></show>"
        params = {
            'type': 'op',
            'cmd': cmd,
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=10)
        log_debug(f"Main ARP query status: {response.status_code}")

        if response.status_code == 200:
            root = ET.fromstring(response.text)
            if root.get('status') == 'success':
                entries = root.findall('.//entries/entry')
                log_debug(f"Found {len(entries)} ARP entries from main firewall")

                for entry in entries:
                    ip = entry.find('ip')
                    mac = entry.find('mac')
                    interface = entry.find('interface')
                    status = entry.find('status')
                    ttl = entry.find('ttl')
                    port = entry.find('port')

                    ip_text = ip.text if ip is not None else ''
                    mac_text = mac.text if mac is not None else ''

                    if ip_text or mac_text:
                        device_key = f"{ip_text}_{mac_text}"
                        status_text = status.text.strip() if status is not None and status.text else ''

                        if device_key not in devices_dict:
                            # Extract VLAN from interface name if present
                            interface_name = interface.text if interface is not None else ''
                            vlan = ''
                            if interface_name and '.' in interface_name:
                                vlan = interface_name.split('.')[-1]

                            device_entry = {
                                'hostname': ip_text,
                                'ip': ip_text,
                                'mac': mac_text,
                                'interface': interface_name,
                                'vlan': vlan,
                                'status': status_text,
                                'ttl': ttl.text if ttl is not None else '',
                                'port': port.text if port is not None else '',
                                'source': 'firewall'
                            }
                            devices_dict[device_key] = device_entry

        log_debug(f"Total devices after main firewall ARP: {len(devices_dict)}")

        # Step 2: Query active sessions to find devices behind routers
        # This will show all source IPs that have active or recent sessions through the firewall
        log_debug("Querying active sessions to find devices behind routers...")

        session_cmd = "<show><session><all></all></session></show>"
        session_params = {
            'type': 'op',
            'cmd': session_cmd,
            'key': api_key
        }

        session_response = api_request_get(base_url, params=session_params, verify=False, timeout=10)
        log_debug(f"Session query status: {session_response.status_code}")

        if session_response.status_code == 200:
            session_root = ET.fromstring(session_response.text)
            log_debug(f"Session XML (first 3000 chars): {ET.tostring(session_root, encoding='unicode')[:3000]}")

            if session_root.get('status') == 'success':
                # Parse session entries to extract unique source IPs with their interface/vlan info
                session_entries = session_root.findall('.//entry')
                log_debug(f"Found {len(session_entries)} session entries")

                # Track unique IPs with their associated interface and VLAN info
                source_ip_info = {}
                for entry in session_entries:
                    source = entry.find('source')
                    ingress = entry.find('ingress')
                    egress = entry.find('egress')
                    vsys = entry.find('vsys')

                    if source is not None and source.text:
                        source_ip = source.text
                        if source_ip not in source_ip_info:
                            source_ip_info[source_ip] = {
                                'ingress': ingress.text if ingress is not None else '',
                                'egress': egress.text if egress is not None else '',
                                'vsys': vsys.text if vsys is not None else ''
                            }

                log_debug(f"Found {len(source_ip_info)} unique source IPs from sessions")

                # Add these IPs to our devices list (without MAC since we don't have ARP for them)
                for ip, info in source_ip_info.items():
                    device_key = f"{ip}_unknown"
                    if device_key not in devices_dict:
                        # Check if we already have this IP with a known MAC
                        already_exists = False
                        for existing_key in devices_dict:
                            if existing_key.startswith(f"{ip}_"):
                                already_exists = True
                                break

                        if not already_exists:
                            # Extract VLAN from interface name if present (e.g., vlan.100)
                            interface_name = info['ingress'] or info['egress']
                            vlan = ''
                            if interface_name and '.' in interface_name:
                                vlan = interface_name.split('.')[-1]

                            device_entry = {
                                'hostname': ip,
                                'ip': ip,
                                'mac': '',  # No MAC available from session data
                                'interface': interface_name,
                                'vlan': vlan,
                                'status': 'active_session',
                                'ttl': '',
                                'port': interface_name,
                                'source': 'session'
                            }
                            devices_dict[device_key] = device_entry

                log_debug(f"Total devices after session query: {len(devices_dict)}")

        # Step 3: Query MAC address table (which includes devices behind routers)
        log_debug("Querying MAC address table from firewall...")

        # Use the MAC address table command
        mac_cmd = "<show><mac>all</mac></show>"
        mac_params = {
            'type': 'op',
            'cmd': mac_cmd,
            'key': api_key
        }

        mac_response = api_request_get(base_url, params=mac_params, verify=False, timeout=10)
        log_debug(f"MAC table query status: {mac_response.status_code}")

        if mac_response.status_code == 200:
            mac_root = ET.fromstring(mac_response.text)
            log_debug(f"MAC table XML (first 5000 chars): {ET.tostring(mac_root, encoding='unicode')[:5000]}")

            if mac_root.get('status') == 'success':
                # Parse MAC table entries
                mac_entries = mac_root.findall('.//entry')
                log_debug(f"Found {len(mac_entries)} entries from MAC address table")

                for entry in mac_entries:
                    # MAC table has different fields than ARP table
                    mac = entry.find('mac')
                    interface = entry.find('interface')
                    vlan = entry.find('vlan')
                    port = entry.find('port')

                    mac_text = mac.text if mac is not None else ''

                    # MAC table doesn't have IP addresses directly
                    # We can use MAC to see which devices are present
                    if mac_text:
                        # Check if we already have this MAC from ARP table (which has IP)
                        found_in_arp = False
                        for existing_key in devices_dict:
                            if mac_text in existing_key:
                                found_in_arp = True
                                break

                        # If not in ARP table, add it with MAC only
                        if not found_in_arp:
                            device_key = f"unknown_{mac_text}"
                            if device_key not in devices_dict:
                                device_entry = {
                                    'hostname': mac_text,  # Use MAC as hostname if no IP
                                    'ip': '',  # No IP available in MAC table
                                    'mac': mac_text,
                                    'interface': interface.text if interface is not None else '',
                                    'status': 'learned',
                                    'ttl': '',
                                    'port': port.text if port is not None else (interface.text if interface is not None else ''),
                                    'source': 'mac_table'
                                }
                                devices_dict[device_key] = device_entry

                log_debug(f"Total devices after MAC table query: {len(devices_dict)}")

        # Convert dict back to list
        devices = list(devices_dict.values())
        log_debug(f"Returning {len(devices)} connected devices in total")

        # Update cache with new device detection
        devices = update_connected_devices_cache(devices)

        return devices

    except Exception as e:
        log_debug(f"Error fetching connected devices: {e}")
        import traceback
        log_debug(f"Traceback: {traceback.format_exc()}")
        return []

def update_connected_devices_cache(current_devices):
    """
    Update the connected devices cache and mark new devices.
    Devices not seen before are marked as 'new' with a first_seen timestamp.
    """
    try:
        os.makedirs(DATA_DIR, exist_ok=True)

        # Load existing cache
        cache = {}
        if os.path.exists(CONNECTED_DEVICES_CACHE_FILE):
            try:
                with open(CONNECTED_DEVICES_CACHE_FILE, 'r') as f:
                    cache_data = json.load(f)
                    cache = cache_data.get('devices', {})
                    log_debug(f"Loaded cache with {len(cache)} devices")
            except Exception as e:
                log_debug(f"Error loading cache: {e}")
                cache = {}

        current_time = datetime.now().isoformat()
        updated_cache = {}

        # Process each current device
        for device in current_devices:
            # Create unique key for device (IP + MAC)
            device_key = f"{device.get('ip', '')}_{device.get('mac', '')}"

            # Check if this device exists in cache
            if device_key in cache:
                # Existing device - preserve first_seen and is_new status
                cached_device = cache[device_key]
                device['first_seen'] = cached_device.get('first_seen', current_time)
                device['last_seen'] = current_time

                # Calculate if device is still "new" (within 24 hours)
                try:
                    first_seen_dt = datetime.fromisoformat(device['first_seen'])
                    time_diff = datetime.now() - first_seen_dt
                    device['is_new'] = time_diff.total_seconds() < 86400  # 24 hours in seconds
                    device['age_hours'] = int(time_diff.total_seconds() / 3600)
                except (ValueError, TypeError, KeyError) as e:
                    log_debug(f"Error parsing device timestamp: {e}")
                    device['is_new'] = False
                    device['age_hours'] = 0
            else:
                # New device - mark as new with current timestamp
                device['first_seen'] = current_time
                device['last_seen'] = current_time
                device['is_new'] = True
                device['age_hours'] = 0
                log_debug(f"New device detected: {device.get('ip', 'unknown')} / {device.get('mac', 'unknown')}")

            # Update cache
            updated_cache[device_key] = {
                'first_seen': device['first_seen'],
                'last_seen': device['last_seen'],
                'ip': device.get('ip', ''),
                'mac': device.get('mac', ''),
                'hostname': device.get('hostname', '')
            }

        # Save updated cache
        cache_data = {
            'devices': updated_cache,
            'last_update': current_time
        }

        with open(CONNECTED_DEVICES_CACHE_FILE, 'w') as f:
            json.dump(cache_data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())

        log_debug(f"Cache updated with {len(updated_cache)} devices")

        return current_devices

    except Exception as e:
        log_debug(f"Error updating connected devices cache: {e}")
        import traceback
        log_debug(f"Traceback: {traceback.format_exc()}")
        # Return devices without cache updates if error occurs
        return current_devices

def get_policy_hit_counts():
    """Fetch security policy hit counts from Palo Alto firewall"""
    try:
        firewall_ip, api_key, _ = get_firewall_config()

        # Use REST API to get security rules with hit counts
        rest_url = f"https://{firewall_ip}/restapi/v11.0/Policies/SecurityRules"
        headers = {
            'X-PAN-KEY': api_key,
            'Content-Type': 'application/json'
        }

        # Add location parameter for vsys1
        params = {
            'location': 'vsys',
            'vsys': 'vsys1'
        }

        log_debug(f"\n=== Policy REST API Request ===")
        log_debug(f"URL: {rest_url}")
        log_debug(f"Params: {params}")

        response = api_request_get(rest_url, headers=headers, params=params, verify=False, timeout=10)
        log_debug(f"Status: {response.status_code}")

        policies = []

        if response.status_code == 200:
            try:
                data = response.json()
                log_debug(f"Response (first 2000 chars):\n{str(data)[:2000]}")

                # REST API returns data in 'result' or 'entry' field
                entries = data.get('result', {}).get('entry', [])
                if not entries:
                    entries = data.get('entry', [])

                log_debug(f"Found {len(entries)} policy entries from REST API")

                # Get hit counts using XML config API
                xml_base_url = f"https://{firewall_ip}/api/"

                hit_counts = {}
                latest_hits = {}
                first_hits = {}

                # Build list of all rule names to query
                rule_names = []
                for entry in entries:
                    name = entry.get('@name', entry.get('name', None))
                    if name:
                        rule_names.append(name)

                log_debug(f"Querying hit counts for {len(rule_names)} rules: {rule_names}")

                # Query hit counts for all rules at once
                if rule_names:
                    # Build the XML command with all rule names
                    members_xml = ''.join([f'<member>{name}</member>' for name in rule_names])
                    show_cmd = f"<show><rule-hit-count><vsys><vsys-name><entry name='vsys1'><rule-base><entry name='security'><rules><list>{members_xml}</list></rules></entry></rule-base></entry></vsys-name></vsys></rule-hit-count></show>"

                    show_params = {
                        'type': 'op',
                        'cmd': show_cmd,
                        'key': api_key
                    }

                    log_debug(f"Hit count command (first 500 chars): {show_cmd[:500]}")

                    hit_count_response = api_request_get(xml_base_url, params=show_params, verify=False, timeout=15)
                    log_debug(f"Hit count API Status: {hit_count_response.status_code}")

                    if hit_count_response.status_code == 200:
                        hit_root = ET.fromstring(hit_count_response.text)
                        log_debug(f"Hit count XML (first 5000 chars):\n{hit_count_response.text[:5000]}")

                        # Check if command was successful
                        status = hit_root.get('status')
                        if status != 'success':
                            log_debug(f"Hit count command failed with status: {status}")
                            error_msg = hit_root.find('.//msg')
                            if error_msg is not None:
                                log_debug(f"Error message: {ET.tostring(error_msg, encoding='unicode')}")
                        else:
                            # Try multiple XPath patterns to find the hit count data
                            patterns_tried = 0

                            # Pattern 1: .//rule/entry
                            for rule_entry in hit_root.findall('.//rule/entry'):
                                patterns_tried += 1
                                rule_name = rule_entry.get('name')
                                hit_count_elem = rule_entry.find('.//hit-count')

                                # Try multiple possible field names for latest hit
                                latest_elem = (rule_entry.find('.//latest') or
                                             rule_entry.find('.//last-hit') or
                                             rule_entry.find('.//latest-hit') or
                                             rule_entry.find('.//last-hit-timestamp'))

                                # Try multiple possible field names for first hit
                                first_elem = (rule_entry.find('.//first-hit') or
                                            rule_entry.find('.//first') or
                                            rule_entry.find('.//first-hit-timestamp'))

                                if rule_name and hit_count_elem is not None and hit_count_elem.text:
                                    try:
                                        hit_counts[rule_name] = int(hit_count_elem.text)
                                        log_debug(f"  Rule '{rule_name}': {hit_count_elem.text} hits")
                                    except (ValueError, TypeError) as e:
                                        log_debug(f"Error parsing hit count for rule {rule_name}: {e}")
                                        pass

                                    if latest_elem is not None and latest_elem.text:
                                        latest_hits[rule_name] = latest_elem.text
                                        log_debug(f"    Latest hit: {latest_elem.text}")
                                    if first_elem is not None and first_elem.text:
                                        first_hits[rule_name] = first_elem.text
                                        log_debug(f"    First hit: {first_elem.text}")

                            # Pattern 2: .//entry (if pattern 1 didn't find anything)
                            if not hit_counts:
                                for rule_entry in hit_root.findall('.//entry'):
                                    patterns_tried += 1
                                    rule_name = rule_entry.get('name')
                                    hit_count_elem = rule_entry.find('.//hit-count')

                                    # Try multiple possible field names for latest hit
                                    latest_elem = (rule_entry.find('.//latest') or
                                                 rule_entry.find('.//last-hit') or
                                                 rule_entry.find('.//latest-hit') or
                                                 rule_entry.find('.//last-hit-timestamp'))

                                    # Try multiple possible field names for first hit
                                    first_elem = (rule_entry.find('.//first-hit') or
                                                rule_entry.find('.//first') or
                                                rule_entry.find('.//first-hit-timestamp'))

                                    if rule_name and hit_count_elem is not None and hit_count_elem.text:
                                        try:
                                            hit_counts[rule_name] = int(hit_count_elem.text)
                                            log_debug(f"  Rule '{rule_name}': {hit_count_elem.text} hits (pattern 2)")
                                        except (ValueError, TypeError) as e:
                                            log_debug(f"Error parsing hit count for rule {rule_name} (pattern 2): {e}")
                                            pass

                                        if latest_elem is not None and latest_elem.text:
                                            latest_hits[rule_name] = latest_elem.text
                                            log_debug(f"    Latest hit: {latest_elem.text}")
                                        if first_elem is not None and first_elem.text:
                                            first_hits[rule_name] = first_elem.text
                                            log_debug(f"    First hit: {first_elem.text}")

                            log_debug(f"Parsed {len(hit_counts)} hit counts from API (tried {patterns_tried} entries)")

                # Combine REST API policy names with traffic log hit counts
                for entry in entries:
                    name = entry.get('@name', entry.get('name', 'Unknown'))
                    hit_count = hit_counts.get(name, 0)
                    latest_hit = latest_hits.get(name, 'N/A')
                    first_hit = first_hits.get(name, 'N/A')

                    policies.append({
                        'name': name,
                        'hit_count': hit_count,
                        'latest_hit': latest_hit,
                        'first_hit': first_hit,
                        'type': 'security'
                    })

            except Exception as json_error:
                log_debug(f"JSON parsing error: {json_error}")

            log_debug(f"Found {len(policies)} policy entries")

            log_debug(f"Total policies: {len(policies)}")

            # Calculate trends based on last 5 readings (with thread safety)
            global policy_history
            for policy in policies:
                policy_name = policy['name']
                current_count = policy['hit_count']

                with policy_history_lock:
                    # Initialize history for this policy if not exists
                    if policy_name not in policy_history:
                        policy_history[policy_name] = []

                    # Add current count to history
                    policy_history[policy_name].append(current_count)

                    # Keep only last 5 readings
                    if len(policy_history[policy_name]) > 5:
                        policy_history[policy_name] = policy_history[policy_name][-5:]

                    # Calculate trend if we have at least 2 readings
                    if len(policy_history[policy_name]) >= 2:
                        recent_counts = policy_history[policy_name].copy()  # Copy to avoid lock issues
                        # Compare most recent to average of previous readings
                        if len(recent_counts) > 1:
                            previous_avg = sum(recent_counts[:-1]) / len(recent_counts[:-1])
                            current = recent_counts[-1]

                            if current > previous_avg * 1.1:  # 10% increase threshold
                                policy['trend'] = 'up'
                            elif current < previous_avg * 0.9:  # 10% decrease threshold
                                policy['trend'] = 'down'
                            else:
                                policy['trend'] = 'stable'
                        else:
                            policy['trend'] = 'stable'
                    else:
                        policy['trend'] = None

            # Sort by hit count descending
            policies.sort(key=lambda x: x['hit_count'], reverse=True)

        return {
            'status': 'success',
            'policies': policies,
            'total': len(policies),
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        log_debug(f"Policy hit count error: {str(e)}")
        import traceback
        log_debug(f"Traceback: {traceback.format_exc()}")
        return {
            'status': 'error',
            'message': str(e),
            'policies': []
        }

@app.route('/api/policies')
def policies():
    """API endpoint for policy hit counts"""
    data = get_policy_hit_counts()
    return jsonify(data)

@app.route('/api/nat-policies')
def nat_policies():
    """API endpoint for NAT policy rules"""
    data = get_nat_policies()
    return jsonify(data)

def get_nat_policies():
    """Fetch NAT policy rules from Palo Alto firewall"""
    try:
        firewall_ip, api_key, base_url = get_firewall_config()

        log_debug(f"\n=== NAT Policy API Request ===")

        nat_rules = []

        # Use config API to get NAT rules from /config/devices
        xpath = "/config/devices/entry[@name='localhost.localdomain']/vsys/entry[@name='vsys1']/rulebase/nat/rules"
        params = {
            'type': 'config',
            'action': 'get',
            'xpath': xpath,
            'key': api_key
        }

        log_debug(f"API URL: {base_url}")
        log_debug(f"XPath: {xpath}")

        response = api_request_get(base_url, params=params, verify=False, timeout=15)
        log_debug(f"NAT Policy Status: {response.status_code}")
        log_debug(f"Response content-type: {response.headers.get('content-type', 'unknown')}")

        if response.status_code == 200:
            try:
                # Parse XML response
                root = ET.fromstring(response.text)
                log_debug(f"NAT Response XML (first 2000 chars):\n{response.text[:2000]}")

                # Check if the response was successful
                status = root.get('status')
                if status != 'success':
                    error_msg = root.find('.//msg')
                    error_text = error_msg.text if error_msg is not None else 'Unknown error'
                    log_debug(f"NAT config API failed: {error_text}")
                    return {
                        'status': 'error',
                        'message': f'NAT policy query failed: {error_text}',
                        'nat_policies': []
                    }

                # Find all NAT rule entries from the result
                # The response will be: <response status="success"><result><rules><entry>...</entry></rules></result></response>
                entries = root.findall('.//result/rules/entry')
                if not entries:
                    # Fallback to just looking for any entry elements
                    entries = root.findall('.//entry')

                log_debug(f"Found {len(entries)} NAT policy entries")
                if len(entries) > 0:
                    log_debug(f"First entry name: {entries[0].get('name', 'N/A')}")

                # Helper function to get text from member elements
                def get_members_text(parent_element, tag_path):
                    """Extract member values from XML element"""
                    members = parent_element.findall(f'{tag_path}/member')
                    if members:
                        return ', '.join([m.text for m in members if m.text])
                    return 'Any'

                # Parse each NAT rule entry
                for entry in entries:
                    rule_name = entry.get('name', 'Unknown')

                    # Extract rule details
                    source_zone = get_members_text(entry, './from')
                    destination_zone = get_members_text(entry, './to')
                    source_address = get_members_text(entry, './source')
                    destination_address = get_members_text(entry, './destination')

                    service_elem = entry.find('./service')
                    service = service_elem.text if service_elem is not None and service_elem.text else 'Any'

                    # Determine NAT type and translation info
                    nat_type = 'Source NAT'
                    translated_address = 'N/A'
                    translated_port = 'N/A'

                    # Check for destination translation
                    dest_trans_addr = entry.find('.//destination-translation/translated-address')
                    dest_trans_port = entry.find('.//destination-translation/translated-port')

                    if dest_trans_addr is not None:
                        nat_type = 'Destination NAT'
                        translated_address = dest_trans_addr.text if dest_trans_addr.text else 'N/A'
                        translated_port = dest_trans_port.text if dest_trans_port is not None and dest_trans_port.text else 'N/A'

                    # Check for source translation (only if not destination NAT)
                    elif entry.find('.//source-translation') is not None:
                        # Dynamic IP and Port (interface-based)
                        interface_elem = entry.find('.//source-translation/dynamic-ip-and-port/interface-address/interface')
                        if interface_elem is not None:
                            nat_type = 'Dynamic IP & Port'
                            translated_address = f"Interface: {interface_elem.text}" if interface_elem.text else 'N/A'

                        # Dynamic IP and Port (translated address)
                        else:
                            trans_members = entry.findall('.//source-translation/dynamic-ip-and-port/translated-address/member')
                            if trans_members:
                                nat_type = 'Dynamic IP & Port'
                                translated_address = ', '.join([m.text for m in trans_members if m.text])

                            # Dynamic IP
                            else:
                                trans_members = entry.findall('.//source-translation/dynamic-ip/translated-address/member')
                                if trans_members:
                                    nat_type = 'Dynamic IP'
                                    translated_address = ', '.join([m.text for m in trans_members if m.text])

                                # Static IP
                                else:
                                    static_ip = entry.find('.//source-translation/static-ip/translated-address')
                                    if static_ip is not None:
                                        nat_type = 'Static IP'
                                        translated_address = static_ip.text if static_ip.text else 'N/A'

                    nat_rules.append({
                        'name': rule_name,
                        'type': nat_type,
                        'source_zone': source_zone,
                        'destination_zone': destination_zone,
                        'source_address': source_address,
                        'destination_address': destination_address,
                        'service': service,
                        'translated_address': translated_address,
                        'translated_port': translated_port
                    })

                log_debug(f"Parsed {len(nat_rules)} NAT rules")

            except ET.ParseError as pe:
                log_debug(f"XML parse error: {str(pe)}")
                log_debug(f"Response text (first 1000 chars): {response.text[:1000]}")
                return {
                    'status': 'error',
                    'message': 'Failed to parse NAT policies XML response',
                    'nat_policies': []
                }

        return {
            'status': 'success',
            'nat_policies': nat_rules,
            'count': len(nat_rules),
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        log_debug(f"Error fetching NAT policies: {str(e)}")
        import traceback
        log_debug(traceback.format_exc())
        return {
            'status': 'error',
            'message': str(e),
            'nat_policies': []
        }

def get_software_updates():
    """Fetch system software version information from Palo Alto firewall"""
    try:
        _, api_key, base_url = get_firewall_config()

        # Query for system information
        cmd = "<show><system><info></info></system></show>"
        params = {
            'type': 'op',
            'cmd': cmd,
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=10)
        log_debug(f"\n=== System Info API Response ===")
        log_debug(f"Status: {response.status_code}")

        software_info = []

        if response.status_code == 200:
            root = ET.fromstring(response.text)
            log_debug(f"Response XML (first 2000 chars):\n{response.text[:2000]}")

            # Helper function to check for updates using specific commands
            def get_update_status(cmd_xml):
                """Execute update check command and return downloaded/current/latest status"""
                try:
                    check_params = {
                        'type': 'op',
                        'cmd': cmd_xml,
                        'key': api_key
                    }
                    check_response = api_request_get(base_url, params=check_params, verify=False, timeout=10)

                    if check_response.status_code == 200:
                        check_root = ET.fromstring(check_response.text)
                        log_debug(f"Update check response (first 1000 chars):\n{check_response.text[:1000]}")

                        # Find the first entry with downloaded/current/latest fields
                        entries = check_root.findall('.//entry')
                        for entry in entries:
                            downloaded_elem = entry.find('.//downloaded')
                            current_elem = entry.find('.//current')
                            latest_elem = entry.find('.//latest')

                            # If we found at least one of these fields, return the status
                            if downloaded_elem is not None or current_elem is not None or latest_elem is not None:
                                return {
                                    'downloaded': downloaded_elem.text if downloaded_elem is not None and downloaded_elem.text else 'N/A',
                                    'current': current_elem.text if current_elem is not None and current_elem.text else 'N/A',
                                    'latest': latest_elem.text if latest_elem is not None and latest_elem.text else 'N/A'
                                }
                except Exception as e:
                    log_debug(f"Error checking update status: {e}")

                return {'downloaded': 'N/A', 'current': 'N/A', 'latest': 'N/A'}

            # Helper function to add software entry
            def add_software_entry(name, version_elem, update_cmd=None):
                if version_elem is not None and version_elem.text:
                    # Get update status if command provided
                    if update_cmd:
                        status = get_update_status(update_cmd)
                    else:
                        status = {'downloaded': 'N/A', 'current': 'N/A', 'latest': 'N/A'}

                    software_info.append({
                        'name': name,
                        'version': version_elem.text,
                        'downloaded': status['downloaded'],
                        'current': status['current'],
                        'latest': status['latest']
                    })

            # Extract specific version fields
            # GlobalProtect client package version
            gp_version = root.find('.//global-protect-client-package-version')
            add_software_entry('GlobalProtect Client', gp_version)

            # Application and threat signatures
            app_version = root.find('.//app-version')
            app_cmd = '<request><content><upgrade><check></check></upgrade></content></request>'
            add_software_entry('Application & Threat', app_version, app_cmd)

            # Antivirus signatures
            av_version = root.find('.//av-version')
            av_cmd = '<request><anti-virus><upgrade><check></check></upgrade></anti-virus></request>'
            add_software_entry('Antivirus', av_version, av_cmd)

            # WildFire version
            wildfire_version = root.find('.//wildfire-version')
            wildfire_cmd = '<request><wildfire><upgrade><check></check></upgrade></wildfire></request>'
            add_software_entry('WildFire', wildfire_version, wildfire_cmd)

            # PAN-OS version
            sw_version = root.find('.//sw-version')
            add_software_entry('PAN-OS', sw_version)

            log_debug(f"Software versions found: {software_info}")

        return {
            'status': 'success',
            'software': software_info,
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        log_debug(f"Software updates error: {str(e)}")
        return {
            'status': 'error',
            'message': str(e),
            'software': []
        }

@app.route('/api/software-updates')
def software_updates():
    """API endpoint for software update information"""
    data = get_software_updates()
    return jsonify(data)

@app.route('/api/mac-vendor-db', methods=['POST'])
def upload_mac_vendor_db():
    """Upload MAC vendor database JSON file"""
    try:
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'status': 'error', 'message': 'No file selected'}), 400

        if not file.filename.endswith('.json'):
            return jsonify({'status': 'error', 'message': 'File must be a JSON file'}), 400

        # Read and validate JSON
        content = file.read().decode('utf-8')
        try:
            data = json.loads(content)
            if not isinstance(data, list):
                return jsonify({'status': 'error', 'message': 'JSON must be an array of objects'}), 400

            # Validate structure - check first few entries
            if len(data) > 0:
                sample = data[0]
                if not isinstance(sample, dict):
                    return jsonify({'status': 'error', 'message': 'JSON entries must be objects'}), 400
        except json.JSONDecodeError as e:
            return jsonify({'status': 'error', 'message': f'Invalid JSON: {str(e)}'}), 400

        # Save to data directory
        os.makedirs(DATA_DIR, exist_ok=True)
        db_path = os.path.join(DATA_DIR, 'mac-vendors-export.json')

        with open(db_path, 'w') as f:
            f.write(content)

        # Get file stats
        file_stats = os.stat(db_path)
        file_size = file_stats.st_size
        upload_time = datetime.now().isoformat()

        log_debug(f"MAC vendor database uploaded: {len(data)} entries, {file_size} bytes")

        # Save metadata to settings
        settings_data = load_settings()
        settings_data['mac_vendor_db'] = {
            'uploaded': True,
            'filename': file.filename,
            'entries': len(data),
            'file_size': file_size,
            'upload_time': upload_time
        }
        save_settings(settings_data)
        log_debug(f"MAC vendor database metadata saved to settings")

        # Reload the database and clear cache
        global mac_vendor_database_loaded, mac_vendor_cache
        mac_vendor_database_loaded = False
        mac_vendor_cache = {}
        load_mac_vendor_database()

        return jsonify({
            'status': 'success',
            'message': f'Database uploaded successfully with {len(data)} entries',
            'entries': len(data),
            'filename': file.filename,
            'file_size': file_size,
            'upload_time': upload_time
        })

    except Exception as e:
        log_debug(f"Error uploading MAC vendor database: {e}")
        import traceback
        log_debug(f"Traceback: {traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/settings', methods=['GET', 'POST'])
def settings():
    """API endpoint for settings"""
    if request.method == 'GET':
        # Return current settings
        settings_data = load_settings()

        return jsonify({
            'status': 'success',
            'settings': settings_data
        })
    elif request.method == 'POST':
        # Save new settings
        try:
            new_settings = request.get_json()

            # Validate that we received JSON data
            if not new_settings or not isinstance(new_settings, dict):
                return jsonify({
                    'status': 'error',
                    'message': 'Invalid request: JSON object required'
                }), 400

            log_debug(f"=== POST /api/settings called ===")
            log_debug(f"Received settings: {new_settings}")

            # Validate and sanitize settings with proper type checking
            try:
                refresh_interval = int(new_settings.get('refresh_interval', 5))
            except (ValueError, TypeError):
                return jsonify({
                    'status': 'error',
                    'message': 'Invalid refresh_interval: must be a number'
                }), 400

            try:
                match_count = int(new_settings.get('match_count', 5))
            except (ValueError, TypeError):
                return jsonify({
                    'status': 'error',
                    'message': 'Invalid match_count: must be a number'
                }), 400

            try:
                top_apps_count = int(new_settings.get('top_apps_count', 5))
            except (ValueError, TypeError):
                return jsonify({
                    'status': 'error',
                    'message': 'Invalid top_apps_count: must be a number'
                }), 400

            # Ensure values are within valid ranges
            refresh_interval = max(1, min(60, refresh_interval))
            match_count = max(1, min(20, match_count))
            top_apps_count = max(1, min(10, top_apps_count))

            # Get debug logging setting with type validation
            debug_logging = new_settings.get('debug_logging', False)
            if not isinstance(debug_logging, bool):
                debug_logging = str(debug_logging).lower() in ('true', '1', 'yes')

            # Get selected device ID with validation
            selected_device_id = new_settings.get('selected_device_id', '')
            if not isinstance(selected_device_id, str):
                selected_device_id = str(selected_device_id)
            # Sanitize device ID to prevent injection
            selected_device_id = selected_device_id.strip()[:100]  # Limit length

            log_debug(f"selected_device_id to save: {selected_device_id}")

            settings_data = {
                'refresh_interval': refresh_interval,
                'match_count': match_count,
                'top_apps_count': top_apps_count,
                'debug_logging': debug_logging,
                'selected_device_id': selected_device_id
            }

            if save_settings(settings_data):
                return jsonify({
                    'status': 'success',
                    'message': 'Settings saved successfully',
                    'settings': settings_data
                })
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'Failed to save settings'
                }), 500
        except Exception as e:
            log_debug(f"Error in settings endpoint: {e}")
            return jsonify({
                'status': 'error',
                'message': 'Internal server error'
            }), 500

# ============================================================================
# Device Management API Endpoints
# ============================================================================

@app.route('/api/devices', methods=['GET'])
def get_devices():
    """Get all devices"""
    try:
        devices = device_manager.load_devices()
        groups = device_manager.get_groups()
        return jsonify({
            'status': 'success',
            'devices': devices,
            'groups': groups
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/devices', methods=['POST'])
def create_device():
    """Add a new device"""
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        ip = data.get('ip', '').strip()
        api_key = data.get('api_key', '').strip()
        group = data.get('group', 'Default')
        description = data.get('description', '')

        # Validate required fields
        if not name or not ip or not api_key:
            return jsonify({
                'status': 'error',
                'message': 'Name, IP, and API Key are required'
            }), 400

        new_device = device_manager.add_device(name, ip, api_key, group, description)
        return jsonify({
            'status': 'success',
            'device': new_device,
            'message': 'Device added successfully'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/devices/<device_id>', methods=['GET'])
def get_device(device_id):
    """Get a specific device"""
    try:
        device = device_manager.get_device(device_id)
        if device:
            return jsonify({
                'status': 'success',
                'device': device
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'Device not found'
            }), 404
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/devices/<device_id>', methods=['PUT'])
def update_device(device_id):
    """Update a device"""
    try:
        data = request.get_json()
        updated_device = device_manager.update_device(device_id, data)
        if updated_device:
            return jsonify({
                'status': 'success',
                'device': updated_device,
                'message': 'Device updated successfully'
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'Device not found'
            }), 404
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/devices/<device_id>', methods=['DELETE'])
def delete_device(device_id):
    """Delete a device"""
    try:
        success = device_manager.delete_device(device_id)
        if success:
            return jsonify({
                'status': 'success',
                'message': 'Device deleted successfully'
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'Failed to delete device'
            }), 500
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/devices/<device_id>/test', methods=['POST'])
def test_device_connection(device_id):
    """Test connection to a device"""
    try:
        device = device_manager.get_device(device_id)
        if not device:
            return jsonify({
                'status': 'error',
                'message': 'Device not found'
            }), 404

        result = device_manager.test_connection(device['ip'], device['api_key'])
        return jsonify({
            'status': 'success' if result['success'] else 'error',
            'message': result['message']
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/devices/test-connection', methods=['POST'])
def test_new_device_connection():
    """Test connection to a device (before saving)"""
    try:
        data = request.get_json()
        ip = data.get('ip', '').strip()
        api_key = data.get('api_key', '').strip()

        if not ip or not api_key:
            return jsonify({
                'status': 'error',
                'message': 'IP and API Key are required'
            }), 400

        result = device_manager.test_connection(ip, api_key)
        return jsonify({
            'status': 'success' if result['success'] else 'error',
            'message': result['message']
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/devices/status-all', methods=['GET'])
def get_all_devices_status():
    """Get status, uptime, and basic info for all devices"""
    try:
        devices = device_manager.load_devices()
        device_statuses = []

        for device in devices:
            if not device.get('enabled', True):
                # Skip disabled devices
                continue

            device_status = {
                'id': device['id'],
                'name': device['name'],
                'ip': device['ip'],
                'group': device.get('group', 'Default'),
                'status': 'unknown',
                'uptime': 'Unknown',
                'hostname': 'Unknown',
                'model': 'Unknown',
                'serial': 'Unknown',
                'sw_version': 'Unknown',
                'last_checked': datetime.now().isoformat()
            }

            # Try to get system info from the device
            try:
                base_url = f"https://{device['ip']}/api/"
                api_key = device['api_key']

                cmd = "<show><system><info></info></system></show>"
                params = {
                    'type': 'op',
                    'cmd': cmd,
                    'key': api_key
                }

                response = requests.get(base_url, params=params, verify=False, timeout=5)

                if response.status_code == 200:
                    root = ET.fromstring(response.text)

                    # Check for successful response
                    if root.get('status') == 'success':
                        device_status['status'] = 'up'

                        # Extract system info
                        uptime_elem = root.find('.//uptime')
                        hostname_elem = root.find('.//hostname')
                        model_elem = root.find('.//model')
                        serial_elem = root.find('.//serial')
                        sw_version_elem = root.find('.//sw-version')

                        if uptime_elem is not None and uptime_elem.text:
                            device_status['uptime'] = uptime_elem.text
                        if hostname_elem is not None and hostname_elem.text:
                            device_status['hostname'] = hostname_elem.text
                        if model_elem is not None and model_elem.text:
                            device_status['model'] = model_elem.text
                        if serial_elem is not None and serial_elem.text:
                            device_status['serial'] = serial_elem.text
                        if sw_version_elem is not None and sw_version_elem.text:
                            device_status['sw_version'] = sw_version_elem.text
                    else:
                        device_status['status'] = 'down'
                else:
                    device_status['status'] = 'down'

            except requests.exceptions.Timeout:
                device_status['status'] = 'timeout'
            except Exception as e:
                device_status['status'] = 'error'
                log_debug(f"Error checking device {device['name']}: {str(e)}")

            device_statuses.append(device_status)

        return jsonify({
            'status': 'success',
            'devices': device_statuses,
            'total': len(device_statuses),
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        log_debug(f"Error in get_all_devices_status: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e),
            'devices': []
        }), 500

# ============================================================================

if __name__ == '__main__':
    # Use environment variable to control debug mode - defaults to False for production
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    app.run(debug=debug_mode, host='0.0.0.0', port=8189, use_reloader=False)
