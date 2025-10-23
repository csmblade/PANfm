"""
Firewall API device, license, and software management functions for Palo Alto firewalls
Handles software updates, license information, MAC vendor lookup, and connected devices
"""
import xml.etree.ElementTree as ET
from datetime import datetime
from utils import api_request_get
from logger import debug, info, warning, error, exception


def get_software_updates(firewall_config):
    """Fetch system software version information from Palo Alto firewall"""
    try:
        firewall_ip, api_key, base_url = firewall_config

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

            # PAN-OS version - check for updates
            sw_version = root.find('.//sw-version')
            panos_cmd = '<request><content><upgrade><check></check></upgrade></content></request>'
            add_software_entry('PAN-OS', sw_version, panos_cmd)

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


def get_license_info(firewall_config):
    """Fetch license information from Palo Alto firewall"""
    try:
        firewall_ip, api_key, base_url = firewall_config

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


def lookup_mac_vendor(mac_address):
    """
    Lookup vendor name for a MAC address.
    Returns vendor name or None if not found.
    """
    if not mac_address or mac_address == 'N/A':
        return None

    try:
        from config import load_vendor_database
        vendor_db = load_vendor_database()

        if not vendor_db:
            return None

        # Normalize MAC address (remove colons/dashes, uppercase)
        mac_clean = mac_address.upper().replace(':', '').replace('-', '')

        # Try matching with progressively shorter prefixes
        # MA-L: 6 chars (00:00:0C -> 00000C)
        # MA-M: 7 chars
        # MA-S: 9 chars
        for prefix_len in [6, 7, 9]:
            if len(mac_clean) >= prefix_len:
                prefix = mac_clean[:prefix_len]
                if prefix in vendor_db:
                    return vendor_db[prefix]

        return None

    except Exception as e:
        debug(f"Error looking up MAC vendor: {str(e)}")
        return None


def get_connected_devices(firewall_config):
    """Fetch ARP entries from all interfaces on the firewall"""
    debug("=== Starting get_connected_devices ===")
    try:
        firewall_ip, api_key, base_url = firewall_config
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
                mac_address = mac.text if mac is not None and mac.text else 'N/A'

                device_entry = {
                    'hostname': 'N/A',  # ARP table typically doesn't have hostnames
                    'ip': ip.text if ip is not None and ip.text else 'N/A',
                    'mac': mac_address,
                    'vlan': 'N/A',  # Will be extracted from interface if available
                    'interface': interface.text if interface is not None and interface.text else 'N/A',
                    'ttl': ttl.text if ttl is not None and ttl.text else 'N/A',
                    'status': status.text if status is not None and status.text else 'N/A',
                    'port': port.text if port is not None and port.text else 'N/A',
                    'vendor': None  # Will be looked up from vendor database
                }

                # Try to extract VLAN from interface name (e.g., "ethernet1/1.100" -> VLAN 100)
                if device_entry['interface'] != 'N/A' and '.' in device_entry['interface']:
                    try:
                        vlan_id = device_entry['interface'].split('.')[-1]
                        if vlan_id.isdigit():
                            device_entry['vlan'] = vlan_id
                    except:
                        pass

                # Lookup vendor name for MAC address
                vendor_name = lookup_mac_vendor(mac_address)
                if vendor_name:
                    device_entry['vendor'] = vendor_name

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
