/**
 * pages-connected-devices.js - Connected Devices Page Module
 *
 * Handles Connected Devices page functionality including:
 * - Loading and displaying ARP table data
 * - Filtering by VLAN, status, and search
 * - Sorting by multiple columns (hostname, IP, MAC, VLAN, zone, interface, age)
 * - Default sort: age (lowest to highest)
 * - Exporting to CSV and XML formats
 * - MAC vendor lookup integration
 */

// Connected Devices functionality
let allConnectedDevices = [];
let connectedDevicesMetadata = {};
let connectedDevicesSortBy = 'age'; // Default sort by age
let connectedDevicesSortDesc = false; // Default ascending (lowest to highest)

async function loadConnectedDevices() {
    console.log('Loading connected devices...');
    try {
        const response = await fetch('/api/connected-devices');
        const data = await response.json();

        const tableDiv = document.getElementById('connectedDevicesTable');
        const errorDiv = document.getElementById('connectedDevicesErrorMessage');

        if (data.status === 'success' && data.devices.length > 0) {
            errorDiv.style.display = 'none';

            // Store devices for filtering/searching
            allConnectedDevices = data.devices;
            connectedDevicesMetadata = {
                total: data.total,
                timestamp: data.timestamp
            };

            console.log(`Loaded ${data.devices.length} connected devices`);

            // Set up event listeners
            setupConnectedDevicesEventListeners();

            // Render the table
            renderConnectedDevicesTable();
        } else {
            errorDiv.textContent = data.message || 'No connected devices found';
            errorDiv.style.display = 'block';
            tableDiv.innerHTML = '';
        }
    } catch (error) {
        console.error('Error loading connected devices:', error);
        document.getElementById('connectedDevicesErrorMessage').textContent = 'Failed to load connected devices: ' + error.message;
        document.getElementById('connectedDevicesErrorMessage').style.display = 'block';
    }
}

function setupConnectedDevicesEventListeners() {
    // Search input
    const searchInput = document.getElementById('connectedDevicesSearchInput');
    if (searchInput && !searchInput.hasAttribute('data-listener')) {
        searchInput.addEventListener('input', () => renderConnectedDevicesTable());
        searchInput.setAttribute('data-listener', 'true');
    }

    // VLAN filter
    const vlanFilter = document.getElementById('connectedDevicesVlanFilter');
    if (vlanFilter && !vlanFilter.hasAttribute('data-listener')) {
        vlanFilter.addEventListener('change', () => renderConnectedDevicesTable());
        vlanFilter.setAttribute('data-listener', 'true');
    }

    // Zone filter
    const zoneFilter = document.getElementById('connectedDevicesZoneFilter');
    if (zoneFilter && !zoneFilter.hasAttribute('data-listener')) {
        zoneFilter.addEventListener('change', () => renderConnectedDevicesTable());
        zoneFilter.setAttribute('data-listener', 'true');
    }

    // Limit selector
    const limitSelect = document.getElementById('connectedDevicesLimit');
    if (limitSelect && !limitSelect.hasAttribute('data-listener')) {
        limitSelect.addEventListener('change', () => renderConnectedDevicesTable());
        limitSelect.setAttribute('data-listener', 'true');
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshConnectedDevicesBtn');
    if (refreshBtn && !refreshBtn.hasAttribute('data-listener')) {
        refreshBtn.addEventListener('click', () => loadConnectedDevices());
        refreshBtn.setAttribute('data-listener', 'true');
    }

    // Export buttons
    const exportCSVBtn = document.getElementById('exportDevicesCSV');
    if (exportCSVBtn && !exportCSVBtn.hasAttribute('data-listener')) {
        exportCSVBtn.addEventListener('click', () => exportDevices('csv'));
        exportCSVBtn.setAttribute('data-listener', 'true');
    }

    const exportXMLBtn = document.getElementById('exportDevicesXML');
    if (exportXMLBtn && !exportXMLBtn.hasAttribute('data-listener')) {
        exportXMLBtn.addEventListener('click', () => exportDevices('xml'));
        exportXMLBtn.setAttribute('data-listener', 'true');
    }

    // Populate VLAN and Zone filters with unique values
    populateVLANFilter();
    populateZoneFilter();
}

function sortConnectedDevices(field) {
    // Toggle sort direction if clicking the same field
    if (connectedDevicesSortBy === field) {
        connectedDevicesSortDesc = !connectedDevicesSortDesc;
    } else {
        connectedDevicesSortBy = field;
        // Default direction based on field type
        if (field === 'age') {
            connectedDevicesSortDesc = false; // Ascending for age (lowest first)
        } else {
            connectedDevicesSortDesc = true; // Descending for others
        }
    }
    renderConnectedDevicesTable();
}

function populateVLANFilter() {
    const vlanFilter = document.getElementById('connectedDevicesVlanFilter');
    if (!vlanFilter) return;

    // Get unique VLANs
    const vlans = new Set();
    allConnectedDevices.forEach(device => {
        if (device.vlan && device.vlan !== '-') {
            vlans.add(device.vlan);
        }
    });

    // Clear existing options (except "All VLANs")
    while (vlanFilter.options.length > 1) {
        vlanFilter.remove(1);
    }

    // Add VLAN options sorted
    Array.from(vlans).sort((a, b) => {
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        }
        return a.localeCompare(b);
    }).forEach(vlan => {
        const option = document.createElement('option');
        option.value = vlan;
        option.textContent = `VLAN ${vlan}`;
        vlanFilter.appendChild(option);
    });
}

function populateZoneFilter() {
    const zoneFilter = document.getElementById('connectedDevicesZoneFilter');
    if (!zoneFilter) return;

    // Get unique zones
    const zones = new Set();
    allConnectedDevices.forEach(device => {
        if (device.zone && device.zone !== '-') {
            zones.add(device.zone);
        }
    });

    // Clear existing options (except "All Zones")
    while (zoneFilter.options.length > 1) {
        zoneFilter.remove(1);
    }

    // Add zone options sorted alphabetically
    Array.from(zones).sort().forEach(zone => {
        const option = document.createElement('option');
        option.value = zone;
        option.textContent = zone;
        zoneFilter.appendChild(option);
    });
}

function renderConnectedDevicesTable() {
    const tableDiv = document.getElementById('connectedDevicesTable');
    const searchTerm = (document.getElementById('connectedDevicesSearchInput')?.value || '').toLowerCase().trim();
    const vlanFilter = document.getElementById('connectedDevicesVlanFilter')?.value || '';
    const zoneFilter = document.getElementById('connectedDevicesZoneFilter')?.value || '';
    const limit = parseInt(document.getElementById('connectedDevicesLimit')?.value || '50');

    // Filter devices
    let filteredDevices = allConnectedDevices.filter(device => {
        // Search filter
        if (searchTerm) {
            const searchableText = `${device.hostname} ${device.ip} ${device.mac} ${device.interface}`.toLowerCase();
            if (!searchableText.includes(searchTerm)) {
                return false;
            }
        }

        // VLAN filter
        if (vlanFilter && device.vlan !== vlanFilter) {
            return false;
        }

        // Zone filter
        if (zoneFilter && device.zone !== zoneFilter) {
            return false;
        }

        return true;
    });

    // Apply sorting
    filteredDevices.sort((a, b) => {
        let aVal = a[connectedDevicesSortBy];
        let bVal = b[connectedDevicesSortBy];

        // Handle missing values
        if (aVal === undefined || aVal === null) aVal = '';
        if (bVal === undefined || bVal === null) bVal = '';

        // For string fields, use locale compare
        if (typeof aVal === 'string') {
            return connectedDevicesSortDesc ?
                bVal.localeCompare(aVal) :
                aVal.localeCompare(bVal);
        }

        // For numeric fields (age, vlan)
        return connectedDevicesSortDesc ? bVal - aVal : aVal - bVal;
    });

    // Apply limit (unless "All" is selected)
    const displayDevices = limit === -1 ? filteredDevices : filteredDevices.slice(0, limit);

    // Helper function for sort indicators
    const getSortIndicator = (field) => {
        if (connectedDevicesSortBy === field) {
            return connectedDevicesSortDesc ? ' ▼' : ' ▲';
        }
        return '';
    };

    // Create table HTML
    let html = `
        <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="padding: 15px 20px; background: linear-gradient(135deg, #FA582D 0%, #FF7A55 100%); color: white; display: flex; justify-content: space-between; align-items: center; font-family: var(--font-primary);">
                <div>
                    <strong style="font-size: 1.1em;">Connected Devices</strong>
                    <span style="margin-left: 15px; opacity: 0.9; font-family: var(--font-secondary);">Showing ${displayDevices.length} of ${filteredDevices.length} devices</span>
                </div>
                <div style="font-size: 0.9em; opacity: 0.9; font-family: var(--font-secondary);">
                    Total: ${allConnectedDevices.length}
                </div>
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-family: var(--font-secondary); font-size: 0.85em;">
                    <thead>
                        <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th onclick="sortConnectedDevices('hostname')" style="padding: 10px 12px; text-align: left; font-weight: 600; color: #333; white-space: nowrap; font-family: var(--font-primary); cursor: pointer; user-select: none;">Hostname${getSortIndicator('hostname')}</th>
                            <th onclick="sortConnectedDevices('ip')" style="padding: 10px 12px; text-align: left; font-weight: 600; color: #333; white-space: nowrap; font-family: var(--font-primary); cursor: pointer; user-select: none;">IP Address${getSortIndicator('ip')}</th>
                            <th onclick="sortConnectedDevices('mac')" style="padding: 10px 12px; text-align: left; font-weight: 600; color: #333; white-space: nowrap; font-family: var(--font-primary); cursor: pointer; user-select: none;">MAC Address${getSortIndicator('mac')}</th>
                            <th onclick="sortConnectedDevices('vlan')" style="padding: 10px 12px; text-align: left; font-weight: 600; color: #333; white-space: nowrap; font-family: var(--font-primary); cursor: pointer; user-select: none;">VLAN${getSortIndicator('vlan')}</th>
                            <th onclick="sortConnectedDevices('zone')" style="padding: 10px 12px; text-align: left; font-weight: 600; color: #333; white-space: nowrap; font-family: var(--font-primary); cursor: pointer; user-select: none;">Security Zone${getSortIndicator('zone')}</th>
                            <th onclick="sortConnectedDevices('interface')" style="padding: 10px 12px; text-align: left; font-weight: 600; color: #333; white-space: nowrap; font-family: var(--font-primary); cursor: pointer; user-select: none;">Interface${getSortIndicator('interface')}</th>
                            <th onclick="sortConnectedDevices('age')" style="padding: 10px 12px; text-align: left; font-weight: 600; color: #FA582D; white-space: nowrap; font-family: var(--font-primary); cursor: pointer; user-select: none;">Age (minutes)${getSortIndicator('age')}</th>
                        </tr>
                    </thead>
                    <tbody>`;

    displayDevices.forEach((device, index) => {
        const rowStyle = index % 2 === 0 ? 'background: #ffffff;' : 'background: #f8f9fa;';

        // Format MAC address cell with vendor name and virtual indicator
        let macCell = `<div style="font-family: monospace; color: #333;">${device.mac}</div>`;

        // Add badge for virtual/randomized MACs on a new line
        if (device.is_virtual) {
            // Different badge for privacy/randomized MACs (iPhone, Android, Windows)
            if (device.is_randomized) {
                macCell += `<div style="margin-top: 4px;"><span style="background: #FA582D; color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.75em; font-weight: 600;" title="${device.virtual_type || 'Randomized MAC for Privacy'}">PRIVATE</span></div>`;
            } else {
                // Regular virtual MAC (VMs, containers)
                macCell += `<div style="margin-top: 4px;"><span style="background: #FA582D; color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.75em; font-weight: 600;" title="${device.virtual_type || 'Virtual/Locally Administered MAC'}">VIRTUAL</span></div>`;
            }
        }

        // Add vendor name underneath if available
        if (device.vendor) {
            macCell += `<div style="font-size: 0.85em; color: #666; margin-top: 2px;">${device.vendor}</div>`;
        }

        // Add virtual type detail if available
        if (device.is_virtual && device.virtual_type) {
            const detailColor = device.is_randomized ? '#C44520' : '#C44520';
            macCell += `<div style="font-size: 0.75em; color: ${detailColor}; margin-top: 2px;">${device.virtual_type}</div>`;
        }

        html += `
            <tr style="${rowStyle} border-bottom: 1px solid #dee2e6;">
                <td style="padding: 8px 12px; color: #333;">${device.hostname}</td>
                <td style="padding: 8px 12px; color: #333; font-family: monospace;">${device.ip}</td>
                <td style="padding: 8px 12px;">${macCell}</td>
                <td style="padding: 8px 12px; color: #333;">${device.vlan}</td>
                <td style="padding: 8px 12px; color: #333;">${device.zone || '-'}</td>
                <td style="padding: 8px 12px; color: #333; font-family: monospace;">${device.interface}</td>
                <td style="padding: 8px 12px; color: #333;">${device.ttl}</td>
            </tr>`;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>`;

    tableDiv.innerHTML = html;
}

function exportDevices(format) {
    const vlanFilter = document.getElementById('connectedDevicesVlanFilter')?.value || '';
    const statusFilter = document.getElementById('connectedDevicesStatusFilter')?.value || '';
    const searchTerm = (document.getElementById('connectedDevicesSearchInput')?.value || '').toLowerCase().trim();

    // Filter devices (same as table)
    let filteredDevices = allConnectedDevices.filter(device => {
        if (searchTerm) {
            const searchableText = `${device.hostname} ${device.ip} ${device.mac} ${device.interface}`.toLowerCase();
            if (!searchableText.includes(searchTerm)) return false;
        }
        if (vlanFilter && device.vlan !== vlanFilter) return false;
        if (statusFilter && device.status !== statusFilter) return false;
        return true;
    });

    if (format === 'csv') {
        exportDevicesCSV(filteredDevices);
    } else if (format === 'xml') {
        exportDevicesXML(filteredDevices);
    }
}

function exportDevicesCSV(devices) {
    const headers = ['Hostname', 'IP Address', 'MAC Address', 'VLAN', 'Security Zone', 'Interface', 'TTL (minutes)', 'Status'];
    let csv = headers.join(',') + '\n';

    devices.forEach(device => {
        const row = [
            device.hostname,
            device.ip,
            device.mac,
            device.vlan,
            device.zone || '-',
            device.interface,
            device.ttl,
            device.status
        ];
        csv += row.map(field => `"${field}"`).join(',') + '\n';
    });

    downloadFile(csv, 'connected-devices.csv', 'text/csv');
}

function exportDevicesXML(devices) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<connected-devices>\n';

    devices.forEach(device => {
        xml += '  <device>\n';
        xml += `    <hostname>${escapeXML(device.hostname)}</hostname>\n`;
        xml += `    <ip>${escapeXML(device.ip)}</ip>\n`;
        xml += `    <mac>${escapeXML(device.mac)}</mac>\n`;
        xml += `    <vlan>${escapeXML(device.vlan)}</vlan>\n`;
        xml += `    <zone>${escapeXML(device.zone || '-')}</zone>\n`;
        xml += `    <interface>${escapeXML(device.interface)}</interface>\n`;
        xml += `    <ttl>${escapeXML(device.ttl)}</ttl>\n`;
        xml += `    <status>${escapeXML(device.status)}</status>\n`;
        xml += '  </device>\n';
    });

    xml += '</connected-devices>';

    downloadFile(xml, 'connected-devices.xml', 'application/xml');
}

function escapeXML(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
