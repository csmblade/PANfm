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
                        debug(f"Update check response (first 1500 chars):\n{check_response.text[:1500]}")

                        # Export full XML for inspection
                        try:
                            with open('software_update_check.xml', 'w') as f:
                                f.write(check_response.text)
                            debug("Exported full update check XML to software_update_check.xml")
                        except Exception as e:
                            debug(f"Error exporting update check XML: {e}")

                        # Find all entries with version information
                        entries = check_root.findall('.//entry')
                        current_version = None
                        latest_available = None
                        all_versions = []

                        for entry in entries:
                            version_elem = entry.find('.//version')
                            downloaded_elem = entry.find('.//downloaded')
                            current_elem = entry.find('.//current')
                            latest_elem = entry.find('.//latest')

                            version_num = version_elem.text if version_elem is not None and version_elem.text else None
                            is_downloaded = downloaded_elem.text if downloaded_elem is not None and downloaded_elem.text else 'no'
                            is_current = current_elem.text if current_elem is not None and current_elem.text else 'no'
                            is_latest = latest_elem.text if latest_elem is not None and latest_elem.text else 'no'

                            debug(f"  Entry: version={version_num}, current={is_current}, latest={is_latest}, downloaded={is_downloaded}")

                            if version_num:
                                all_versions.append({
                                    'version': version_num,
                                    'current': is_current,
                                    'latest': is_latest,
                                    'downloaded': is_downloaded
                                })

                            # Track the current version
                            if is_current == 'yes' and version_num:
                                current_version = version_num

                            # Track latest available version (marked as latest='yes', regardless of current status)
                            if is_latest == 'yes' and version_num:
                                # If this is also current, no update; otherwise it's the update
                                if is_current != 'yes':
                                    latest_available = version_num

                        debug(f"  All versions found: {all_versions}")
                        debug(f"  Current version: {current_version}, Latest available: {latest_available}")

                        # Return status
                        if latest_available:
                            # There's a newer version available
                            return {
                                'downloaded': 'N/A',
                                'current': 'no',
                                'latest': latest_available
                            }
                        else:
                            # No update available
                            return {
                                'downloaded': 'N/A',
                                'current': 'yes',
                                'latest': 'yes'
                            }

                except Exception as e:
                    debug(f"Error checking update status: {e}")

                return {'downloaded': 'N/A', 'current': 'yes', 'latest': 'yes'}

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

            # PAN-OS version - no update check needed
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


def is_virtual_mac(mac_address, vendor_name=None):
    """
    Determine if a MAC address is virtual/locally administered.

    Returns dict with:
    - is_virtual: bool
    - reason: string explaining why (if virtual)
    - is_randomized: bool (for privacy features like iOS/Android)
    """
    if not mac_address or mac_address == 'N/A':
        return {'is_virtual': False, 'reason': None, 'is_randomized': False}

    try:
        # Normalize MAC address
        mac_clean = mac_address.upper().replace(':', '').replace('-', '')

        if len(mac_clean) < 2:
            return {'is_virtual': False, 'reason': None, 'is_randomized': False}

        # Check locally administered bit (2nd bit of 1st octet)
        first_octet = int(mac_clean[:2], 16)
        is_locally_administered = bool(first_octet & 0x02)

        # Known virtual MAC prefixes
        virtual_prefixes = {
            '005056': 'VMware',
            '000C29': 'VMware',
            '000569': 'VMware',
            '00155D': 'Microsoft Hyper-V',
            '0242': 'Docker',
            '080027': 'VirtualBox',
            '00163E': 'Xen',
            'DEADBE': 'Test/Virtual',
            '525400': 'QEMU/KVM'
        }

        # Check for known virtual prefixes
        for prefix, vm_type in virtual_prefixes.items():
            if mac_clean.startswith(prefix):
                return {
                    'is_virtual': True,
                    'reason': f'{vm_type} virtual MAC',
                    'is_randomized': False
                }

        # Check for randomized MAC addresses (privacy features)
        # iOS (iPhone/iPad), Android, Windows 10+ use randomization
        if is_locally_administered:
            # If vendor shows Apple but MAC is locally administered = randomized iPhone/iPad/Mac
            if vendor_name and 'Apple' in vendor_name:
                return {
                    'is_virtual': True,
                    'reason': 'Apple device with randomized MAC (Privacy)',
                    'is_randomized': True
                }
            # Generic randomized MAC detection
            elif vendor_name and any(brand in vendor_name for brand in ['Samsung', 'Google', 'Xiaomi', 'OnePlus']):
                return {
                    'is_virtual': True,
                    'reason': 'Android device with randomized MAC (Privacy)',
                    'is_randomized': True
                }
            # Windows randomization
            elif vendor_name and 'Microsoft' in vendor_name:
                return {
                    'is_virtual': True,
                    'reason': 'Windows device with randomized MAC (Privacy)',
                    'is_randomized': True
                }
            else:
                # Unknown locally administered - could be iPhone without vendor match
                # Check for common randomized MAC patterns
                # Randomized MACs often have specific patterns in 2nd-3rd octets
                return {
                    'is_virtual': True,
                    'reason': 'Randomised MAC address',
                    'is_randomized': True
                }

        return {'is_virtual': False, 'reason': None, 'is_randomized': False}

    except Exception as e:
        debug(f"Error checking if MAC is virtual: {str(e)}")
        return {'is_virtual': False, 'reason': None, 'is_randomized': False}


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


def get_interface_zones(firewall_config):
    """Get mapping of interfaces to security zones by querying the firewall"""
    debug("=== Getting interface-to-zone mappings ===")
    interface_zones = {}

    try:
        firewall_ip, api_key, base_url = firewall_config

        # Query for zone configuration using the config API
        params = {
            'type': 'config',
            'action': 'get',
            'xpath': '/config/devices/entry[@name="localhost.localdomain"]/vsys/entry[@name="vsys1"]/zone',
            'key': api_key
        }

        response = api_request_get(base_url, params=params, verify=False, timeout=10)

        if response.status_code == 200:
            root = ET.fromstring(response.text)
            debug(f"Zone config response (first 2000 chars):\n{response.text[:2000]}")

            # Parse zone entries to get interface-to-zone mappings
            # Structure: <response><result><zone><entry name="zone-name"><network><layer3><member>interface</member>...
            for zone_entry in root.findall('.//zone/entry'):
                zone_name = zone_entry.get('name')
                if not zone_name:
                    continue

                debug(f"Processing zone: {zone_name}")

                # Look for member interfaces in the network section
                network = zone_entry.find('.//network')
                if network is not None:
                    # Check for layer3 interfaces
                    layer3 = network.find('.//layer3')
                    if layer3 is not None:
                        for member in layer3.findall('.//member'):
                            if member.text:
                                interface_name = member.text
                                interface_zones[interface_name] = zone_name
                                debug(f"  Mapped L3 interface {interface_name} -> {zone_name}")

                                # Also map base interface if this is a subinterface
                                if '.' in interface_name:
                                    base_interface = interface_name.split('.')[0]
                                    if base_interface not in interface_zones:
                                        interface_zones[base_interface] = zone_name
                                        debug(f"  Mapped base interface {base_interface} -> {zone_name}")

                    # Check for layer2 interfaces
                    layer2 = network.find('.//layer2')
                    if layer2 is not None:
                        for member in layer2.findall('.//member'):
                            if member.text:
                                interface_name = member.text
                                interface_zones[interface_name] = zone_name
                                debug(f"  Mapped L2 interface {interface_name} -> {zone_name}")

                                # Also map base interface if this is a subinterface
                                if '.' in interface_name:
                                    base_interface = interface_name.split('.')[0]
                                    if base_interface not in interface_zones:
                                        interface_zones[base_interface] = zone_name
                                        debug(f"  Mapped base interface {base_interface} -> {zone_name}")

            debug(f"Found {len(interface_zones)} interface-to-zone mappings")
            if interface_zones:
                debug(f"Zone mappings: {interface_zones}")
            else:
                debug("WARNING: No zone mappings found!")

    except Exception as e:
        exception(f"Error getting interface zones: {str(e)}")

    return interface_zones


def get_dhcp_leases(firewall_config):
    """Fetch DHCP lease information from Palo Alto firewall

    Returns:
        dict: Dictionary mapping IP addresses to hostnames from DHCP leases
              Format: {'192.168.1.10': 'hostname1', '192.168.1.11': 'hostname2', ...}
    """
    debug("=== Starting get_dhcp_leases ===")
    dhcp_hostnames = {}

    try:
        firewall_ip, api_key, base_url = firewall_config
        debug(f"Fetching DHCP leases from: {base_url}")

        # Query for DHCP server lease information
        params = {
            'type': 'op',
            'cmd': '<show><dhcp><server><lease></lease></server></dhcp></show>',
            'key': api_key
        }

        debug("Making API request for DHCP leases")
        response = api_request_get(base_url, params=params, verify=False, timeout=10)

        debug(f"DHCP lease API Response Status: {response.status_code}")

        if response.status_code == 200:
            debug(f"Response length: {len(response.text)} characters")
            debug(f"Response preview (first 500 chars): {response.text[:500]}")

            # Export full XML for debugging
            try:
                with open('/app/dhcp_leases_output.xml', 'w') as f:
                    f.write(response.text)
                info("Exported DHCP leases XML to /app/dhcp_leases_output.xml for debugging")
            except Exception as export_err:
                debug(f"Could not export DHCP XML: {export_err}")

            root = ET.fromstring(response.text)

            # Check for error response
            status = root.get('status')
            if status == 'error':
                error_msg = root.find('.//msg')
                error_text = error_msg.text if error_msg is not None else 'Unknown error'
                warning(f"DHCP lease query returned error: {error_text}")
                return dhcp_hostnames

            # Parse DHCP lease entries
            # Structure: <result><interface><entry><ip><hostname>...
            lease_count = 0
            entry_count = 0

            # Use .// to find all entry elements regardless of nesting
            for entry in root.findall('.//entry'):
                entry_count += 1
                ip_elem = entry.find('ip')
                mac_elem = entry.find('mac')

                # Try to find hostname element (try multiple possible names)
                hostname_elem = None
                for possible_name in ['hostname', 'host-name', 'name']:
                    hostname_elem = entry.find(possible_name)
                    if hostname_elem is not None:
                        break

                # Debug: Show all child elements for first entry
                if entry_count == 1:
                    child_names = [child.tag for child in entry]
                    info(f"DHCP entry structure (first entry): tags={child_names}")
                    if hostname_elem is not None:
                        info(f"Found hostname element: tag='{hostname_elem.tag}', value='{hostname_elem.text}'")
                    else:
                        info("WARNING: No hostname element found in first entry!")

                if ip_elem is not None and ip_elem.text:
                    ip_address = ip_elem.text.strip()

                    # Get hostname if available
                    if hostname_elem is not None and hostname_elem.text:
                        hostname = hostname_elem.text.strip()
                        if hostname:  # Only add if hostname is not empty
                            dhcp_hostnames[ip_address] = hostname
                            lease_count += 1
                            info(f"✓ DHCP match: IP={ip_address} → Hostname={hostname} (MAC={mac_elem.text if mac_elem is not None else 'N/A'})")
                    else:
                        # Log entries without hostnames for debugging (first 3 only)
                        if entry_count <= 3:
                            info(f"✗ DHCP entry missing hostname: IP={ip_address}, MAC={mac_elem.text if mac_elem is not None else 'N/A'}")

            info(f"DHCP Summary: Processed {entry_count} total entries, found {lease_count} with hostnames")
            if lease_count > 0:
                info(f"Sample DHCP hostname mappings (first 5): {dict(list(dhcp_hostnames.items())[:5])}")
            else:
                info("No DHCP leases with hostnames found - this may be normal if DHCP is not configured on this firewall")

        else:
            warning(f"Failed to fetch DHCP leases: HTTP {response.status_code}")
            debug(f"Response text: {response.text[:500]}")

    except Exception as e:
        exception(f"Error fetching DHCP leases: {str(e)}")

    debug(f"=== Completed get_dhcp_leases with {len(dhcp_hostnames)} entries ===")
    return dhcp_hostnames


def get_connected_devices(firewall_config):
    """Fetch ARP entries from all interfaces on the firewall and enrich with DHCP hostnames"""
    debug("=== Starting get_connected_devices ===")
    try:
        firewall_ip, api_key, base_url = firewall_config
        debug(f"Using firewall API: {base_url}")

        # Get interface-to-zone mappings first
        interface_zones = get_interface_zones(firewall_config)

        # Get DHCP leases for hostname lookups
        debug("Fetching DHCP leases for hostname resolution")
        dhcp_hostnames = get_dhcp_leases(firewall_config)
        debug(f"Retrieved {len(dhcp_hostnames)} DHCP hostname mappings")

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
                mac_address = mac.text if mac is not None and mac.text else '-'
                interface_name = interface.text if interface is not None and interface.text else '-'

                # Convert TTL from seconds to minutes
                ttl_seconds = ttl.text if ttl is not None and ttl.text else None
                ttl_minutes = '-'
                if ttl_seconds and ttl_seconds.isdigit():
                    ttl_minutes = str(round(int(ttl_seconds) / 60, 1))

                # Get security zone for this interface
                zone = '-'
                if interface_name != '-':
                    # Try exact match first
                    if interface_name in interface_zones:
                        zone = interface_zones[interface_name]
                    else:
                        # Try base interface (e.g., ethernet1/1 from ethernet1/1.100)
                        base_interface = interface_name.split('.')[0]
                        if base_interface in interface_zones:
                            zone = interface_zones[base_interface]

                # Get IP address for hostname lookup
                ip_address = ip.text if ip is not None and ip.text else '-'

                # Lookup hostname from DHCP leases if available
                hostname = dhcp_hostnames.get(ip_address, '-')
                if hostname != '-':
                    debug(f"Matched hostname '{hostname}' for IP {ip_address}")

                device_entry = {
                    'hostname': hostname,  # From DHCP leases if available
                    'ip': ip_address,
                    'mac': mac_address,
                    'vlan': '-',  # Will be extracted from interface if available
                    'interface': interface_name,
                    'ttl': ttl_minutes,
                    'status': status.text if status is not None and status.text else '-',
                    'port': port.text if port is not None and port.text else '-',
                    'zone': zone,  # Security zone
                    'vendor': None,  # Will be looked up from vendor database
                    'is_virtual': False,  # Will be determined by MAC analysis
                    'virtual_type': None  # Type of virtual MAC if detected
                }

                # Try to extract VLAN from interface name (e.g., "ethernet1/1.100" -> VLAN 100)
                if device_entry['interface'] != '-' and '.' in device_entry['interface']:
                    try:
                        vlan_id = device_entry['interface'].split('.')[-1]
                        if vlan_id.isdigit():
                            device_entry['vlan'] = vlan_id
                    except:
                        pass

                # Lookup vendor name for MAC address first
                vendor_name = lookup_mac_vendor(mac_address)
                if vendor_name:
                    device_entry['vendor'] = vendor_name

                # Check if MAC is virtual/locally administered
                # Pass vendor name to help detect randomized Apple/Android devices
                virtual_info = is_virtual_mac(mac_address, vendor_name)
                device_entry['is_virtual'] = virtual_info['is_virtual']
                device_entry['virtual_type'] = virtual_info['reason']
                device_entry['is_randomized'] = virtual_info.get('is_randomized', False)

                devices.append(device_entry)

            debug(f"Total devices found: {len(devices)}")
            debug(f"Sample device entries (first 3): {devices[:3]}")

            # Perform reverse DNS lookups for ALL devices without hostnames
            # This includes both:
            # 1. Routed devices (no MAC address) - typically 1+ hops away
            # 2. Local devices with static IPs (have MAC but no DHCP hostname)
            devices_without_hostname = [d for d in devices if d['hostname'] == '-' and d['ip'] != '-']

            if devices_without_hostname:
                debug(f"Found {len(devices_without_hostname)} devices without hostnames, performing reverse DNS lookup")
                from utils import reverse_dns_lookup

                # Extract IPs for lookup
                ips_to_lookup = [d['ip'] for d in devices_without_hostname]
                debug(f"Looking up hostnames for IPs: {ips_to_lookup[:5]}{'...' if len(ips_to_lookup) > 5 else ''}")

                # Perform DNS lookups
                dns_results = reverse_dns_lookup(ips_to_lookup, timeout=3)

                # Update devices with DNS results (only if different from IP)
                updated_count = 0
                for device in devices_without_hostname:
                    ip = device['ip']
                    if ip in dns_results and dns_results[ip] != ip:
                        device['hostname'] = dns_results[ip]
                        updated_count += 1
                        mac_info = f" (MAC: {device['mac'][:17]})" if device['mac'] != '-' else " (routed)"
                        debug(f"✓ DNS resolved: {ip} → {dns_results[ip]}{mac_info}")
                    else:
                        debug(f"✗ No PTR record: {ip}")

                info(f"Reverse DNS lookup completed: {updated_count}/{len(devices_without_hostname)} hostnames resolved")
        else:
            error(f"Failed to fetch ARP entries. Status code: {response.status_code}")
            debug(f"Error response: {response.text[:500]}")

        return devices

    except Exception as e:
        exception(f"Error fetching connected devices: {str(e)}")
        return []
