"""
Device Manager for managing multiple Palo Alto firewall devices.
Handles device CRUD operations with encrypted storage.
"""
import os
import json
import uuid
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Dict, Any, Optional

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from utils import get_logger, encrypt_value, decrypt_value
from utils.config import DEVICES_FILE, DEFAULT_DEVICE_GROUPS

logger = get_logger()


class DeviceManager:
    """Manages multiple firewall devices with encrypted storage."""

    def __init__(self, devices_file: str = DEVICES_FILE):
        """
        Initialize DeviceManager.

        Args:
            devices_file: Path to devices JSON file
        """
        self.devices_file = devices_file
        self._ensure_file_exists()

    def _ensure_file_exists(self) -> None:
        """Create devices.json if it doesn't exist."""
        if not os.path.exists(self.devices_file):
            default_data = {
                "devices": [],
                "groups": DEFAULT_DEVICE_GROUPS
            }
            with open(self.devices_file, 'w') as f:
                json.dump(default_data, f, indent=2)
            logger.info(f"Created devices file at {self.devices_file}")

    def load_devices(self) -> List[Dict[str, Any]]:
        """
        Load all devices from file and decrypt sensitive data.

        Returns:
            List of device dictionaries
        """
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
            logger.error(f"Error loading devices: {e}")
            return []

    def save_devices(self, devices: List[Dict[str, Any]]) -> bool:
        """
        Save devices to file with encryption for sensitive data.

        Args:
            devices: List of device dictionaries

        Returns:
            True if successful, False otherwise
        """
        try:
            # Try to read existing data to preserve groups
            try:
                with open(self.devices_file, 'r') as f:
                    data = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError, IOError) as e:
                logger.debug(f"Could not read devices file: {e}")
                data = {
                    "devices": [],
                    "groups": DEFAULT_DEVICE_GROUPS
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
            logger.info(f"Saved {len(devices)} devices")
            return True
        except Exception as e:
            logger.error(f"Error saving devices: {e}")
            return False

    def get_device(self, device_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific device by ID.

        Args:
            device_id: Device UUID

        Returns:
            Device dictionary or None if not found
        """
        devices = self.load_devices()
        for device in devices:
            if device.get('id') == device_id:
                return device
        return None

    def add_device(
        self,
        name: str,
        ip: str,
        api_key: str,
        group: str = "Default",
        description: str = "",
        monitored_interface: str = "ethernet1/1",
        interface_speed_mbps: int = 0
    ) -> Dict[str, Any]:
        """
        Add a new device.

        Args:
            name: Device name
            ip: Device IP address
            api_key: API key for authentication
            group: Device group
            description: Device description
            monitored_interface: Interface to monitor
            interface_speed_mbps: Interface speed (0 for auto-detect)

        Returns:
            New device dictionary
        """
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
            "interface_speed_mbps": interface_speed_mbps
        }

        devices.append(new_device)
        self.save_devices(devices)
        logger.info(f"Added device: {name} ({ip})")
        return new_device

    def update_device(self, device_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Update an existing device.

        Args:
            device_id: Device UUID
            updates: Dictionary of fields to update

        Returns:
            Updated device dictionary or None if not found
        """
        devices = self.load_devices()
        for i, device in enumerate(devices):
            if device.get('id') == device_id:
                devices[i].update(updates)
                self.save_devices(devices)
                logger.info(f"Updated device: {device_id}")
                return devices[i]
        return None

    def delete_device(self, device_id: str) -> bool:
        """
        Delete a device.

        Args:
            device_id: Device UUID

        Returns:
            True if successful
        """
        devices = self.load_devices()
        original_count = len(devices)
        devices = [d for d in devices if d.get('id') != device_id]
        if len(devices) < original_count:
            logger.info(f"Deleted device: {device_id}")
        return self.save_devices(devices)

    def get_groups(self) -> List[str]:
        """
        Get list of device groups.

        Returns:
            List of group names
        """
        try:
            with open(self.devices_file, 'r') as f:
                data = json.load(f)
                groups = data.get('groups', [])
                if not groups:
                    return DEFAULT_DEVICE_GROUPS.copy()
                return groups
        except (FileNotFoundError, json.JSONDecodeError, IOError) as e:
            logger.debug(f"Could not read groups from file: {e}")
            return DEFAULT_DEVICE_GROUPS.copy()

    def test_connection(self, ip: str, api_key: str) -> Dict[str, Any]:
        """
        Test connection to a device.

        Args:
            ip: Device IP address
            api_key: API key

        Returns:
            Dictionary with success status and message
        """
        try:
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

            base_url = f"https://{ip}/api/"
            params = {
                'type': 'op',
                'cmd': '<show><system><info></info></system></show>',
                'key': api_key
            }
            response = requests.get(base_url, params=params, verify=False, timeout=5)
            if response.status_code == 200:
                root = ET.fromstring(response.text)
                if root.find('.//hostname') is not None:
                    logger.info(f"Connection test successful for {ip}")
                    return {"success": True, "message": "Connection successful"}
            return {"success": False, "message": "Invalid response from firewall"}
        except requests.exceptions.Timeout:
            logger.warning(f"Connection timeout for {ip}")
            return {"success": False, "message": "Connection timeout"}
        except Exception as e:
            logger.error(f"Connection test failed for {ip}: {e}")
            return {"success": False, "message": f"Connection failed: {str(e)}"}
