/**
 * pages-connected-devices.js - Connected Devices Page Module
 *
 * Handles Connected Devices page functionality including:
 * - Loading and displaying ARP table data
 * - Filtering by VLAN, status, and search
 * - Exporting to CSV and XML formats
 * - MAC vendor lookup integration
 */

// Connected Devices functionality
let allConnectedDevices = [];
let connectedDevicesMetadata = {};

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

    // Status filter
    const statusFilter = document.getElementById('connectedDevicesStatusFilter');
    if (statusFilter && !statusFilter.hasAttribute('data-listener')) {
        statusFilter.addEventListener('change', () => renderConnectedDevicesTable());
        statusFilter.setAttribute('data-listener', 'true');
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

    // Populate VLAN filter with unique VLANs
    populateVLANFilter();
}

function populateVLANFilter() {
    const vlanFilter = document.getElementById('connectedDevicesVlanFilter');
    if (!vlanFilter) return;

    // Get unique VLANs
    const vlans = new Set();
    allConnectedDevices.forEach(device => {
        if (device.vlan && device.vlan !== 'N/A') {
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

function renderConnectedDevicesTable() {
    const tableDiv = document.getElementById('connectedDevicesTable');
    const searchTerm = (document.getElementById('connectedDevicesSearchInput')?.value || '').toLowerCase().trim();
    const vlanFilter = document.getElementById('connectedDevicesVlanFilter')?.value || '';
    const statusFilter = document.getElementById('connectedDevicesStatusFilter')?.value || '';
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

        // Status filter
        if (statusFilter && device.status !== statusFilter) {
            return false;
        }

        return true;
    });

    // Apply limit (unless "All" is selected)
    const displayDevices = limit === -1 ? filteredDevices : filteredDevices.slice(0, limit);

    // Create table HTML
    let html = `
        <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="padding: 15px 20px; background: linear-gradient(135deg, #FA582D 0%, #FF7A55 100%); color: white; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="font-size: 1.1em;">Connected Devices</strong>
                    <span style="margin-left: 15px; opacity: 0.9;">Showing ${displayDevices.length} of ${filteredDevices.length} devices</span>
                </div>
                <div style="font-size: 0.9em; opacity: 0.9;">
                    Total: ${allConnectedDevices.length}
                </div>
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: 12px 15px; text-align: left; font-weight: 600; color: #333; white-space: nowrap;">Hostname</th>
                            <th style="padding: 12px 15px; text-align: left; font-weight: 600; color: #333; white-space: nowrap;">IP Address</th>
                            <th style="padding: 12px 15px; text-align: left; font-weight: 600; color: #333; white-space: nowrap;">MAC Address</th>
                            <th style="padding: 12px 15px; text-align: left; font-weight: 600; color: #333; white-space: nowrap;">VLAN</th>
                            <th style="padding: 12px 15px; text-align: left; font-weight: 600; color: #333; white-space: nowrap;">Interface</th>
                            <th style="padding: 12px 15px; text-align: left; font-weight: 600; color: #333; white-space: nowrap;">Age (TTL)</th>
                        </tr>
                    </thead>
                    <tbody>`;

    displayDevices.forEach((device, index) => {
        const rowStyle = index % 2 === 0 ? 'background: #ffffff;' : 'background: #f8f9fa;';

        // Format MAC address cell with vendor name underneath if available
        let macCell = `<div style="font-family: monospace; color: #333;">${device.mac}</div>`;
        if (device.vendor) {
            macCell += `<div style="font-size: 0.85em; color: #666; margin-top: 2px;">${device.vendor}</div>`;
        }

        html += `
            <tr style="${rowStyle} border-bottom: 1px solid #dee2e6;">
                <td style="padding: 12px 15px; color: #333;">${device.hostname}</td>
                <td style="padding: 12px 15px; color: #333; font-family: monospace;">${device.ip}</td>
                <td style="padding: 12px 15px;">${macCell}</td>
                <td style="padding: 12px 15px; color: #333;">${device.vlan}</td>
                <td style="padding: 12px 15px; color: #333; font-family: monospace;">${device.interface}</td>
                <td style="padding: 12px 15px; color: #333;">${device.ttl}s</td>
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
    const headers = ['Hostname', 'IP Address', 'MAC Address', 'VLAN', 'Interface', 'TTL', 'Status'];
    let csv = headers.join(',') + '\n';

    devices.forEach(device => {
        const row = [
            device.hostname,
            device.ip,
            device.mac,
            device.vlan,
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
