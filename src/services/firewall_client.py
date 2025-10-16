"""
Base Palo Alto Firewall API client.
Handles API requests and configuration management.
"""
import requests
import urllib3
from typing import Tuple, Optional, Dict, Any

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from utils import get_logger, load_settings, increment_api_call
from utils.config import DEFAULT_FIREWALL_IP, DEFAULT_API_KEY
from models import DeviceManager

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = get_logger()


class FirewallClient:
    """Base client for Palo Alto Firewall API interactions."""

    def __init__(self, device_manager: DeviceManager):
        """
        Initialize firewall client.

        Args:
            device_manager: DeviceManager instance
        """
        self.device_manager = device_manager

    def get_config(self, device_id: Optional[str] = None) -> Tuple[str, str, str]:
        """
        Get firewall IP and API key from settings or from a specific device.

        Args:
            device_id: Optional device ID to get config for

        Returns:
            Tuple of (firewall_ip, api_key, base_url)
        """
        if device_id:
            device = self.device_manager.get_device(device_id)
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
            device = self.device_manager.get_device(selected_device_id)
            if device and device.get('enabled', True):
                firewall_ip = device['ip']
                api_key = device['api_key']

        base_url = f"https://{firewall_ip}/api/"
        return firewall_ip, api_key, base_url

    def make_request(
        self,
        cmd: str,
        device_id: Optional[str] = None,
        request_type: str = 'op',
        **extra_params
    ) -> Optional[str]:
        """
        Make an API request to the firewall.

        Args:
            cmd: XML command to execute
            device_id: Optional device ID
            request_type: Request type ('op', 'log', 'config')
            **extra_params: Additional parameters

        Returns:
            Response text or None on error
        """
        try:
            _, api_key, base_url = self.get_config(device_id)

            params = {
                'type': request_type,
                'cmd': cmd,
                'key': api_key
            }
            params.update(extra_params)

            increment_api_call()
            response = requests.get(base_url, params=params, verify=False, timeout=10)

            if response.status_code == 200:
                return response.text
            else:
                logger.warning(f"API request failed with status {response.status_code}")
                return None

        except requests.exceptions.Timeout:
            logger.error(f"API request timeout for device {device_id}")
            return None
        except Exception as e:
            logger.error(f"API request error: {e}")
            return None
