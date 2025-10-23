/**
 * devices.js - Device Management Module
 *
 * Handles firewall device management including:
 * - Device selector initialization
 * - Device CRUD operations (Create, Read, Update, Delete)
 * - Device switching and state management
 * - Device modal and forms
 * - Connection testing
 */

function initDeviceSelector() {
    console.log('=== initDeviceSelector called ===');
    // Load devices and populate selector
    loadDevices();

    // Add event listener to device selector - use a function that re-attaches if needed
    setTimeout(() => {
        const deviceSelector = document.getElementById('deviceSelector');
        console.log('Device selector element:', deviceSelector);
        if (deviceSelector) {
            // Remove any existing listeners to avoid duplicates
            deviceSelector.removeEventListener('change', onDeviceChange);
            console.log('Attaching change event listener to device selector');
            deviceSelector.addEventListener('change', onDeviceChange);
        } else {
            console.error('Device selector not found!');
        }
    }, 100);
}

// ============================================================================
// Device Management Functions
// ============================================================================

let currentDevices = [];
let currentGroups = [];
let selectedDeviceId = '';

async function loadDevices() {
    try {
        const response = await fetch('/api/devices');
        const data = await response.json();

        if (data.status === 'success') {
            currentDevices = data.devices;
            currentGroups = data.groups;
            renderDevicesTable();
            updateGroupOptions();
            await updateDeviceSelector();

            // Re-attach event listener after updating selector
            setTimeout(() => {
                const deviceSelector = document.getElementById('deviceSelector');
                if (deviceSelector) {
                    deviceSelector.removeEventListener('change', onDeviceChange);
                    deviceSelector.addEventListener('change', onDeviceChange);
                    console.log('Event listener re-attached after loadDevices');
                }
            }, 50);
        }
    } catch (error) {
        console.error('Error loading devices:', error);
    }
}

function updateDeviceSelector() {
    console.log('=== updateDeviceSelector called ===');
    const selector = document.getElementById('deviceSelector');
    if (!selector) return;

    console.log('Current selectedDeviceId before update:', selectedDeviceId);

    // Only fetch settings if we don't have a selected device yet
    const shouldFetchSettings = !selectedDeviceId;

    const populateSelector = async () => {
        console.log('Populating selector with selectedDeviceId:', selectedDeviceId);

        // Populate selector
        if (currentDevices.length === 0) {
            selector.innerHTML = '<option value="">No devices configured</option>';
        } else {
            let options = '';

            // Auto-select first device if none is selected
            let didAutoSelect = false;
            if (!selectedDeviceId && currentDevices.length > 0) {
                selectedDeviceId = currentDevices[0].id;
                didAutoSelect = true;
                console.log('Auto-selected first device:', selectedDeviceId);
            }

            currentDevices.forEach(device => {
                const selected = device.id === selectedDeviceId ? 'selected' : '';
                options += `<option value="${device.id}" ${selected}>${device.name} (${device.ip})</option>`;
            });
            selector.innerHTML = options;

            // Set the value explicitly
            if (selectedDeviceId) {
                selector.value = selectedDeviceId;
                console.log('Set selector value to:', selectedDeviceId);

                // Load interface for the selected device
                const device = currentDevices.find(d => d.id === selectedDeviceId);
                if (device) {
                    const deviceInterface = device.monitored_interface || 'ethernet1/12';
                    const interfaceInput = document.getElementById('monitoredInterfaceInput');
                    if (interfaceInput) {
                        interfaceInput.value = deviceInterface;
                        console.log('Loaded interface for selected device:', deviceInterface);
                    }
                }
            }

            // If we auto-selected, save it and load its interface
            if (didAutoSelect) {
                console.log('Auto-selection triggered, saving device and loading interface...');
                try {
                    const currentSettings = await fetch('/api/settings').then(r => r.json());
                    if (currentSettings.status === 'success') {
                        const settings = currentSettings.settings;
                        settings.selected_device_id = selectedDeviceId;

                        // Get device's interface
                        const device = currentDevices.find(d => d.id === selectedDeviceId);
                        if (device) {
                            const deviceInterface = device.monitored_interface || 'ethernet1/12';
                            settings.monitored_interface = deviceInterface;

                            // Update interface input
                            const interfaceInput = document.getElementById('monitoredInterfaceInput');
                            if (interfaceInput) {
                                interfaceInput.value = deviceInterface;
                            }
                        }

                        // Save settings
                        await fetch('/api/settings', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify(settings)
                        });
                        console.log('Auto-selected device saved to settings');
                    }
                } catch (error) {
                    console.error('Error saving auto-selected device:', error);
                }
            }
        }
    };

    if (shouldFetchSettings) {
        console.log('Fetching settings to get selected device...');
        fetch('/api/settings')
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    selectedDeviceId = data.settings.selected_device_id || '';
                    console.log('Got selectedDeviceId from settings:', selectedDeviceId);
                }
                populateSelector();
            });
    } else {
        console.log('Using existing selectedDeviceId');
        populateSelector();
    }
}

async function onDeviceChange() {
    console.log('=== onDeviceChange fired ===');
    console.log('Device dropdown changed!');

    const selector = document.getElementById('deviceSelector');
    selectedDeviceId = selector.value;
    console.log('Selected device ID:', selectedDeviceId);

    // Reset chart data when switching devices
    chartData.labels = [];
    chartData.inbound = [];
    chartData.outbound = [];
    chartData.total = [];

    // Update chart datasets directly
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    chart.data.datasets[2].data = [];
    chart.update('none');
    console.log('Chart data cleared and updated');

    // Show loading state in ALL dashboard statistics
    // Throughput stats
    document.getElementById('inboundValue').innerHTML = '<span style="font-size: 0.7em;">Loading...</span>';
    document.getElementById('outboundValue').innerHTML = '<span style="font-size: 0.7em;">Loading...</span>';
    document.getElementById('totalValue').innerHTML = '<span style="font-size: 0.7em;">Loading...</span>';

    // Session stats
    document.getElementById('sessionValue').innerHTML = '<span style="font-size: 0.7em;">Loading...</span>';
    document.getElementById('tcpValue').innerHTML = '<span style="font-size: 0.7em;">Loading...</span>';
    document.getElementById('udpValue').innerHTML = '<span style="font-size: 0.7em;">Loading...</span>';
    document.getElementById('icmpValue').innerHTML = '<span style="font-size: 0.7em;">Loading...</span>';

    // Threat stats
    document.getElementById('criticalValue').innerHTML = '<span style="font-size: 0.7em;">Loading...</span>';
    document.getElementById('mediumValue').innerHTML = '<span style="font-size: 0.7em;">Loading...</span>';
    document.getElementById('blockedUrlValue').innerHTML = '<span style="font-size: 0.7em;">Loading...</span>';
    document.getElementById('topAppsValue').innerHTML = '<span style="font-size: 0.7em;">Loading...</span>';

    // Sidebar stats - reset to zero/loading immediately
    const sidebarPPS = document.getElementById('sidebarPPS');
    const sidebarUptime = document.getElementById('sidebarUptime');
    const sidebarApiStats = document.getElementById('sidebarApiStats');
    const sidebarLastUpdate = document.getElementById('sidebarLastUpdate');

    if (sidebarPPS) sidebarPPS.textContent = '0 PPS';
    if (sidebarUptime) sidebarUptime.textContent = '-';
    if (sidebarApiStats) sidebarApiStats.textContent = '-';
    if (sidebarLastUpdate) sidebarLastUpdate.textContent = '-';

    // Sidebar last seen stats - reset to dash immediately
    const sidebarCritical = document.getElementById('sidebarCriticalLastSeen');
    const sidebarMedium = document.getElementById('sidebarMediumLastSeen');
    const sidebarBlocked = document.getElementById('sidebarBlockedUrlLastSeen');
    if (sidebarCritical) sidebarCritical.textContent = '-';
    if (sidebarMedium) sidebarMedium.textContent = '-';
    if (sidebarBlocked) sidebarBlocked.textContent = '-';

    // Clear mini charts
    if (sessionChart) {
        sessionChart.data.datasets[0].data = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        sessionChart.update();
    }
    if (tcpChart) {
        tcpChart.data.datasets[0].data = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        tcpChart.update();
    }
    if (udpChart) {
        udpChart.data.datasets[0].data = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        udpChart.update();
    }

    // Clear historical data arrays
    historicalData.inbound = [];
    historicalData.outbound = [];
    historicalData.total = [];
    historicalData.sessions = [];
    historicalData.tcp = [];
    historicalData.udp = [];
    historicalData.icmp = [];

    // Clear threat tile contents
    document.getElementById('criticalLogs').innerHTML = '<div style="color: #ffffff; text-align: center; padding: 10px;">Loading...</div>';
    document.getElementById('mediumLogs').innerHTML = '<div style="color: #ffffff; text-align: center; padding: 10px;">Loading...</div>';
    document.getElementById('blockedUrlLogs').innerHTML = '<div style="color: #ffffff; text-align: center; padding: 10px;">Loading...</div>';
    document.getElementById('topAppsContainer').innerHTML = '<div style="color: #ffffff; text-align: center; padding: 10px;">Loading...</div>';

    console.log('All dashboard stats reset to zero');

    // Save selected device to settings
    try {
        console.log('Fetching current settings...');
        const currentSettings = await fetch('/api/settings').then(r => r.json());
        console.log('Current settings:', currentSettings);

        if (currentSettings.status === 'success') {
            const settings = currentSettings.settings;
            settings.selected_device_id = selectedDeviceId;

            console.log('Saving device selection to settings...');
            await fetch('/api/settings', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(settings)
            });

            // Load interface for this device
            const device = currentDevices.find(d => d.id === selectedDeviceId);
            console.log('Found device:', device);

            if (device) {
                const interfaceInput = document.getElementById('monitoredInterfaceInput');
                const deviceInterface = device.monitored_interface || 'ethernet1/12';
                console.log('Device interface:', deviceInterface);

                if (interfaceInput) {
                    interfaceInput.value = deviceInterface;
                    console.log('Updated interface input to:', deviceInterface);
                }

                // Update settings with device's interface
                settings.monitored_interface = deviceInterface;
                console.log('Saving interface to settings...');
                const interfaceSaveResponse = await fetch('/api/settings', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(settings)
                });
                console.log('Interface save response:', interfaceSaveResponse.status);

                // If device doesn't have interface saved yet, save the default
                if (!device.monitored_interface) {
                    console.log('Device has no interface saved, saving default...');
                    device.monitored_interface = deviceInterface;
                    const deviceUpdateResponse = await fetch(`/api/devices/${selectedDeviceId}`, {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(device)
                    });
                    console.log('Device update response:', deviceUpdateResponse.status);
                }
            }

            // Wait a moment to ensure settings are fully saved before fetching new data
            console.log('Waiting for settings to save, then fetching throughput data...');
            await new Promise(resolve => setTimeout(resolve, 200));
            console.log('Now fetching throughput data from new device...');

            // Restart the update interval to ensure proper timing
            console.log('Restarting update interval...');
            if (updateIntervalId) {
                clearInterval(updateIntervalId);
            }
            fetchThroughputData();
            updateIntervalId = setInterval(fetchThroughputData, UPDATE_INTERVAL);
            console.log(`Update interval restarted: ${UPDATE_INTERVAL}ms`);

            // Refresh page-specific data if on those pages
            const currentPage = document.querySelector('.page-content:not([style*="display: none"])');
            if (currentPage) {
                const pageId = currentPage.id;
                console.log('Current page:', pageId);
                if (pageId === 'policies-content') {
                    loadPolicies();
                } else if (pageId === 'system-logs-content') {
                    loadSystemLogs();
                } else if (pageId === 'traffic-content') {
                    updateTrafficPage();
                } else if (pageId === 'software-updates-content') {
                    loadSoftwareUpdates();
                } else if (pageId === 'applications-content') {
                    loadApplications();
                } else if (pageId === 'connected-devices-content') {
                    loadConnectedDevices();
                }
            }
        }
    } catch (error) {
        console.error('Error in onDeviceChange:', error);
    }
    console.log('=== onDeviceChange complete ===');
}

function renderDevicesTable() {
    const tbody = document.getElementById('devicesTableBody');

    if (currentDevices.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="padding: 40px; text-align: center; color: #999;">
                    No devices found. Click "Add Device" to get started.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = currentDevices.map(device => `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px; color: #333;">${device.name}</td>
            <td style="padding: 12px; color: #666;">${device.ip}</td>
            <td style="padding: 12px; color: #666;">${device.group || 'Default'}</td>
            <td style="padding: 12px; color: #666;">${device.uptime || 'N/A'}</td>
            <td style="padding: 12px; color: #666;">${device.version || 'N/A'}</td>
            <td style="padding: 12px;">
                <span style="display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600; ${device.enabled ? 'background: #d4edda; color: #155724;' : 'background: #f8d7da; color: #721c24;'}">
                    ${device.enabled ? '🟢 Enabled' : '🔴 Disabled'}
                </span>
            </td>
            <td style="padding: 12px; text-align: center;">
                <button onclick="editDevice('${device.id}')" style="padding: 6px 12px; background: #ff6600; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 5px;">
                    Edit
                </button>
                <button onclick="deleteDevice('${device.id}')" style="padding: 6px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Delete
                </button>
            </td>
        </tr>
    `).join('');
}

function updateGroupOptions() {
    const groupSelect = document.getElementById('deviceGroup');
    groupSelect.innerHTML = currentGroups.map(group =>
        `<option value="${group}">${group}</option>`
    ).join('');
}

function showDeviceModal(deviceId = null) {
    const modal = document.getElementById('deviceModal');
    const title = document.getElementById('deviceModalTitle');
    const form = document.getElementById('deviceForm');

    form.reset();
    document.getElementById('connectionTestResult').style.display = 'none';

    if (deviceId) {
        const device = currentDevices.find(d => d.id === deviceId);
        if (device) {
            title.textContent = 'Edit Device';
            document.getElementById('deviceId').value = device.id;
            document.getElementById('deviceName').value = device.name;
            document.getElementById('deviceIp').value = device.ip;
            document.getElementById('deviceApiKey').value = device.api_key;
            document.getElementById('deviceGroup').value = device.group || 'Default';
            document.getElementById('deviceDescription').value = device.description || '';
        }
    } else {
        title.textContent = 'Add Device';
        document.getElementById('deviceId').value = '';
    }

    modal.style.display = 'flex';
}

function hideDeviceModal() {
    document.getElementById('deviceModal').style.display = 'none';
}

async function saveDevice(event) {
    event.preventDefault();

    const deviceId = document.getElementById('deviceId').value;
    const deviceData = {
        name: document.getElementById('deviceName').value,
        ip: document.getElementById('deviceIp').value,
        api_key: document.getElementById('deviceApiKey').value,
        group: document.getElementById('deviceGroup').value,
        description: document.getElementById('deviceDescription').value
    };

    try {
        let response;
        if (deviceId) {
            response = await fetch(`/api/devices/${deviceId}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(deviceData)
            });
        } else {
            response = await fetch('/api/devices', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(deviceData)
            });
        }

        const data = await response.json();

        if (data.status === 'success') {
            hideDeviceModal();
            await loadDevices();
            alert(data.message);
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        alert('Error saving device: ' + error.message);
    }
}

async function editDevice(deviceId) {
    showDeviceModal(deviceId);
}

async function deleteDevice(deviceId) {
    const device = currentDevices.find(d => d.id === deviceId);
    if (!confirm(`Are you sure you want to delete device "${device.name}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/devices/${deviceId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.status === 'success') {
            await loadDevices();
            alert(data.message);
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        alert('Error deleting device: ' + error.message);
    }
}

async function testConnection() {
    const ip = document.getElementById('deviceIp').value;
    const apiKey = document.getElementById('deviceApiKey').value;
    const resultDiv = document.getElementById('connectionTestResult');

    if (!ip || !apiKey) {
        alert('Please enter IP and API Key first');
        return;
    }

    resultDiv.textContent = 'Testing connection...';
    resultDiv.style.display = 'block';
    resultDiv.style.background = '#fff3cd';
    resultDiv.style.color = '#856404';

    try {
        const response = await fetch('/api/devices/test-connection', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ip, api_key: apiKey })
        });

        const data = await response.json();

        if (data.status === 'success') {
            resultDiv.textContent = '✓ ' + data.message;
            resultDiv.style.background = '#d4edda';
            resultDiv.style.color = '#155724';
        } else {
            resultDiv.textContent = '✗ ' + data.message;
            resultDiv.style.background = '#f8d7da';
            resultDiv.style.color = '#721c24';
        }
    } catch (error) {
        resultDiv.textContent = '✗ Connection test failed: ' + error.message;
        resultDiv.style.background = '#f8d7da';
        resultDiv.style.color = '#721c24';
    }
}
