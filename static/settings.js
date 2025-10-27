/**
 * settings.js - Settings Management Module
 *
 * Handles settings functionality including:
 * - Settings load and save
 * - Settings tab switching
 * - Monitored interface updates
 * - Vendor database management
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

            // Monitored interface will be loaded from the selected device in updateDeviceSelector
        }

        // Initialize vendor DB controls
        initVendorDbControls();
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function saveSettingsData() {
    try {
        const refreshInterval = parseInt(document.getElementById('refreshInterval').value);
        const debugLogging = document.getElementById('debugLogging').checked;

        // Get current settings to preserve selected_device_id and monitored_interface
        const currentSettings = await fetch('/api/settings').then(r => r.json());
        const settingsToSave = {
            refresh_interval: refreshInterval,
            debug_logging: debugLogging
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

    // Setup settings tab switching
    initSettingsTabs();
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

