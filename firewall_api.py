"""
Firewall API interaction functions for fetching data from Palo Alto firewalls
"""
import xml.etree.ElementTree as ET
import time
import sys
from datetime import datetime
from config import load_settings, DEFAULT_FIREWALL_IP, DEFAULT_API_KEY
from utils import api_request_get, get_api_stats
from logger import debug, info, warning, error, exception
from device_manager import device_manager

# Store previous values for throughput calculation
# Store per-device statistics for rate calculation
previous_stats = {}

# Store policy hit count history for trend calculation
policy_history = {}

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

        debug(f"\n=== CPU API Response ===")
        debug(f"Status: {response.status_code}")
        if response.status_code == 200:
            debug(f"Response XML (first 1000 chars):\n{response.text[:1000]}")

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
                        except:
                            pass

            if all_cpu_values:
                data_plane_cpu = int(sum(all_cpu_values) / len(all_cpu_values))
                debug(f"Found data-plane CPU (1-min avg across {len(all_cpu_values)} cores): {data_plane_cpu}%")

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
                            except:
                                pass
                    if count > 0:
                        data_plane_cpu = int(total_cpu / count)
                        debug(f"Found data-plane CPU (second avg from {count} entries): {data_plane_cpu}%")

        # Try the system resources command for management CPU and memory
        cmd2 = "<show><system><resources></resources></system></show>"
        params2 = {
            'type': 'op',
            'cmd': cmd2,
            'key': api_key
        }
        response2 = api_request_get(base_url, params=params2, verify=False, timeout=10)
        debug(f"Trying system resources command, status: {response2.status_code}")

        memory_used_pct = 0
        memory_total_mb = 0
        memory_used_mb = 0

        if response2.status_code == 200:
                # Export the XML response to a file for inspection
                try:
                    with open('system_resources_output.xml', 'w') as f:
                        f.write(response2.text)
                    debug("Exported system resources XML to system_resources_output.xml")
                except Exception as e:
                    debug(f"Error exporting XML: {e}")

                root2 = ET.fromstring(response2.text)

                # Try to get data plane CPU from XML field
                dp_cpu_elem = root2.find('.//dp-cpu-utilization')

                # Use data plane CPU from XML if not already found from resource monitor
                if dp_cpu_elem is not None and dp_cpu_elem.text and data_plane_cpu == 0:
                    data_plane_cpu = int(dp_cpu_elem.text)
                    debug(f"Data Plane CPU from XML: {data_plane_cpu}%")

                result_text = root2.find('.//result')

                if result_text is not None and result_text.text:
                    lines = result_text.text.strip().split('\n')
                    debug(f"System resources output (first 500 chars):\n{result_text.text[:500]}")

                    for line in lines:
                        # Parse CPU line from top command
                        if '%Cpu(s):' in line or 'Cpu(s):' in line:
                            debug(f"Found CPU line: {line}")
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
                                debug(f"Management CPU from system resources (aggregate): {mgmt_plane_cpu}% (user: {user_cpu}% + system: {sys_cpu}%)")

                                debug(f"Parsed CPU - User: {user_cpu}%, System: {sys_cpu}%, Idle: {idle_cpu}%")
                            except Exception as e:
                                debug(f"Error parsing CPU line: {e}")

                        # Parse memory information
                        if 'Mem' in line and 'total' in line:
                            debug(f"Found memory line: {line}")
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
                                    debug(f"Memory: {memory_used_mb:.1f}MB / {memory_total_mb:.1f}MB ({memory_used_pct}%)")
                            except Exception as e:
                                debug(f"Error calculating memory: {e}")

        debug(f"Final CPU - Data plane: {data_plane_cpu}%, Mgmt plane: {mgmt_plane_cpu}%")

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
        debug(f"CPU Error: {str(e)}")
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
        debug(f"Interface stats API Status: {response.status_code}")

        interfaces = []
        total_errors = 0
        total_drops = 0

        if response.status_code == 200:
            root = ET.fromstring(response.text)
            debug(f"Interface stats XML (first 2000 chars):\n{response.text[:2000]}")

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

            debug(f"Found {len(interfaces)} interfaces with errors/drops")
            debug(f"Total errors: {total_errors}, Total drops: {total_drops}")

        return {
            'interfaces': interfaces,
            'total_errors': total_errors,
            'total_drops': total_drops
        }

    except Exception as e:
        debug(f"Interface stats error: {str(e)}")
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
        debug(f"Top apps traffic log query status: {response.status_code}")

        app_counts = {}

        if response.status_code == 200:
            root = ET.fromstring(response.text)
            job_id = root.find('.//job')

            if job_id is not None and job_id.text:
                debug(f"Top apps job ID: {job_id.text}")
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
        debug(f"Top {top_count} applications: {top_apps}")

        # Calculate total unique applications
        total_apps = len(app_counts)

        return {
            'apps': [{'name': app[0], 'count': app[1]} for app in top_apps],
            'total_count': total_apps
        }

    except Exception as e:
        debug(f"Top applications error: {str(e)}")
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

        debug(f"\n=== SYSTEM LOG API Response ===")
        debug(f"Status: {response.status_code}")

        system_logs = []

        if response.status_code == 200:
            root = ET.fromstring(response.text)

            # Check if this is a job response (async log query)
            job_id = root.find('.//job')
            if job_id is not None and job_id.text:
                debug(f"System log job ID: {job_id.text}")

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
                    debug(f"System log job result fetched")

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

            debug(f"Total system logs collected: {len(system_logs)}")

        return system_logs

    except Exception as e:
        debug(f"Error fetching system logs: {str(e)}")
        return []

def get_threat_stats(max_logs=5):
    """Fetch threat and URL filtering statistics from Palo Alto firewall"""
    try:
        firewall_ip, api_key, base_url = get_firewall_config()
        debug(f"=== get_threat_stats called ===")
        debug(f"Fetching threat stats from device: {firewall_ip}")

        # Query for threat logs using log query API
        params = {
            'type': 'log',
            'log-type': 'threat',
            'nlogs': '500',
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=10)

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

            # Count threats by severity and collect details
            for entry in root.findall('.//entry'):
                severity = entry.find('.//severity')
                threat_type = entry.find('.//type')
                subtype = entry.find('.//subtype')
                action = entry.find('.//action')
                threat_name = entry.find('.//threat-name') or entry.find('.//threatid')
                src = entry.find('.//src')
                dst = entry.find('.//dst')
                sport = entry.find('.//sport')
                dport = entry.find('.//dport')
                receive_time = entry.find('.//receive_time') or entry.find('.//time_generated')
                category = entry.find('.//category')
                url_field = entry.find('.//url') or entry.find('.//misc')
                app = entry.find('.//app')

                # Try to find threat information from various fields
                threat_display = 'Unknown'
                if threat_name is not None and threat_name.text:
                    threat_display = threat_name.text
                elif category is not None and category.text:
                    threat_display = category.text

                # Create log entry
                log_entry = {
                    'threat': threat_display,
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
                    elif sev_lower in ['critical', 'high', 'crit']:
                        critical_count += 1
                        if len(critical_logs) < max_logs:
                            critical_logs.append(log_entry)

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
                    debug(f"URL filtering log job ID: {job_id.text}")
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
                        debug(f"Total URL filtering entries found: {len(all_entries)}")

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
                                debug(f"\n=== URL Filtering Entry {idx} ===")
                                debug(f"Action: {action.text if action is not None and action.text else 'None'}")
                                debug(f"URL: {url_field.text if url_field is not None and url_field.text else 'None'}")
                                debug(f"Category: {url_category.text if url_category is not None and url_category.text else 'None'}")
                                debug(f"Source: {src.text if src is not None and src.text else 'None'}")

                            # Check if this is a blocked/denied entry
                            is_blocked = False
                            if action is not None and action.text:
                                action_lower = action.text.lower()
                                # URL filtering logs typically have 'block-url', 'block-continue', 'alert', etc.
                                if 'block' in action_lower or 'deny' in action_lower or 'drop' in action_lower:
                                    is_blocked = True
                                    debug(f"Found blocked URL by action: {action.text}")

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

                        debug(f"Total blocked URLs found: {url_blocked}")

            # Get total URL filtering count (all events, not just blocked)
            url_filtering_total = 0
            if url_response.status_code == 200:
                url_root_all = ET.fromstring(url_response.text)
                job_id_all = url_root_all.find('.//job')

                if job_id_all is not None and job_id_all.text:
                    # Already fetched above, count all entries
                    all_url_entries = url_root.findall('.//entry')
                    url_filtering_total = len(all_url_entries)
                    debug(f"Total URL filtering events: {url_filtering_total}")

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
        if selected_device_id:
            device = device_manager.get_device(selected_device_id)
            if device and device.get('monitored_interface'):
                monitored_interface = device['monitored_interface']

        debug(f"=== get_throughput_data called ===")
        debug(f"Selected device from settings: {selected_device_id}")
        debug(f"Fetching throughput data from device: {firewall_ip}")
        debug(f"Monitored interface: {monitored_interface}")

        # Use device ID as key for per-device stats, fallback to IP if no device ID
        device_key = selected_device_id if selected_device_id else firewall_ip

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
                debug("Exported interface counter XML to interface_counter_output.xml")
            except Exception as e:
                debug(f"Error exporting interface counter XML: {e}")

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

                debug(f"Packet fields found - ipackets: {ipackets is not None}, opackets: {opackets is not None}")

                if ibytes is not None and ibytes.text:
                    total_ibytes = int(ibytes.text)
                if obytes is not None and obytes.text:
                    total_obytes = int(obytes.text)
                if ipackets is not None and ipackets.text:
                    total_ipkts = int(ipackets.text)
                    debug(f"Extracted ipackets: {total_ipkts}")
                if opackets is not None and opackets.text:
                    total_opkts = int(opackets.text)
                    debug(f"Extracted opackets: {total_opkts}")
            else:
                debug(f"WARNING: Could not find {monitored_interface} entry in interface counter XML")

            # Initialize device stats if not exists
            global previous_stats
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
                sys.stderr.write(f"\nDEBUG: ibytes_delta={ibytes_delta:,}, obytes_delta={obytes_delta:,}, time={time_delta:.2f}s\n")
                sys.stderr.write(f"DEBUG: inbound_bps={inbound_bps:,.0f}, outbound_bps={outbound_bps:,.0f}\n")
                sys.stderr.write(f"DEBUG: inbound_pps={inbound_pps:,.0f}, outbound_pps={outbound_pps:,.0f}, total_pps={total_pps:,.0f}\n")
                sys.stderr.flush()

                # Convert bytes/sec to Mbps
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

            # Update device stats for this device
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

            # Get license information
            license_info = get_license_info()

            return {
                'timestamp': datetime.now().isoformat(),
                'inbound_mbps': round(max(0, inbound_mbps), 2),
                'outbound_mbps': round(max(0, outbound_mbps), 2),
                'total_mbps': round(max(0, total_mbps), 2),
                'inbound_pps': round(max(0, inbound_pps), 0),
                'outbound_pps': round(max(0, outbound_pps), 0),
                'total_pps': round(max(0, total_pps), 0),
                'sessions': session_data,
                'cpu': resource_data,
                'threats': threat_data,
                'system_logs': system_logs,
                'interfaces': interface_data,
                'top_applications': top_apps,
                'license': license_info.get('license', {'expired': 0, 'licensed': 0}),
                'api_stats': get_api_stats(),
                'status': 'success'
            }
        else:
            return {'status': 'error', 'message': f'HTTP {response.status_code}'}

    except Exception as e:
        return {'status': 'error', 'message': f'Error: {str(e)}'}

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
        debug(f"Traffic logs query status: {response.status_code}")

        traffic_logs = []

        if response.status_code == 200:
            root = ET.fromstring(response.text)

            # Check if this is a job response (async log query)
            job_id = root.find('.//job')
            if job_id is not None and job_id.text:
                debug(f"Job ID received: {job_id.text}, fetching traffic log results...")

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
                time_generated = entry.get('time_generated', '')
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

            debug(f"Found {len(traffic_logs)} traffic log entries")

        return traffic_logs

    except Exception as e:
        debug(f"Error fetching traffic logs: {e}")
        return []

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

        debug(f"\n=== Policy REST API Request ===")
        debug(f"URL: {rest_url}")
        debug(f"Params: {params}")

        response = api_request_get(rest_url, headers=headers, params=params, verify=False, timeout=10)
        debug(f"Status: {response.status_code}")

        policies = []

        if response.status_code == 200:
            try:
                data = response.json()
                debug(f"Response (first 2000 chars):\n{str(data)[:2000]}")

                # REST API returns data in 'result' or 'entry' field
                entries = data.get('result', {}).get('entry', [])
                if not entries:
                    entries = data.get('entry', [])

                debug(f"Found {len(entries)} policy entries from REST API")

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

                debug(f"Querying hit counts for {len(rule_names)} rules: {rule_names}")

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

                    debug(f"Hit count command (first 500 chars): {show_cmd[:500]}")

                    hit_count_response = api_request_get(xml_base_url, params=show_params, verify=False, timeout=15)
                    debug(f"Hit count API Status: {hit_count_response.status_code}")

                    if hit_count_response.status_code == 200:
                        hit_root = ET.fromstring(hit_count_response.text)
                        debug(f"Hit count XML (first 5000 chars):\n{hit_count_response.text[:5000]}")

                        # Check if command was successful
                        status = hit_root.get('status')
                        if status != 'success':
                            debug(f"Hit count command failed with status: {status}")
                            error_msg = hit_root.find('.//msg')
                            if error_msg is not None:
                                debug(f"Error message: {ET.tostring(error_msg, encoding='unicode')}")
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
                                        debug(f"  Rule '{rule_name}': {hit_count_elem.text} hits")
                                    except:
                                        pass

                                    if latest_elem is not None and latest_elem.text:
                                        latest_hits[rule_name] = latest_elem.text
                                        debug(f"    Latest hit: {latest_elem.text}")
                                    if first_elem is not None and first_elem.text:
                                        first_hits[rule_name] = first_elem.text
                                        debug(f"    First hit: {first_elem.text}")

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
                                            debug(f"  Rule '{rule_name}': {hit_count_elem.text} hits (pattern 2)")
                                        except:
                                            pass

                                        if latest_elem is not None and latest_elem.text:
                                            latest_hits[rule_name] = latest_elem.text
                                            debug(f"    Latest hit: {latest_elem.text}")
                                        if first_elem is not None and first_elem.text:
                                            first_hits[rule_name] = first_elem.text
                                            debug(f"    First hit: {first_elem.text}")

                            debug(f"Parsed {len(hit_counts)} hit counts from API (tried {patterns_tried} entries)")

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
                debug(f"JSON parsing error: {json_error}")

            debug(f"Found {len(policies)} policy entries")

            debug(f"Total policies: {len(policies)}")

            # Calculate trends based on last 5 readings
            global policy_history
            for policy in policies:
                policy_name = policy['name']
                current_count = policy['hit_count']

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
                    recent_counts = policy_history[policy_name]
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
        debug(f"Policy hit count error: {str(e)}")
        import traceback
        debug(f"Traceback: {traceback.format_exc()}")
        return {
            'status': 'error',
            'message': str(e),
            'policies': []
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
        debug(f"\n=== System Info API Response ===")
        debug(f"Status: {response.status_code}")

        software_info = []

        if response.status_code == 200:
            root = ET.fromstring(response.text)
            debug(f"Response XML (first 2000 chars):\n{response.text[:2000]}")

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
                        debug(f"Update check response (first 1000 chars):\n{check_response.text[:1000]}")

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
                    debug(f"Error checking update status: {e}")

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

            debug(f"Software versions found: {software_info}")

        return {
            'status': 'success',
            'software': software_info,
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        debug(f"Software updates error: {str(e)}")
        return {
            'status': 'error',
            'message': str(e),
            'software': []
        }

def get_license_info():
    """Fetch license information from Palo Alto firewall"""
    try:
        _, api_key, base_url = get_firewall_config()

        # Query for license information
        cmd = "<request><license><info></info></license></request>"
        params = {
            'type': 'op',
            'cmd': cmd,
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=10)
        debug(f"\n=== License API Response ===")
        debug(f"Status: {response.status_code}")

        license_data = {
            'expired': 0,
            'licensed': 0,
            'licenses': []
        }

        if response.status_code == 200:
            root = ET.fromstring(response.text)
            debug(f"Response XML (first 3000 chars):\n{response.text[:3000]}")

            # Try multiple XPath patterns to find license entries
            entries = root.findall('.//entry')
            if not entries:
                entries = root.findall('.//licenses/entry')
            if not entries:
                entries = root.findall('.//result/entry')

            debug(f"Found {len(entries)} license entries using XPath")

            # Parse license entries
            for entry in entries:
                # Try different field names
                feature = entry.find('.//feature') or entry.find('feature')
                description = entry.find('.//description') or entry.find('description')
                expires = entry.find('.//expires') or entry.find('expires')
                expired = entry.find('.//expired') or entry.find('expired')
                authcode = entry.find('.//authcode') or entry.find('authcode')

                feature_name = feature.text if feature is not None and feature.text else 'Unknown'
                description_text = description.text if description is not None and description.text else ''
                expires_text = expires.text if expires is not None and expires.text else 'N/A'
                expired_text = expired.text if expired is not None and expired.text else 'no'

                debug(f"License entry - Feature: {feature_name}, Expired: {expired_text}, Expires: {expires_text}")

                # Count expired and licensed
                if expired_text.lower() == 'yes':
                    license_data['expired'] += 1
                else:
                    license_data['licensed'] += 1

                license_data['licenses'].append({
                    'feature': feature_name,
                    'description': description_text,
                    'expires': expires_text,
                    'expired': expired_text
                })

            debug(f"License info - Expired: {license_data['expired']}, Licensed: {license_data['licensed']}")

        return {
            'status': 'success',
            'license': license_data,
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        debug(f"License info error: {str(e)}")
        import traceback
        debug(f"Traceback: {traceback.format_exc()}")
        return {
            'status': 'error',
            'message': str(e),
            'license': {
                'expired': 0,
                'licensed': 0,
                'licenses': []
            }
        }

def get_connected_devices():
    """Fetch ARP entries from all interfaces on the firewall"""
    debug("=== Starting get_connected_devices ===")
    try:
        _, api_key, base_url = get_firewall_config()
        debug(f"Using firewall API: {base_url}")

        # Query for ARP table entries
        params = {
            'type': 'op',
            'cmd': '<show><arp><entry name="all"/></arp></show>',
            'key': api_key
        }

        debug(f"Making API request for ARP entries")
        response = api_request_get(base_url, params=params, verify=False, timeout=10)

        debug(f"ARP API Response Status: {response.status_code}")

        devices = []

        if response.status_code == 200:
            debug(f"Response length: {len(response.text)} characters")
            debug(f"Response preview (first 500 chars): {response.text[:500]}")

            root = ET.fromstring(response.text)

            # Parse ARP entries
            for entry in root.findall('.//entry'):
                status = entry.find('.//status')
                ip = entry.find('.//ip')
                mac = entry.find('.//mac')
                ttl = entry.find('.//ttl')
                interface = entry.find('.//interface')
                port = entry.find('.//port')

                # Extract values with fallbacks
                device_entry = {
                    'hostname': 'N/A',  # ARP table typically doesn't have hostnames
                    'ip': ip.text if ip is not None and ip.text else 'N/A',
                    'mac': mac.text if mac is not None and mac.text else 'N/A',
                    'vlan': 'N/A',  # Will be extracted from interface if available
                    'interface': interface.text if interface is not None and interface.text else 'N/A',
                    'ttl': ttl.text if ttl is not None and ttl.text else 'N/A',
                    'status': status.text if status is not None and status.text else 'N/A',
                    'port': port.text if port is not None and port.text else 'N/A'
                }

                # Try to extract VLAN from interface name (e.g., "ethernet1/1.100" -> VLAN 100)
                if device_entry['interface'] != 'N/A' and '.' in device_entry['interface']:
                    try:
                        vlan_id = device_entry['interface'].split('.')[-1]
                        if vlan_id.isdigit():
                            device_entry['vlan'] = vlan_id
                    except:
                        pass

                devices.append(device_entry)

            debug(f"Total devices found: {len(devices)}")
            debug(f"Sample device entries (first 3): {devices[:3]}")
        else:
            error(f"Failed to fetch ARP entries. Status code: {response.status_code}")
            debug(f"Error response: {response.text[:500]}")

        return devices

    except Exception as e:
        exception(f"Error fetching connected devices: {str(e)}")
        return []
