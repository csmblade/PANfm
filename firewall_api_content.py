"""
Content Update Functions (App & Threat, Antivirus, WildFire)
Handles checking, downloading, and installing content updates

Per user requirements:
- Download and install as combined workflow
- Support individual component updates
- No reboot required

Separate module per .clinerules file size guidelines
"""

import xml.etree.ElementTree as ET
from logger import debug, error, exception, warning
from utils import api_request_post


def check_content_updates(firewall_ip, api_key):
    """
    Check for available content updates

    Command: <request><content><upgrade><check></check></upgrade></content></request>

    Returns:
        dict: {
            'status': 'success' or 'error',
            'current_version': str (current content version),
            'latest_version': str (latest available version),
            'needs_update': bool,
            'downloaded': str ('yes'/'no'),
            'message': str
        }
    """
    debug(f"Checking content updates for firewall: {firewall_ip}")

    try:
        cmd = '<request><content><upgrade><check></check></upgrade></content></request>'
        debug(f"Sending content check command: {cmd}")

        response = api_request_post(firewall_ip, api_key, cmd, cmd_type='op')

        if not response:
            error(f"No response from firewall {firewall_ip}")
            return {'status': 'error', 'message': 'No response from firewall'}

        debug(f"Content check response (first 500 chars): {response[:500]}")

        root = ET.fromstring(response)
        status = root.get('status')

        if status != 'success':
            error_msg = root.findtext('.//msg', 'Unknown error')
            error(f"Content check failed: {error_msg}")
            return {'status': 'error', 'message': error_msg}

        # Parse content version info
        current_version = None
        latest_version = None
        latest_downloaded = 'no'
        all_versions = []

        # Find content entries and collect all versions
        for entry in root.findall('.//entry'):
            version = entry.findtext('version', '')
            is_current = entry.findtext('current', 'no')
            is_latest = entry.findtext('latest', 'no')
            is_downloaded = entry.findtext('downloaded', 'no')

            version_data = {
                'version': version,
                'current': is_current,
                'latest': is_latest,
                'downloaded': is_downloaded
            }
            all_versions.append(version_data)

            if is_current == 'yes':
                current_version = version
                debug(f"Found current content version: {current_version}")
            if is_latest == 'yes':
                latest_version = version
                latest_downloaded = is_downloaded
                debug(f"Found latest content version (marked): {latest_version}, downloaded: {latest_downloaded}")

        # If no version is explicitly marked as latest, find the newest version
        # by comparing all available versions (highest version number)
        if not latest_version and all_versions:
            # Sort versions to find the newest
            sorted_versions = sorted(all_versions, key=lambda x: x['version'], reverse=True)
            latest_version = sorted_versions[0]['version']
            latest_downloaded = sorted_versions[0]['downloaded']
            debug(f"No explicit latest version found, using newest: {latest_version}")

        needs_update = (current_version != latest_version) if (current_version and latest_version) else False

        debug(f"Content update status: current={current_version}, latest={latest_version}, needs_update={needs_update}, all_versions={len(all_versions)}")

        return {
            'status': 'success',
            'current_version': current_version or 'Unknown',
            'latest_version': latest_version or 'Unknown',
            'needs_update': needs_update,
            'downloaded': latest_downloaded,
            'message': 'Update available' if needs_update else 'Up to date'
        }

    except ET.ParseError as e:
        exception(f"Failed to parse content updates response: {e}")
        return {'status': 'error', 'message': f'Parse error: {str(e)}'}
    except Exception as e:
        exception(f"Error checking content updates: {e}")
        return {'status': 'error', 'message': str(e)}


def download_content_update(firewall_ip, api_key):
    """
    Download latest content update

    Command: <request><content><upgrade><download><latest/></download></upgrade></content></request>

    Returns:
        dict: {
            'status': 'success' or 'error',
            'jobid': str (job ID for polling),
            'message': str
        }
    """
    debug(f"Downloading latest content update for: {firewall_ip}")

    try:
        cmd = '<request><content><upgrade><download><latest/></download></upgrade></content></request>'
        debug(f"Sending content download command: {cmd}")

        response = api_request_post(firewall_ip, api_key, cmd, cmd_type='op')

        if not response:
            error("No response from firewall for content download")
            return {'status': 'error', 'message': 'No response from firewall'}

        debug(f"Content download response (first 500 chars): {response[:500]}")

        root = ET.fromstring(response)
        status = root.get('status')

        if status == 'success':
            job_elem = root.find('.//job')
            if job_elem is not None:
                jobid = job_elem.text
                debug(f"Content download job started with jobid: {jobid}")
                return {
                    'status': 'success',
                    'jobid': jobid,
                    'message': 'Content download started'
                }
            else:
                error("No job ID found in success response")
                return {'status': 'error', 'message': 'No job ID in response'}
        else:
            error_msg = root.findtext('.//msg', 'Unknown error')
            error(f"Content download failed: {error_msg}")
            return {'status': 'error', 'message': error_msg}

    except ET.ParseError as e:
        exception(f"Failed to parse content download response: {e}")
        return {'status': 'error', 'message': f'Parse error: {str(e)}'}
    except Exception as e:
        exception(f"Error downloading content: {e}")
        return {'status': 'error', 'message': str(e)}


def install_content_update(firewall_ip, api_key, version='latest'):
    """
    Install downloaded content update

    Command: <request><content><upgrade><install><version>latest</version></install></upgrade></content></request>

    Args:
        firewall_ip: Firewall IP address
        api_key: API key for authentication
        version: Version to install (default: 'latest')

    Returns:
        dict: {
            'status': 'success' or 'error',
            'jobid': str (job ID for polling),
            'message': str
        }
    """
    debug(f"Installing content update version: {version} for: {firewall_ip}")

    try:
        cmd = f'<request><content><upgrade><install><version>{version}</version></install></upgrade></content></request>'
        debug(f"Sending content install command: {cmd}")

        response = api_request_post(firewall_ip, api_key, cmd, cmd_type='op')

        if not response:
            error("No response from firewall for content install")
            return {'status': 'error', 'message': 'No response from firewall'}

        debug(f"Content install response (first 500 chars): {response[:500]}")

        root = ET.fromstring(response)
        status = root.get('status')

        if status == 'success':
            job_elem = root.find('.//job')
            if job_elem is not None:
                jobid = job_elem.text
                debug(f"Content install job started with jobid: {jobid}")
                return {
                    'status': 'success',
                    'jobid': jobid,
                    'message': 'Content install started'
                }
            else:
                error("No job ID found in success response")
                return {'status': 'error', 'message': 'No job ID in response'}
        else:
            error_msg = root.findtext('.//msg', 'Unknown error')
            error(f"Content install failed: {error_msg}")
            return {'status': 'error', 'message': error_msg}

    except ET.ParseError as e:
        exception(f"Failed to parse content install response: {e}")
        return {'status': 'error', 'message': f'Parse error: {str(e)}'}
    except Exception as e:
        exception(f"Error installing content: {e}")
        return {'status': 'error', 'message': str(e)}
