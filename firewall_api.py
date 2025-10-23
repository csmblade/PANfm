"""
Firewall API interaction functions for fetching data from Palo Alto firewalls
This module serves as the main entry point and aggregator for firewall API calls.
Individual functions are organized into specialized modules:
- firewall_api_logs.py: Log retrieval functions
- firewall_api_policies.py: Policy management functions
- firewall_api_devices.py: Device, license, and software functions
"""
import xml.etree.ElementTree as ET
import time
import sys
from datetime import datetime
from config import load_settings, DEFAULT_FIREWALL_IP, DEFAULT_API_KEY
from utils import api_request_get, get_api_stats
from logger import debug, info, warning, error, exception
from device_manager import device_manager

# Import functions from specialized modules
from firewall_api_logs import (
    get_system_logs,
    get_threat_stats,
    get_traffic_logs,
    get_top_applications,
    get_application_statistics
)
from firewall_api_policies import get_policy_hit_counts
from firewall_api_devices import (
    get_software_updates,
    get_license_info,
    lookup_mac_vendor,
    get_connected_devices
)

# Store previous values for throughput calculation
# Store per-device statistics for rate calculation
previous_stats = {}


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


def get_device_uptime(device_id):
    """Fetch uptime for a specific device"""
    try:
        firewall_ip, api_key, base_url = get_firewall_config(device_id)

        cmd = "<show><system><info></info></system></show>"
        params = {
            'type': 'op',
            'cmd': cmd,
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=5)
        if response.status_code == 200:
            root = ET.fromstring(response.text)
            uptime_elem = root.find('.//uptime')
            if uptime_elem is not None and uptime_elem.text:
                return uptime_elem.text

        return None
    except Exception as e:
        debug(f"Error fetching uptime for device {device_id}: {str(e)}")
        return None


def get_device_version(device_id):
    """Fetch PAN-OS version for a specific device"""
    try:
        firewall_ip, api_key, base_url = get_firewall_config(device_id)

        cmd = "<show><system><info></info></system></show>"
        params = {
            'type': 'op',
            'cmd': cmd,
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=5)
        if response.status_code == 200:
            root = ET.fromstring(response.text)
            version_elem = root.find('.//sw-version')
            if version_elem is not None and version_elem.text:
                return version_elem.text

        return None
    except Exception as e:
        debug(f"Error fetching version for device {device_id}: {str(e)}")
        return None


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

            # Build firewall config tuple to pass to imported functions
            firewall_config = (firewall_ip, api_key, base_url)

            # Get threat statistics (from firewall_api_logs module)
            threat_data = get_threat_stats(firewall_config, max_logs)

            # Get system logs (limit to max_logs) (from firewall_api_logs module)
            system_logs = get_system_logs(firewall_config, max_logs)

            # Get interface statistics
            interface_data = get_interface_stats()

            # Get top applications (from firewall_api_logs module)
            top_apps = get_top_applications(firewall_config, top_apps_count)

            # Get license information (from firewall_api_devices module)
            license_info = get_license_info(firewall_config)

            # Get software version information (from firewall_api_devices module)
            software_info = get_software_updates(firewall_config)
            panos_version = None
            update_available = False
            latest_version = None

            debug(f"Software info returned: {software_info}")

            if software_info.get('status') == 'success':
                # Find PAN-OS version from software list
                for sw in software_info.get('software', []):
                    if sw['name'] == 'PAN-OS':
                        panos_version = sw['version']
                        debug(f"PAN-OS current version: {panos_version}")
                        debug(f"PAN-OS update fields - current: {sw.get('current')}, latest: {sw.get('latest')}, downloaded: {sw.get('downloaded')}")

                        # Check if update is available
                        # If 'latest' field contains a version number (not 'yes' or 'N/A'), that's the available update
                        latest_field = sw.get('latest', 'N/A')
                        current_field = sw.get('current', 'yes')

                        debug(f"Checking update: latest_field='{latest_field}', current_field='{current_field}'")

                        # Update is available if:
                        # 1. latest field contains a version number (not 'yes', 'N/A', etc.)
                        # 2. OR current='no' and latest contains a version
                        if latest_field not in ['yes', 'N/A', None, ''] and latest_field != panos_version:
                            # latest field contains a version number different from current
                            update_available = True
                            latest_version = latest_field
                            debug(f"✓ Update available: {latest_version} (current: {panos_version})")
                        elif current_field == 'no' and latest_field not in ['N/A', None, '']:
                            # This version entry is not current, so an update exists
                            update_available = True
                            latest_version = latest_field
                            debug(f"✓ Update available via current=no: {latest_version}")
                        else:
                            debug(f"✗ No update available (latest field: {latest_field})")
                        break

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
                'panos_version': panos_version,
                'version_update_available': update_available,
                'latest_panos_version': latest_version,
                'status': 'success'
            }
        else:
            return {'status': 'error', 'message': f'HTTP {response.status_code}'}

    except Exception as e:
        return {'status': 'error', 'message': f'Error: {str(e)}'}


# Export all functions for backward compatibility
__all__ = [
    'get_firewall_config',
    'get_system_resources',
    'get_interface_stats',
    'get_session_count',
    'get_device_uptime',
    'get_device_version',
    'get_throughput_data',
    # Re-exported from firewall_api_logs
    'get_system_logs',
    'get_threat_stats',
    'get_traffic_logs',
    'get_top_applications',
    # Re-exported from firewall_api_policies
    'get_policy_hit_counts',
    # Re-exported from firewall_api_devices
    'get_software_updates',
    'get_license_info',
    'lookup_mac_vendor',
    'get_connected_devices'
]
