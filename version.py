"""
PANfm Version Management
Semantic Versioning: MAJOR.MINOR.PATCH

MAJOR: Breaking changes, major architecture changes
MINOR: New features, significant updates (backward compatible)
PATCH: Bug fixes, small improvements, documentation updates
"""

# Current version
VERSION_MAJOR = 1
VERSION_MINOR = 0
VERSION_PATCH = 3

# Build metadata (optional)
VERSION_BUILD = "20251027"  # YYYYMMDD format

# Pre-release identifier (optional, e.g., 'alpha', 'beta', 'rc1')
VERSION_PRERELEASE = None

# Codename for this version (optional)
VERSION_CODENAME = "Tech Support"


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
