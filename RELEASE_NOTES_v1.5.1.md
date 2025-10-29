# PANfm v1.5.1 - "Hotfix Selector"

**Release Date:** October 29, 2025
**Release Type:** Patch (Bug Fix)

---

## 🐛 Critical Bug Fixes

### 1. Upgrade Confirmation Modal Version Display

**Problem:** When selecting a hotfix version (e.g., `12.1.3-h1`) from the PAN-OS upgrade dropdown, the confirmation modal was incorrectly showing the base version (`12.1.3`) instead of the selected hotfix version.

**Impact:** This could cause user confusion and potentially lead to installing the wrong version if the user didn't notice the discrepancy.

**Root Cause:** The `upgradeState.selectedVersion` was initialized when "Check for Updates" was clicked, but there was a potential race condition where the dropdown change event listener might not reliably update the state before the upgrade workflow started.

**Solution:** Added explicit re-read of the dropdown value at the start of `startUpgradeWorkflow()` function to ensure the confirmation always uses the user's actual selected version from the UI.

**Files Changed:**
- `static/pages-panos-upgrade.js` - Added 7 lines to re-read dropdown value
- Added debug logging for version selection tracking

**Example:**
```
Before Fix: "This will upgrade PAN-OS from 12.1.2 to 12.1.3"
After Fix:  "This will upgrade PAN-OS from 12.1.2 to 12.1.3-h1"
```

### 2. Sidebar PAN-OS Version Display

**Problem:** The sidebar was displaying "N/A" for the PAN-OS version instead of showing the actual version (e.g., `12.1.3-h1`).

**Impact:** Users couldn't see the current PAN-OS version at a glance in the sidebar, making it harder to quickly verify firewall version status.

**Root Cause:** The `get_software_updates()` function in `firewall_api_devices.py` was not extracting the PAN-OS version from the `<sw-version>` XML element. It only extracted the "Application & Threat" version, so when the dashboard looked for a software entry named "PAN-OS", it couldn't find one.

**Solution:** Added extraction of the `<sw-version>` element and added it to the software list with the name "PAN-OS" so the dashboard can properly display it.

**Files Changed:**
- `firewall_api_devices.py` - Added 4 lines to extract PAN-OS version

**Example:**
```
Before Fix: PAN-OS Version: N/A
After Fix:  PAN-OS Version: 12.1.3-h1
```

---

## 📦 Repository Cleanup & Documentation

### Files Removed (32 total)
- **Temporary logs** (6 files): logs.txt, tech_support_logs.txt, etc.
- **XML debug exports** (11 files): interface_counter_output.xml, system_resources_output.xml, etc.
- **Screenshots/images** (6 files): applications.png, apps.png, category.png, etc. (~700KB)
- **Redundant documentation** (10 files): DOCKER_TROUBLESHOOTING.md, ENCRYPTION_GUIDE.md, etc.

**Total Space Freed:** ~1.8MB

### README.md Improvements
- **Simplified:** 314 lines → 89 lines (72% reduction)
- **Docker-focused:** Clear deployment steps with setup.sh
- **Added badges:** Version, Python, Flask, Docker, License
- **First login:** Default credentials clearly stated
- **Update instructions:** Windows batch scripts documented

### Enhanced .gitignore
Added patterns to prevent future clutter:
- `*.png`, `*.rtf` - Screenshots
- `logs*.txt`, `tech_support_logs*.txt` - Temp logs
- `*_output.xml` - Debug exports
- `service_port_db.json` - Large user uploads

---

## ⚡ Rate Limiting Improvements

Updated rate limits to support auto-refresh workflows:

**Monitoring Endpoints:** 600/hour
- `/api/throughput`, `/api/health`, `/api/system-logs`, `/api/traffic-logs`
- `/api/interfaces`, `/api/license`, `/api/applications`, `/api/settings`
- Supports 5-second auto-refresh (12/min = 720/hr, set to 600 for safety)

**Operational Endpoints:** 100/hour
- Device create/update/delete, PAN-OS upgrades, Content updates
- Allows testing, retries, and normal workflows

**Impact:** Fixes rate limit errors during auto-refresh operations

---

## 📊 Version History Summary

| Version | Codename | Type | Date | Key Feature |
|---------|----------|------|------|-------------|
| v1.5.1 | Hotfix Selector | Patch | 2025-10-29 | **Bug fix: Hotfix version display** |
| v1.5.0 | Content Management | Minor | 2025-10-29 | Content update system |
| v1.4.0 | Performance Optimized | Minor | 2025-10-28 | API call optimization |
| v1.3.0 | Resilient Upgrades | Minor | 2025-10-28 | Reboot monitoring |
| v1.2.0 | Automated Upgrades | Minor | 2025-10-28 | PAN-OS automated upgrades |

---

## 🚀 Quick Start

### Deploy with Docker

```bash
# Clone the repository
git clone https://github.com/csmblade/panfm
cd panfm

# First-time setup (creates required files)
./setup.sh

# Start with Docker
docker-compose up -d
```

Access at: **http://localhost:3000**

### Default Login
- **Username:** `admin`
- **Password:** `admin` *(must change on first login)*

### Update from v1.5.0

```bash
# Pull latest changes
git pull origin main

# Quick restart (preserves data)
docker-compose restart

# Windows users
quick-restart.bat
```

---

## 🔐 Security

All sensitive data encrypted at rest:
- Settings (settings.json)
- Device credentials (devices.json)
- User authentication (auth.json)

**⚠️ CRITICAL:** Backup `encryption.key` securely. Losing it means losing access to all encrypted data.

---

## 📝 Complete Changelog

### v1.5.1 Changes
1. **CRITICAL BUG FIX:** Upgrade confirmation modal now shows correct version
2. **Fixed:** Selecting hotfix version (e.g., 12.1.3-h1) was showing base version (12.1.3)
3. **Added:** Explicit dropdown value re-read before starting upgrade workflow
4. **Fixed:** Potential race condition in version state management
5. **Added:** Debug logging for version selection tracking
6. **CRITICAL BUG FIX:** Sidebar PAN-OS version now displays correctly
7. **Fixed:** PAN-OS version showing "N/A" instead of actual version (e.g., 12.1.3-h1)
8. **Added:** PAN-OS version extraction in get_software_updates() function
9. **Cleanup:** Removed 32 unnecessary files (~1.8MB)
10. **Docs:** Simplified README.md from 314 to 89 lines
11. **Badges:** Added project badges and visitor counter to README
12. **Cleanup:** Enhanced .gitignore with cleanup patterns
13. **Performance:** Rate limiting improvements for auto-refresh support

---

## 🔍 Testing Checklist

To verify this release:

### Bug Fix #1: Upgrade Confirmation Modal
- [ ] Deploy using Docker (`docker-compose up -d`)
- [ ] Login with admin/admin, change password
- [ ] Go to Device Info → PAN-OS tab
- [ ] Click "Check for Updates"
- [ ] Select a hotfix version from dropdown (e.g., 12.1.3-h1)
- [ ] Click "Install & Reboot" button
- [ ] **Verify:** Confirmation modal shows correct version with hotfix suffix
- [ ] Check console logs for version selection debugging

### Bug Fix #2: Sidebar Version Display
- [ ] After logging in, check the left sidebar
- [ ] **Verify:** "PAN-OS Version" shows actual version (e.g., 12.1.3-h1)
- [ ] **Verify:** Version is NOT showing "N/A"
- [ ] Switch between devices (if multi-device setup)
- [ ] **Verify:** Version updates correctly for each device

---

## 🙏 Credits

Built for network security professionals managing Palo Alto Networks firewalls.

**Previous Releases:**
- [v1.5.0 - Content Management](https://github.com/csmblade/panfm/releases/tag/v1.5.0)
- [v1.4.0 - Performance Optimized](https://github.com/csmblade/panfm/releases/tag/v1.4.0)
- [v1.3.0 - Resilient Upgrades](https://github.com/csmblade/panfm/releases/tag/v1.3.0)

**Full Changelog:** See [version.py](version.py) for complete version history.
