"""
Device Manager for handling multiple firewall devices
"""
import json
import os
import uuid
from datetime import datetime
import requests
import xml.etree.ElementTree as ET
from config import DEVICES_FILE
from logger import debug, error, exception
from encryption import encrypt_dict, decrypt_dict, migrate_unencrypted_data

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
                "groups": ["Headquarters", "Branch Office", "Remote", "Standalone"]
            }
            with open(self.devices_file, 'w') as f:
                json.dump(default_data, f, indent=2)

    def load_devices(self):
        """
        Load all devices from file.
        Automatically decrypts encrypted device credentials.
        """
        try:
            with open(self.devices_file, 'r') as f:
                data = json.load(f)
                encrypted_devices = data.get('devices', [])
                debug("Loaded %d devices from %s", len(encrypted_devices), self.devices_file)

                # Decrypt all device credentials
                decrypted_devices = []
                for device in encrypted_devices:
                    decrypted_device = decrypt_dict(device)
                    decrypted_devices.append(decrypted_device)

                debug("Decrypted %d device records", len(decrypted_devices))
                return decrypted_devices
        except Exception as e:
            exception("Error loading devices: %s", str(e))
            return []

    def save_devices(self, devices):
        """
        Save devices to file with encryption.
        All sensitive device credentials are encrypted before saving.
        """
        try:
            with open(self.devices_file, 'r') as f:
                data = json.load(f)

            # Encrypt all device credentials
            encrypted_devices = []
            for device in devices:
                encrypted_device = encrypt_dict(device)
                encrypted_devices.append(encrypted_device)

            data['devices'] = encrypted_devices
            with open(self.devices_file, 'w') as f:
                json.dump(data, f, indent=2)

            debug("Saved and encrypted %d devices to %s", len(devices), self.devices_file)
            return True
        except Exception as e:
            exception("Error saving devices: %s", str(e))
            return False

    def get_device(self, device_id):
        """Get a specific device by ID"""
        devices = self.load_devices()
        for device in devices:
            if device.get('id') == device_id:
                return device
        return None

    def add_device(self, name, ip, api_key, group="Default", description="", monitored_interface="ethernet1/12"):
        """Add a new device"""
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
            "monitored_interface": monitored_interface
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
                return data.get('groups', [])
        except:
            return ["Default"]

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

    def migrate_existing_devices(self):
        """
        Migrate existing unencrypted device data to encrypted format.
        This is a one-time operation for upgrading existing installations.
        """
        debug("Starting device data migration")
        try:
            if os.path.exists(self.devices_file):
                with open(self.devices_file, 'r') as f:
                    data = json.load(f)

                devices = data.get('devices', [])

                # Migrate and encrypt each device
                encrypted_devices = []
                for device in devices:
                    encrypted_device = migrate_unencrypted_data(device)
                    encrypted_devices.append(encrypted_device)

                data['devices'] = encrypted_devices

                with open(self.devices_file, 'w') as f:
                    json.dump(data, f, indent=2)

                debug("Device data migration completed successfully")
                return True
            else:
                debug("No existing devices file to migrate")
                return True
        except Exception as e:
            error(f"Failed to migrate devices: {e}")
            return False

# Initialize device manager
device_manager = DeviceManager()
