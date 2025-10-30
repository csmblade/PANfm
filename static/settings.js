/**
 * settings.js - Settings Management Module
 *
 * Handles settings functionality including:
 * - Settings load and save
 * - Settings tab switching
 * - Monitored interface updates
 * - Vendor database management
 * - Password change functionality
 * - Tile heading updates
 */

// Settings functionality
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();

        if (data.status === 'success') {
            document.getElementById('refreshInterval').value = data.settings.refresh_interval;
            document.getElementById('debugLogging').checked = data.settings.debug_logging || false;
            document.getElementById('tonyMode').checked = data.settings.tony_mode || false;
            document.getElementById('timezone').value = data.settings.timezone || 'UTC';

            // Store timezone globally for use in time formatting functions
            window.userTimezone = data.settings.timezone || 'UTC';

            // Initialize Tony Mode session keepalive
            initializeTonyMode(data.settings.tony_mode || false);

            // Monitored interface will be loaded from the selected device in updateDeviceSelector
        }

        // Initialize vendor DB controls
        initVendorDbControls();

        // Initialize service port DB controls
        initServicePortDbControls();
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function saveSettingsData() {
    try {
        const refreshInterval = parseInt(document.getElementById('refreshInterval').value);
        const debugLogging = document.getElementById('debugLogging').checked;
        const tonyMode = document.getElementById('tonyMode').checked;
        const timezone = document.getElementById('timezone').value;

        // Get current settings to preserve selected_device_id and monitored_interface
        const currentSettings = await fetch('/api/settings').then(r => r.json());
        const settingsToSave = {
            refresh_interval: refreshInterval,
            debug_logging: debugLogging,
            tony_mode: tonyMode,
            timezone: timezone
        };

        // Preserve selected_device_id and monitored_interface from current settings
        if (currentSettings.status === 'success') {
            if (currentSettings.settings.selected_device_id) {
                settingsToSave.selected_device_id = currentSettings.settings.selected_device_id;
            }
            if (currentSettings.settings.monitored_interface) {
                settingsToSave.monitored_interface = currentSettings.settings.monitored_interface;
            }
        }

        // Get CSRF token
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify(settingsToSave)
        });

        const data = await response.json();

        if (data.status === 'success') {
            // Update local variables
            UPDATE_INTERVAL = refreshInterval * 1000;
            window.userTimezone = timezone;

            // Restart update interval with new timing
            if (updateIntervalId) {
                clearInterval(updateIntervalId);
            }
            updateIntervalId = setInterval(fetchThroughputData, UPDATE_INTERVAL);

            // Show success message
            const successMsg = document.getElementById('settingsSuccessMessage');
            successMsg.style.display = 'block';
            setTimeout(() => {
                successMsg.style.display = 'none';
            }, 3000);

            // Update debug alert visibility
            const debugAlert = document.getElementById('debugAlert');
            if (debugLogging === true) {
                debugAlert.style.display = 'block';
            } else {
                debugAlert.style.display = 'none';
            }

            // Update Tony Mode session keepalive
            initializeTonyMode(tonyMode);
        } else {
            alert('Failed to save settings: ' + data.message);
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Error saving settings: ' + error.message);
    }
}

function resetSettingsData() {
    document.getElementById('refreshInterval').value = 15;
    document.getElementById('debugLogging').checked = false;
    document.getElementById('tonyMode').checked = false;
    document.getElementById('timezone').value = 'UTC';
}

// Update monitored interface from dashboard
// updateMonitoredInterface function moved to app.js to access device variables

async function initSettings() {
    // Load settings on startup
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();

        if (data.status === 'success') {
            UPDATE_INTERVAL = data.settings.refresh_interval * 1000;

            // Store timezone globally for use in time formatting functions
            window.userTimezone = data.settings.timezone || 'UTC';

            // Show debug alert if debug logging is enabled
            const debugAlert = document.getElementById('debugAlert');
            if (data.settings.debug_logging === true) {
                debugAlert.style.display = 'block';
            } else {
                debugAlert.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error loading initial settings:', error);
    }

    // Setup event listeners
    document.getElementById('saveSettings').addEventListener('click', saveSettingsData);
    document.getElementById('resetSettings').addEventListener('click', resetSettingsData);

    // Setup password change listener
    initPasswordChange();

    // Setup settings tab switching
    initSettingsTabs();

    // Check if password change is required (from URL parameter)
    checkPasswordChangeRequired();
}

// Settings tab switching functionality
function initSettingsTabs() {
    const tabs = document.querySelectorAll('.settings-tab');
    const tabContents = document.querySelectorAll('.settings-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');

            // Remove active class from all tabs
            tabs.forEach(t => {
                t.classList.remove('active');
                t.style.color = '#666';
                t.style.borderBottomColor = 'transparent';
                t.style.background = 'transparent';
            });

            // Add active class to clicked tab
            tab.classList.add('active');
            tab.style.color = '#333';
            tab.style.borderBottomColor = '#FA582D';
            tab.style.background = 'white';

            // Hide all tab contents
            tabContents.forEach(content => {
                content.style.display = 'none';
            });

            // Show target tab content
            const targetContent = document.getElementById(targetTab + '-tab');
            if (targetContent) {
                targetContent.style.display = 'block';
            }
        });
    });
}

// Vendor Database Functions
async function loadVendorDbInfo() {
    console.log('Loading vendor database info...');
    try {
        const response = await fetch('/api/vendor-db/info');
        const data = await response.json();

        if (data.status === 'success') {
            const info = data.info;

            document.getElementById('vendorDbStatus').textContent = info.exists ? '✓ Loaded' : '✗ Not loaded';
            document.getElementById('vendorDbStatus').style.color = info.exists ? '#28a745' : '#dc3545';
            document.getElementById('vendorDbEntries').textContent = info.entries.toLocaleString();
            document.getElementById('vendorDbSize').textContent = `${info.size_mb} MB`;
            document.getElementById('vendorDbModified').textContent = info.modified;
        }
    } catch (error) {
        console.error('Error loading vendor DB info:', error);
        document.getElementById('vendorDbStatus').textContent = 'Error';
        document.getElementById('vendorDbStatus').style.color = '#dc3545';
    }
}

async function uploadVendorDb() {
    const fileInput = document.getElementById('vendorDbFileInput');
    const messageDiv = document.getElementById('vendorDbUploadMessage');
    const uploadBtn = document.getElementById('uploadVendorDbBtn');

    if (!fileInput.files || fileInput.files.length === 0) {
        messageDiv.textContent = 'Please select a file first';
        messageDiv.style.display = 'block';
        messageDiv.style.background = '#fff3cd';
        messageDiv.style.color = '#856404';
        messageDiv.style.border = '1px solid #ffeaa7';
        return;
    }

    const file = fileInput.files[0];

    if (!file.name.endsWith('.json')) {
        messageDiv.textContent = 'File must be a JSON file';
        messageDiv.style.display = 'block';
        messageDiv.style.background = '#f8d7da';
        messageDiv.style.color = '#721c24';
        messageDiv.style.border = '1px solid #f5c6cb';
        return;
    }

    // Disable button during upload
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';

    try {
        const formData = new FormData();
        formData.append('file', file);

        // Get CSRF token
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

        const response = await fetch('/api/vendor-db/upload', {
            method: 'POST',
            headers: {
                'X-CSRFToken': csrfToken
            },
            body: formData
        });

        const data = await response.json();

        if (data.status === 'success') {
            messageDiv.textContent = data.message;
            messageDiv.style.display = 'block';
            messageDiv.style.background = '#d4edda';
            messageDiv.style.color = '#155724';
            messageDiv.style.border = '1px solid #c3e6cb';

            // Refresh info display
            await loadVendorDbInfo();

            // Clear file input
            fileInput.value = '';
        } else {
            messageDiv.textContent = 'Error: ' + data.message;
            messageDiv.style.display = 'block';
            messageDiv.style.background = '#f8d7da';
            messageDiv.style.color = '#721c24';
            messageDiv.style.border = '1px solid #f5c6cb';
        }
    } catch (error) {
        console.error('Error uploading vendor DB:', error);
        messageDiv.textContent = 'Upload failed: ' + error.message;
        messageDiv.style.display = 'block';
        messageDiv.style.background = '#f8d7da';
        messageDiv.style.color = '#721c24';
        messageDiv.style.border = '1px solid #f5c6cb';
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload Database';
    }
}

function initVendorDbControls() {
    // Upload button
    const uploadBtn = document.getElementById('uploadVendorDbBtn');
    if (uploadBtn && !uploadBtn.hasAttribute('data-listener')) {
        uploadBtn.addEventListener('click', uploadVendorDb);
        uploadBtn.setAttribute('data-listener', 'true');
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshVendorDbInfoBtn');
    if (refreshBtn && !refreshBtn.hasAttribute('data-listener')) {
        refreshBtn.addEventListener('click', loadVendorDbInfo);
        refreshBtn.setAttribute('data-listener', 'true');
    }

    // Load initial info
    loadVendorDbInfo();
}

// ============================================================================
// Service Port Database Functions
// ============================================================================

async function loadServicePortDbInfo() {
    console.log('Loading service port database info...');
    try {
        const response = await fetch('/api/service-port-db/info');
        const data = await response.json();

        if (data.status === 'success') {
            const info = data.info;

            document.getElementById('servicePortDbStatus').textContent = info.exists ? '✓ Loaded' : '✗ Not loaded';
            document.getElementById('servicePortDbStatus').style.color = info.exists ? '#28a745' : '#dc3545';
            document.getElementById('servicePortDbEntries').textContent = info.entries.toLocaleString();
            document.getElementById('servicePortDbSize').textContent = `${info.size_mb} MB`;
            document.getElementById('servicePortDbModified').textContent = info.modified;
        }
    } catch (error) {
        console.error('Error loading service port DB info:', error);
        document.getElementById('servicePortDbStatus').textContent = 'Error';
        document.getElementById('servicePortDbStatus').style.color = '#dc3545';
    }
}

async function uploadServicePortDb() {
    const fileInput = document.getElementById('servicePortDbFileInput');
    const messageDiv = document.getElementById('servicePortDbUploadMessage');
    const uploadBtn = document.getElementById('uploadServicePortDbBtn');

    if (!fileInput.files || fileInput.files.length === 0) {
        messageDiv.textContent = 'Please select a file first';
        messageDiv.style.display = 'block';
        messageDiv.style.background = '#fff3cd';
        messageDiv.style.color = '#856404';
        messageDiv.style.border = '1px solid #ffeaa7';
        return;
    }

    const file = fileInput.files[0];

    if (!file.name.endsWith('.xml')) {
        messageDiv.textContent = 'File must be an XML file';
        messageDiv.style.display = 'block';
        messageDiv.style.background = '#f8d7da';
        messageDiv.style.color = '#721c24';
        messageDiv.style.border = '1px solid #f5c6cb';
        return;
    }

    // Disable button during upload
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';

    try {
        const formData = new FormData();
        formData.append('file', file);

        // Get CSRF token
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

        const response = await fetch('/api/service-port-db/upload', {
            method: 'POST',
            headers: {
                'X-CSRFToken': csrfToken
            },
            body: formData
        });

        const data = await response.json();

        if (data.status === 'success') {
            messageDiv.textContent = data.message;
            messageDiv.style.display = 'block';
            messageDiv.style.background = '#d4edda';
            messageDiv.style.color = '#155724';
            messageDiv.style.border = '1px solid #c3e6cb';

            // Refresh info display
            await loadServicePortDbInfo();

            // Clear file input
            fileInput.value = '';
        } else {
            messageDiv.textContent = 'Error: ' + data.message;
            messageDiv.style.display = 'block';
            messageDiv.style.background = '#f8d7da';
            messageDiv.style.color = '#721c24';
            messageDiv.style.border = '1px solid #f5c6cb';
        }
    } catch (error) {
        console.error('Error uploading service port DB:', error);
        messageDiv.textContent = 'Upload failed: ' + error.message;
        messageDiv.style.display = 'block';
        messageDiv.style.background = '#f8d7da';
        messageDiv.style.color = '#721c24';
        messageDiv.style.border = '1px solid #f5c6cb';
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload Database';
    }
}

function initServicePortDbControls() {
    // Upload button
    const uploadBtn = document.getElementById('uploadServicePortDbBtn');
    if (uploadBtn && !uploadBtn.hasAttribute('data-listener')) {
        uploadBtn.addEventListener('click', uploadServicePortDb);
        uploadBtn.setAttribute('data-listener', 'true');
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshServicePortDbInfoBtn');
    if (refreshBtn && !refreshBtn.hasAttribute('data-listener')) {
        refreshBtn.addEventListener('click', loadServicePortDbInfo);
        refreshBtn.setAttribute('data-listener', 'true');
    }

    // Load initial info
    loadServicePortDbInfo();
}

// ============================================================================
// Password Change Functions
// ============================================================================

/**
 * Check if password change is required (from URL parameter)
 * If yes, automatically open Settings page and Security tab with warning
 */
function checkPasswordChangeRequired() {
    console.log('[PASSWORD-CHANGE] Checking if password change required...');
    const urlParams = new URLSearchParams(window.location.search);
    const mustChangePassword = urlParams.get('must_change_password');
    console.log('[PASSWORD-CHANGE] URL parameter value:', mustChangePassword);

    if (mustChangePassword === 'true') {
        console.log('[PASSWORD-CHANGE] Password change required - showing prompt');

        // Show password change warning
        const warningDiv = document.getElementById('passwordChangeWarning');
        if (warningDiv) {
            console.log('[PASSWORD-CHANGE] Showing warning div');
            warningDiv.style.display = 'block';
        } else {
            console.error('[PASSWORD-CHANGE] Warning div not found!');
        }

        // Switch to Settings page
        console.log('[PASSWORD-CHANGE] Switching to Settings page');
        showPage('settings');

        // Switch to Security tab
        const securityTab = document.querySelector('.settings-tab[data-tab="security"]');
        if (securityTab) {
            console.log('[PASSWORD-CHANGE] Clicking Security tab');
            securityTab.click();
        } else {
            console.error('[PASSWORD-CHANGE] Security tab not found!');
        }

        // Clear URL parameter
        window.history.replaceState({}, document.title, '/');
        console.log('[PASSWORD-CHANGE] URL parameter cleared');
    } else {
        console.log('[PASSWORD-CHANGE] No password change required');
    }
}

/**
 * Initialize password change functionality
 */
function initPasswordChange() {
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    if (changePasswordBtn && !changePasswordBtn.hasAttribute('data-listener')) {
        changePasswordBtn.addEventListener('click', handlePasswordChange);
        changePasswordBtn.setAttribute('data-listener', 'true');
    }
}

/**
 * Handle password change form submission
 */
async function handlePasswordChange() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const messageDiv = document.getElementById('passwordChangeMessage');
    const changeBtn = document.getElementById('changePasswordBtn');

    // Clear previous message
    messageDiv.style.display = 'none';
    messageDiv.textContent = '';

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        showPasswordMessage('All fields are required', 'error');
        return;
    }

    if (newPassword.length < 8) {
        showPasswordMessage('New password must be at least 8 characters', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showPasswordMessage('New passwords do not match', 'error');
        return;
    }

    // Disable button during request
    changeBtn.disabled = true;
    changeBtn.textContent = 'Changing Password...';

    try {
        // Get CSRF token
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({
                old_password: currentPassword,
                new_password: newPassword
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            showPasswordMessage(data.message || 'Password changed successfully!', 'success');

            // Clear form fields
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';

            // Hide warning if shown
            const warningDiv = document.getElementById('passwordChangeWarning');
            if (warningDiv) {
                warningDiv.style.display = 'none';
            }
        } else {
            showPasswordMessage(data.message || 'Failed to change password', 'error');
        }
    } catch (error) {
        console.error('Error changing password:', error);
        showPasswordMessage('Error changing password: ' + error.message, 'error');
    } finally {
        // Re-enable button
        changeBtn.disabled = false;
        changeBtn.textContent = 'Change Password';
    }
}

/**
 * Show password change message
 * @param {string} message - Message to display
 * @param {string} type - 'success' or 'error'
 */
function showPasswordMessage(message, type) {
    const messageDiv = document.getElementById('passwordChangeMessage');

    messageDiv.textContent = message;
    messageDiv.style.display = 'block';

    if (type === 'success') {
        messageDiv.style.background = '#d4edda';
        messageDiv.style.color = '#155724';
        messageDiv.style.border = '1px solid #c3e6cb';
    } else {
        messageDiv.style.background = '#f8d7da';
        messageDiv.style.color = '#721c24';
        messageDiv.style.border = '1px solid #f5c6cb';
    }

    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init();
        initSidebarResize();
        initPageNavigation();
        initDeviceSelector();
    });
} else {
    init();
    initSidebarResize();
    initPageNavigation();
    initDeviceSelector();
}

/**
 * Initialize or update Tony Mode session keepalive
 * @param {boolean} enabled - Whether Tony Mode is enabled
 */
function initializeTonyMode(enabled) {
    // Clear any existing keepalive interval
    if (window.sessionKeepaliveIntervalId) {
        clearInterval(window.sessionKeepaliveIntervalId);
        window.sessionKeepaliveIntervalId = null;
        console.log('Tony Mode: Stopped session keepalive');
    }

    // If Tony Mode is enabled, start session keepalive
    if (enabled) {
        // Ping the server every 10 minutes to keep session alive
        // Session lifetime is 24 hours, so this ensures it never expires
        const KEEPALIVE_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds

        window.sessionKeepaliveIntervalId = setInterval(async () => {
            try {
                await fetch('/api/session-keepalive');
                console.log('Tony Mode: Session keepalive ping sent');
            } catch (error) {
                console.error('Tony Mode: Session keepalive failed:', error);
            }
        }, KEEPALIVE_INTERVAL);

        console.log('Tony Mode: Started session keepalive (every 10 minutes)');
    }
}

