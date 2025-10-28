"""
PANfm Version Management
Semantic Versioning: MAJOR.MINOR.PATCH

MAJOR: Breaking changes, major architecture changes
MINOR: New features, significant updates (backward compatible)
PATCH: Bug fixes, small improvements, documentation updates
"""

# Current version
VERSION_MAJOR = 1
VERSION_MINOR = 3
VERSION_PATCH = 1

# Build metadata (optional)
VERSION_BUILD = "20251028"  # YYYYMMDD format

# Pre-release identifier (optional, e.g., 'alpha', 'beta', 'rc1')
VERSION_PRERELEASE = None

# Codename for this version (optional)
VERSION_CODENAME = "Resilient Upgrades"


def get_version():
    """
    Get the full version string
    Returns: str - Full version string (e.g., "1.0.3" or "1.0.3-beta")
    """
    version = f"{VERSION_MAJOR}.{VERSION_MINOR}.{VERSION_PATCH}"

    if VERSION_PRERELEASE:
        version += f"-{VERSION_PRERELEASE}"

    return version


def get_version_info():
    """
    Get detailed version information
    Returns: dict - Dictionary with version details
    """
    return {
        'version': get_version(),
        'major': VERSION_MAJOR,
        'minor': VERSION_MINOR,
        'patch': VERSION_PATCH,
        'build': VERSION_BUILD,
        'prerelease': VERSION_PRERELEASE,
        'codename': VERSION_CODENAME,
        'display': get_display_version()
    }


def get_display_version():
    """
    Get version string suitable for UI display
    Returns: str - Formatted version for display (e.g., "v1.0.3 - Tech Support")
    """
    version = f"v{get_version()}"

    if VERSION_CODENAME:
        version += f" - {VERSION_CODENAME}"

    return version


def get_short_version():
    """
    Get short version string (MAJOR.MINOR only)
    Returns: str - Short version (e.g., "1.0")
    """
    return f"{VERSION_MAJOR}.{VERSION_MINOR}"


# Version history and changelog
VERSION_HISTORY = [
    {
        'version': '1.3.1',
        'codename': 'Resilient Upgrades',
        'date': '2025-10-28',
        'type': 'patch',
        'changes': [
            'Added automatic base image detection and download for PAN-OS upgrades',
            'New function: getRequiredBaseImage() detects when maintenance releases need base images',
            'Base image logic: x.y.0 required before installing x.y.z (where z > 0)',
            'Automatic workflow: Downloads base image first if needed, then target version',
            'UI indicators: Green checkmark if base downloaded, yellow warning if needed',
            'Dynamic button text: "Download Base + Version, Install & Reboot" when base needed',
            'Confirmation dialog shows actual steps including base image download',
            'Adjusted progress percentages: Base (0-20%), Target (20-40%), Install (40-90%), Reboot (90-100%)',
            'Updated pollJobStatus() to accept custom progress ranges',
            'Prevents installation failures due to missing base images',
            'Code optimizations to stay under 1,000-line JavaScript limit (999 lines)',
            'Increased software-updates endpoint rate limit to 120 per minute'
        ]
    },
    {
        'version': '1.3.0',
        'codename': 'Resilient Upgrades',
        'date': '2025-10-28',
        'type': 'minor',
        'changes': [
            'Added automatic reboot monitoring with real-time device status polling',
            'New feature: Pulsing progress bar animation during reboot monitoring',
            'New feature: Live elapsed time counter during reboot (updates every second)',
            'New feature: Status indicators (🔴 offline, 🟡 checking, 🟢 online)',
            'New feature: Automatic device data refresh when reboot completes',
            'Added browser navigation resilience - resume monitoring after closing browser',
            'Added localStorage persistence for upgrade and reboot monitoring state',
            'New feature: Version dropdown to select any available PAN-OS version',
            'New feature: Skip download step if version already downloaded',
            'Improved download success detection - checks details field for "success"',
            'Fixed rate limiting: Changed polling interval from 5s to 15s',
            'Set job-status endpoint rate limit to 300/hour (15s intervals)',
            'Set software-updates endpoint rate limit to 120/minute for reboot monitoring',
            'Added SSL warning suppression for self-signed certificates',
            'Fixed error message persistence when switching devices',
            'Added device status indicators on Managed Devices page (🟢🔴⚫)',
            'Added sortable columns on Managed Devices page (all 6 columns)',
            'Added standalone Reboot tab in Device Info section',
            'Improved error handling and state cleanup throughout workflow',
            'pages-panos-upgrade.js: 650 → 875 lines (browser resilience + reboot monitoring)',
            'Maintained compliance with .clinerules (under 1,000-line JavaScript limit)'
        ]
    },
    {
        'version': '1.2.0',
        'codename': 'Automated Upgrades',
        'date': '2025-10-28',
        'type': 'minor',
        'changes': [
            'Added PAN-OS automated upgrade system with 5-step workflow',
            'New feature: Check for available PAN-OS versions',
            'New feature: Download PAN-OS versions with job tracking',
            'New feature: Install PAN-OS versions with job tracking',
            'New feature: Real-time job status polling (5-second intervals)',
            'New feature: Firewall reboot after upgrade',
            'Added upgrade progress modal with visual feedback',
            'New backend module: firewall_api_upgrades.py (~400 lines)',
            'New frontend module: pages-panos-upgrade.js (~360 lines)',
            'Added 5 new API endpoints for upgrade operations',
            'Added api_request_post() utility function for POST requests',
            'Maintained modular architecture per .clinerules guidelines'
        ]
    },
    {
        'version': '1.1.1',
        'codename': 'Traffic Insights',
        'date': '2025-10-28',
        'type': 'patch',
        'changes': [
            'Fixed interface IP address display - properly merge hw and ifnet XML data',
            'Fixed VLAN display - replace "0" with "-" for untagged interfaces',
            'Standardized table styling across all pages (Connected Devices, Applications, Interfaces)',
            'Unified font sizing (0.9em) and padding (12px) for consistent readability',
            'Applied brand typography (Roboto headers, Open Sans content) consistently',
            'Improved text fitting in table columns with proper spacing'
        ]
    },
    {
        'version': '1.1.0',
        'codename': 'Traffic Insights',
        'date': '2025-10-28',
        'type': 'minor',
        'changes': [
            'Added Tony Mode - disable session timeout with keepalive',
            'Added real-time interface traffic graphs (updates every 15 seconds)',
            'Added per-interface traffic rate display (Kbps/Mbps/Gbps)',
            'Replaced transceiver column with live traffic visualization',
            'Added support for subinterface traffic monitoring',
            'Implemented DHCP IP address detection for interfaces',
            'Added speed formatting for WAN and interface speeds (Mbps/Gbps)',
            'New API endpoint: /api/interface-traffic',
            'New API endpoint: /api/session-keepalive'
        ]
    },
    {
        'version': '1.0.3',
        'codename': 'Tech Support',
        'date': '2025-10-27',
        'type': 'patch',
        'changes': [
            'Added tech support file generation with progress tracking',
            'Removed policies page and related code',
            'Fixed CSRF token handling for POST requests',
            'Restored utility functions (formatTimestamp, formatDaysAgo)',
            'Updated documentation (PROJECT_MANIFEST.md, .clinerules)'
        ]
    },
    {
        'version': '1.0.2',
        'codename': 'Security Hardening',
        'date': '2025-10-27',
        'type': 'minor',
        'changes': [
            'Added authentication system with bcrypt password hashing',
            'Implemented CSRF protection with Flask-WTF',
            'Added rate limiting with Flask-Limiter',
            'Improved encryption security with file permissions',
            'Removed hardcoded credentials',
            'Added environment-based configuration'
        ]
    },
    {
        'version': '1.0.1',
        'codename': 'Module Split',
        'date': '2025-10-27',
        'type': 'patch',
        'changes': [
            'Split firewall_api.py into specialized modules',
            'Created firewall_api_logs.py for log functions',
            'Created firewall_api_policies.py for policy functions',
            'Created firewall_api_devices.py for device functions',
            'Maintained backward compatibility'
        ]
    },
    {
        'version': '1.0.0',
        'codename': 'Modular Refactoring',
        'date': '2025-10-26',
        'type': 'major',
        'changes': [
            'Initial modular architecture',
            'Split monolithic app.py into focused modules',
            'Created PROJECT_MANIFEST.md documentation',
            'Established development guidelines'
        ]
    }
]


if __name__ == '__main__':
    # Print version information when run directly
    print(f"PANfm Version: {get_display_version()}")
    print(f"Full version: {get_version()}")
    print(f"Build: {VERSION_BUILD}")
    print(f"\nVersion Info:")
    import json
    print(json.dumps(get_version_info(), indent=2))
