/**
 * pages.js - Page-Specific Functions Module
 *
 * Handles page-specific functionality including:
 * - Policies page (load, display, format)
 * - Software updates page
 * - Connected devices page
 * - Export functionality (CSV, XML)
 */

// Load policies data
async function loadPolicies() {
    try {
        const response = await fetch('/api/policies');
        const data = await response.json();

        if (data.status === 'success') {
            displayPolicies(data.policies);
        } else {
            showPoliciesError(data.message || 'Failed to load policies');
        }
    } catch (error) {
        console.error('Error loading policies:', error);
        showPoliciesError('Connection error: ' + error.message);
    }
}

// Display policies in a table
function displayPolicies(policies) {
    const container = document.getElementById('policiesTable');

    if (policies.length === 0) {
        container.innerHTML = '<div style="color: white; padding: 20px; text-align: center;">No policies found</div>';
        return;
    }

    let html = `
        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.15); border-top: 4px solid #ff6600;">
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #ff6600;">
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Policy Name</th>
                        <th style="padding: 12px; text-align: right; color: #333; font-weight: 600;">Hit Count</th>
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">First Hit</th>
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Latest Hit</th>
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Type</th>
                    </tr>
                </thead>
                <tbody>
    `;

    policies.forEach((policy, index) => {
        const bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
        const hitCountColor = policy.hit_count > 1000 ? '#ff6600' : '#333';

        // Show trend indicator if available
        let trendIcon = '';
        if (policy.trend) {
            if (policy.trend === 'up') {
                trendIcon = '<span style="color: #ff6600; margin-left: 5px;">▲</span>';
            } else if (policy.trend === 'down') {
                trendIcon = '<span style="color: #28a745; margin-left: 5px;">▼</span>';
            } else {
                trendIcon = '<span style="color: #999; margin-left: 5px;">━</span>';
            }
        }

        html += `
            <tr style="background: ${bgColor}; border-bottom: 1px solid #eee;">
                <td style="padding: 12px; color: #333; font-weight: 500;">${policy.name}</td>
                <td style="padding: 12px; text-align: right; color: ${hitCountColor}; font-weight: 600; font-size: 1.1em;">${policy.hit_count.toLocaleString()}${trendIcon}</td>
                <td style="padding: 12px; color: #666; font-size: 0.9em;">${formatTimestamp(policy.first_hit)}</td>
                <td style="padding: 12px; color: #666; font-size: 0.9em;">${formatTimestamp(policy.latest_hit)}</td>
                <td style="padding: 12px; color: #666;">${policy.type}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

function formatTimestamp(timestamp) {
    if (!timestamp || timestamp === 'Never' || timestamp === 'N/A') return 'N/A';
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
            return 'N/A';
        }
        return date.toLocaleString();
    } catch (e) {
        return 'N/A';
    }
}

function formatDaysAgo(timestamp) {
    if (!timestamp || timestamp === 'N/A') {
        return 'Never';
    }

    try {
        // Parse the timestamp - Palo Alto format is typically YYYY/MM/DD HH:MM:SS
        const dateStr = timestamp.replace(/\//g, '-');
        const date = new Date(dateStr);

        if (isNaN(date.getTime())) {
            return 'Never';
        }

        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor(diffMs / (1000 * 60));

        if (diffDays > 0) {
            return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
        } else if (diffHours > 0) {
            return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
        } else if (diffMinutes > 0) {
            return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
        } else {
            return 'Just now';
        }
    } catch (e) {
        return 'Never';
    }
}

function showPoliciesError(message) {
    const errorDiv = document.getElementById('policiesErrorMessage');
    errorDiv.textContent = `Error: ${message}`;
    errorDiv.style.display = 'block';

    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// Sort system logs based on criteria
function sortSystemLogs(logs, sortBy) {
    const severityOrder = {
        'critical': 4,
        'high': 3,
        'medium': 2,
        'low': 1,
        'informational': 0
    };

    return logs.sort((a, b) => {
        switch(sortBy) {
            case 'time':
                // Newest first
                return new Date(b.time) - new Date(a.time);

            case 'time-asc':
                // Oldest first
                return new Date(a.time) - new Date(b.time);

            case 'severity':
                // High to Low
                const severityA = severityOrder[a.severity.toLowerCase()] || 0;
                const severityB = severityOrder[b.severity.toLowerCase()] || 0;
                return severityB - severityA;

            case 'severity-asc':
                // Low to High
                const severityA2 = severityOrder[a.severity.toLowerCase()] || 0;
                const severityB2 = severityOrder[b.severity.toLowerCase()] || 0;
                return severityA2 - severityB2;

            case 'module':
                // Module A-Z
                return (a.module || '').localeCompare(b.module || '');

            case 'eventid':
                // Event ID numeric
                return (a.eventid || '').localeCompare(b.eventid || '');

            default:
                return 0;
        }
    });
}

// Load system logs data
// Load software updates data
async function loadSoftwareUpdates() {
    const loadingDiv = document.getElementById('softwareLoading');
    const tableDiv = document.getElementById('softwareTable');
    const errorDiv = document.getElementById('softwareErrorMessage');

    // Show loading animation
    loadingDiv.style.display = 'block';
    tableDiv.style.display = 'none';
    errorDiv.style.display = 'none';

    try {
        const response = await fetch('/api/software-updates');
        const data = await response.json();

        // Hide loading animation
        loadingDiv.style.display = 'none';
        tableDiv.style.display = 'block';

        if (data.status === 'success' && data.software.length > 0) {
            errorDiv.style.display = 'none';

            // Create table HTML
            let tableHtml = `
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: linear-gradient(135deg, #ff6600 0%, #ff9933 100%); color: white;">
                            <th style="padding: 15px; text-align: left; font-size: 1.1em;">Component</th>
                            <th style="padding: 15px; text-align: left; font-size: 1.1em;">Version</th>
                            <th style="padding: 15px; text-align: center; font-size: 1.1em;">Downloaded</th>
                            <th style="padding: 15px; text-align: center; font-size: 1.1em;">Current</th>
                            <th style="padding: 15px; text-align: center; font-size: 1.1em;">Latest</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            // Add rows for each software component
            data.software.forEach((item, index) => {
                const bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
                tableHtml += `
                    <tr style="background: ${bgColor}; border-bottom: 1px solid #e0e0e0;">
                        <td style="padding: 15px; font-weight: 600; color: #333;">${item.name}</td>
                        <td style="padding: 15px; color: #666; font-family: monospace;">${item.version}</td>
                        <td style="padding: 15px; text-align: center; color: ${item.downloaded === 'yes' ? '#28a745' : '#999'}; font-weight: 600;">${item.downloaded}</td>
                        <td style="padding: 15px; text-align: center; color: ${item.current === 'yes' ? '#28a745' : '#999'}; font-weight: 600;">${item.current}</td>
                        <td style="padding: 15px; text-align: center; color: ${item.latest === 'yes' ? '#28a745' : '#999'}; font-weight: 600;">${item.latest}</td>
                    </tr>
                `;
            });

            tableHtml += `
                    </tbody>
                </table>
                <div style="margin-top: 15px; padding: 10px; background: #f0f0f0; border-radius: 8px; color: #666; font-size: 0.9em;">
                    Last updated: ${new Date(data.timestamp).toLocaleString()}
                </div>
            `;

            tableDiv.innerHTML = tableHtml;
        } else {
            errorDiv.textContent = data.message || 'No software version information available';
            errorDiv.style.display = 'block';
            tableDiv.innerHTML = '';
        }
    } catch (error) {
        console.error('Error loading software updates:', error);
        loadingDiv.style.display = 'none';
        tableDiv.style.display = 'none';
        errorDiv.textContent = 'Failed to load software updates: ' + error.message;
        errorDiv.style.display = 'block';
    }
}

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

// ============================================================================
// Applications Page Functions
// ============================================================================

let allApplications = [];
let applicationsSortBy = 'bytes'; // Default sort by volume
let applicationsSortDesc = true;
let categoryChart = null;

async function loadApplications() {
    console.log('=== loadApplications called ===');
    try {
        const response = await fetch('/api/applications?max_logs=1000');
        const data = await response.json();

        console.log('Applications API response:', data);

        if (data.status === 'success') {
            allApplications = data.applications || [];

            // Update summary statistics tiles
            const summary = data.summary || {};
            document.getElementById('appStatTotalApps').textContent = summary.total_applications || 0;
            document.getElementById('appStatTotalSessions').textContent = (summary.total_sessions || 0).toLocaleString();
            document.getElementById('appStatTotalVolume').textContent = formatBytesHuman(summary.total_bytes || 0);
            document.getElementById('appStatVlans').textContent = summary.vlans_detected || 0;

            // Populate filter dropdowns
            populateApplicationFilters();

            // Render Traffic by Category chart
            renderCategoryChart();

            renderApplicationsTable();
            document.getElementById('applicationsCount').textContent = `Total: ${allApplications.length} applications`;
        } else {
            showApplicationsError(data.message || 'Failed to load applications');
        }
    } catch (error) {
        console.error('Error loading applications:', error);
        showApplicationsError('Connection error: ' + error.message);
    }
}

function populateApplicationFilters() {
    // Get unique VLANs and Categories
    const vlans = new Set();
    const categories = new Set();

    allApplications.forEach(app => {
        if (app.vlans && app.vlans.length > 0) {
            app.vlans.forEach(vlan => vlans.add(vlan));
        }
        if (app.category) {
            categories.add(app.category);
        }
    });

    // Populate VLAN filter
    const vlanFilter = document.getElementById('applicationsVlanFilter');
    const currentVlan = vlanFilter.value;
    vlanFilter.innerHTML = '<option value="">All VLANs</option>';
    Array.from(vlans).sort().forEach(vlan => {
        const option = document.createElement('option');
        option.value = vlan;
        option.textContent = vlan;
        vlanFilter.appendChild(option);
    });
    vlanFilter.value = currentVlan;

    // Populate Category filter
    const categoryFilter = document.getElementById('applicationsCategoryFilter');
    const currentCategory = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    Array.from(categories).sort().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });
    categoryFilter.value = currentCategory;
}

function renderCategoryChart() {
    // Aggregate traffic by category
    const categoryData = {};
    allApplications.forEach(app => {
        const category = app.category || 'unknown';
        if (!categoryData[category]) {
            categoryData[category] = 0;
        }
        categoryData[category] += app.bytes;
    });

    // Convert to sorted array (top 10 categories by volume)
    const sortedCategories = Object.entries(categoryData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const labels = sortedCategories.map(([category]) => category);
    const dataValues = sortedCategories.map(([, bytes]) => bytes / (1024 * 1024)); // Convert to MB

    // Destroy previous chart if it exists
    if (categoryChart) {
        categoryChart.destroy();
    }

    // Create chart
    const ctx = document.getElementById('trafficByCategoryChart');
    categoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Traffic Volume (MB)',
                data: dataValues,
                backgroundColor: 'rgba(250, 88, 45, 0.8)',
                borderColor: '#FA582D',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal bar chart
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatBytesHuman(context.raw * 1024 * 1024);
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(0) + ' MB';
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                y: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function sortApplications(field) {
    // Toggle sort direction if clicking the same field
    if (applicationsSortBy === field) {
        applicationsSortDesc = !applicationsSortDesc;
    } else {
        applicationsSortBy = field;
        applicationsSortDesc = true; // Default to descending for new field
    }
    renderApplicationsTable();
}

function renderApplicationsTable() {
    const container = document.getElementById('applicationsTable');
    const searchTerm = document.getElementById('applicationsSearchInput').value.toLowerCase();
    const limit = parseInt(document.getElementById('applicationsLimit').value);
    const vlanFilter = document.getElementById('applicationsVlanFilter').value;
    const categoryFilter = document.getElementById('applicationsCategoryFilter').value;

    // Filter applications
    let filtered = allApplications.filter(app => {
        // Search filter
        if (searchTerm && !app.name.toLowerCase().includes(searchTerm)) {
            return false;
        }

        // VLAN filter
        if (vlanFilter && (!app.vlans || !app.vlans.includes(vlanFilter))) {
            return false;
        }

        // Category filter
        if (categoryFilter && app.category !== categoryFilter) {
            return false;
        }

        return true;
    });

    // Apply sorting
    filtered.sort((a, b) => {
        let aVal = a[applicationsSortBy];
        let bVal = b[applicationsSortBy];

        // For string fields, use locale compare
        if (typeof aVal === 'string') {
            return applicationsSortDesc ?
                bVal.localeCompare(aVal) :
                aVal.localeCompare(bVal);
        }

        // For numeric fields
        return applicationsSortDesc ? bVal - aVal : aVal - bVal;
    });

    // Apply limit
    const displayed = limit === -1 ? filtered : filtered.slice(0, limit);

    if (displayed.length === 0) {
        container.innerHTML = `
            <div style="background: white; border-radius: 12px; padding: 40px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <p style="color: #999; font-size: 1.1em;">No applications found</p>
            </div>
        `;
        return;
    }

    const getSortIndicator = (field) => {
        if (applicationsSortBy === field) {
            return applicationsSortDesc ? ' ▼' : ' ▲';
        }
        return '';
    };

    let html = `
        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-top: 3px solid #FA582D; overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; min-width: 1400px;">
                <thead>
                    <tr style="border-bottom: 2px solid #FA582D;">
                        <th onclick="sortApplications('name')" style="padding: 10px; text-align: left; color: #333; font-weight: 600; cursor: pointer; user-select: none; font-size: 0.85em;">
                            Application${getSortIndicator('name')}
                        </th>
                        <th onclick="sortApplications('category')" style="padding: 10px; text-align: left; color: #333; font-weight: 600; cursor: pointer; user-select: none; font-size: 0.85em;">
                            Category${getSortIndicator('category')}
                        </th>
                        <th onclick="sortApplications('sessions')" style="padding: 10px; text-align: right; color: #333; font-weight: 600; cursor: pointer; user-select: none; font-size: 0.85em;">
                            Sessions${getSortIndicator('sessions')}
                        </th>
                        <th onclick="sortApplications('bytes_sent')" style="padding: 10px; text-align: right; color: #333; font-weight: 600; cursor: pointer; user-select: none; font-size: 0.85em;">
                            Bytes Sent${getSortIndicator('bytes_sent')}
                        </th>
                        <th onclick="sortApplications('bytes_received')" style="padding: 10px; text-align: right; color: #333; font-weight: 600; cursor: pointer; user-select: none; font-size: 0.85em;">
                            Bytes Received${getSortIndicator('bytes_received')}
                        </th>
                        <th onclick="sortApplications('bytes')" style="padding: 10px; text-align: right; color: #FA582D; font-weight: 600; cursor: pointer; user-select: none; font-size: 0.85em;">
                            Total Volume${getSortIndicator('bytes')}
                        </th>
                        <th onclick="sortApplications('source_count')" style="padding: 10px; text-align: right; color: #333; font-weight: 600; cursor: pointer; user-select: none; font-size: 0.85em;">
                            Sources${getSortIndicator('source_count')}
                        </th>
                        <th onclick="sortApplications('dest_count')" style="padding: 10px; text-align: right; color: #333; font-weight: 600; cursor: pointer; user-select: none; font-size: 0.85em;">
                            Destinations${getSortIndicator('dest_count')}
                        </th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600; font-size: 0.85em;">Protocols</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600; font-size: 0.85em;">Top Ports</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600; font-size: 0.85em;">VLANs</th>
                    </tr>
                </thead>
                <tbody>
    `;

    displayed.forEach((app, index) => {
        const totalVolume = formatBytesHuman(app.bytes);
        const bytesSent = formatBytesHuman(app.bytes_sent || 0);
        const bytesReceived = formatBytesHuman(app.bytes_received || 0);
        const protocols = app.protocols.slice(0, 3).join(', ') || 'N/A';
        const ports = app.ports.slice(0, 5).join(', ') || 'N/A';
        const vlans = (app.vlans || []).join(', ') || 'N/A';
        const category = app.category || 'unknown';

        // Category badge colors
        const categoryColors = {
            'networking': '#3498db',
            'general-internet': '#2ecc71',
            'business-systems': '#9b59b6',
            'cloud-services': '#e74c3c',
            'other': '#FA582D',
            'unknown': '#95a5a6'
        };
        const categoryColor = categoryColors[category.toLowerCase()] || categoryColors['other'];

        html += `
            <tr style="border-bottom: 1px solid #eee; transition: background 0.2s;" onmouseover="this.style.background='#f9f9f9'" onmouseout="this.style.background='white'">
                <td onclick="showAppDetails(${index})" style="padding: 10px; color: #FA582D; font-weight: 600; font-size: 0.9em; cursor: pointer; text-decoration: underline; transition: color 0.2s;" onmouseover="this.style.color='#C64620'" onmouseout="this.style.color='#FA582D'">${app.name}</td>
                <td onclick="showAppDestinations(${index})" style="padding: 10px; cursor: pointer;">
                    <span style="background: ${categoryColor}; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.8em; font-weight: 600; display: inline-block; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        ${category}
                    </span>
                </td>
                <td style="padding: 10px; color: #666; text-align: right; font-size: 0.9em;">${app.sessions.toLocaleString()}</td>
                <td style="padding: 10px; color: #666; text-align: right; font-size: 0.9em;">${bytesSent}</td>
                <td style="padding: 10px; color: #666; text-align: right; font-size: 0.9em;">${bytesReceived}</td>
                <td style="padding: 10px; color: #FA582D; text-align: right; font-weight: 600; font-size: 0.9em;">${totalVolume}</td>
                <td style="padding: 10px; color: #666; text-align: right; font-size: 0.9em;">${app.source_count}</td>
                <td style="padding: 10px; color: #666; text-align: right; font-size: 0.9em;">${app.dest_count}</td>
                <td style="padding: 10px; color: #666; font-size: 0.85em;">${protocols}</td>
                <td style="padding: 10px; color: #666; font-size: 0.85em; font-family: monospace;">${ports}</td>
                <td style="padding: 10px; color: #666; font-size: 0.85em;">${vlans}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

function formatBytesHuman(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showApplicationsError(message) {
    const errorDiv = document.getElementById('applicationsErrorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

function exportApplicationsCSV() {
    // Get filtered applications (same logic as table rendering)
    const searchTerm = document.getElementById('applicationsSearchInput').value.toLowerCase();
    const vlanFilter = document.getElementById('applicationsVlanFilter').value;
    const categoryFilter = document.getElementById('applicationsCategoryFilter').value;

    let filtered = allApplications.filter(app => {
        if (searchTerm && !app.name.toLowerCase().includes(searchTerm)) return false;
        if (vlanFilter && (!app.vlans || !app.vlans.includes(vlanFilter))) return false;
        if (categoryFilter && app.category !== categoryFilter) return false;
        return true;
    });

    // CSV Headers
    const headers = ['Application', 'Category', 'Sessions', 'Bytes Sent', 'Bytes Received', 'Total Volume', 'Sources', 'Destinations', 'Protocols', 'Top Ports', 'VLANs'];
    let csv = headers.join(',') + '\n';

    // CSV Rows
    filtered.forEach(app => {
        const row = [
            `"${app.name}"`,
            `"${app.category || 'unknown'}"`,
            app.sessions,
            app.bytes_sent || 0,
            app.bytes_received || 0,
            app.bytes,
            app.source_count,
            app.dest_count,
            `"${(app.protocols || []).join(', ')}"`,
            `"${(app.ports || []).slice(0, 5).join(', ')}"`,
            `"${(app.vlans || []).join(', ')}"`
        ];
        csv += row.join(',') + '\n';
    });

    // Download file
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `applications-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportApplicationsJSON() {
    // Get filtered applications (same logic as table rendering)
    const searchTerm = document.getElementById('applicationsSearchInput').value.toLowerCase();
    const vlanFilter = document.getElementById('applicationsVlanFilter').value;
    const categoryFilter = document.getElementById('applicationsCategoryFilter').value;

    let filtered = allApplications.filter(app => {
        if (searchTerm && !app.name.toLowerCase().includes(searchTerm)) return false;
        if (vlanFilter && (!app.vlans || !app.vlans.includes(vlanFilter))) return false;
        if (categoryFilter && app.category !== categoryFilter) return false;
        return true;
    });

    // Create JSON export data
    const exportData = {
        export_date: new Date().toISOString(),
        total_applications: filtered.length,
        applications: filtered.map(app => ({
            name: app.name,
            category: app.category || 'unknown',
            sessions: app.sessions,
            bytes_sent: app.bytes_sent || 0,
            bytes_received: app.bytes_received || 0,
            total_bytes: app.bytes,
            source_count: app.source_count,
            dest_count: app.dest_count,
            protocols: app.protocols || [],
            top_ports: (app.ports || []).slice(0, 10),
            vlans: app.vlans || []
        }))
    };

    // Download file
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `applications-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Event listeners for Applications page
function setupApplicationsEventListeners() {
    const searchInput = document.getElementById('applicationsSearchInput');
    const limitSelect = document.getElementById('applicationsLimit');
    const vlanFilter = document.getElementById('applicationsVlanFilter');
    const categoryFilter = document.getElementById('applicationsCategoryFilter');
    const refreshBtn = document.getElementById('refreshApplicationsBtn');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderApplicationsTable();
        });
    }

    if (limitSelect) {
        limitSelect.addEventListener('change', () => {
            renderApplicationsTable();
        });
    }

    if (vlanFilter) {
        vlanFilter.addEventListener('change', () => {
            renderApplicationsTable();
        });
    }

    if (categoryFilter) {
        categoryFilter.addEventListener('change', () => {
            renderApplicationsTable();
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadApplications();
        });
    }

    // Export buttons
    const exportCSVBtn = document.getElementById('exportAppsCSVBtn');
    const exportJSONBtn = document.getElementById('exportAppsJSONBtn');

    if (exportCSVBtn) {
        exportCSVBtn.addEventListener('click', exportApplicationsCSV);
    }

    if (exportJSONBtn) {
        exportJSONBtn.addEventListener('click', exportApplicationsJSON);
    }

    // Destinations modal close button
    const closeDestModalBtn = document.getElementById('closeAppDestModalBtn');
    if (closeDestModalBtn) {
        closeDestModalBtn.addEventListener('click', hideAppDestinations);
    }

    // Application details modal close button
    const closeAppDetailsBtn = document.getElementById('closeAppDetailsModalBtn');
    if (closeAppDetailsBtn) {
        closeAppDetailsBtn.addEventListener('click', hideAppDetails);
    }

    // Close modals when clicking outside
    const destModal = document.getElementById('appDestinationsModal');
    if (destModal) {
        destModal.addEventListener('click', (e) => {
            if (e.target === destModal) {
                hideAppDestinations();
            }
        });
    }

    const detailsModal = document.getElementById('appDetailsModal');
    if (detailsModal) {
        detailsModal.addEventListener('click', (e) => {
            if (e.target === detailsModal) {
                hideAppDetails();
            }
        });
    }
}

function showAppDestinations(appIndex) {
    const searchTerm = document.getElementById('applicationsSearchInput').value.toLowerCase();
    const limit = parseInt(document.getElementById('applicationsLimit').value);

    // Get the filtered and sorted list
    let filtered = allApplications.filter(app =>
        app.name.toLowerCase().includes(searchTerm)
    );

    filtered.sort((a, b) => {
        let aVal = a[applicationsSortBy];
        let bVal = b[applicationsSortBy];
        if (typeof aVal === 'string') {
            return applicationsSortDesc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
        }
        return applicationsSortDesc ? bVal - aVal : aVal - bVal;
    });

    const displayed = limit === -1 ? filtered : filtered.slice(0, limit);
    const app = displayed[appIndex];

    if (!app) {
        console.error('Application not found at index:', appIndex);
        return;
    }

    // Populate modal with app data
    document.getElementById('appDestApp').textContent = app.name;
    document.getElementById('appDestCount').textContent = app.dest_count;
    document.getElementById('appDestVolume').textContent = formatBytesHuman(app.bytes);
    document.getElementById('appDestModalSubtitle').textContent = `Category: ${app.category}`;

    // Populate destinations list
    const destinationsList = document.getElementById('appDestinationsList');
    if (app.destinations && app.destinations.length > 0) {
        let destHtml = '';
        app.destinations.forEach(dest => {
            const protocol = dest.port === '443' ? 'https' : (dest.port === '80' ? 'http' : '');
            const portDisplay = dest.port ? `:${dest.port}` : '';
            destHtml += `
                <div style="background: white; border: 1px solid #ddd; border-left: 3px solid #4a9eff; border-radius: 4px; padding: 10px;">
                    <div style="font-family: monospace; color: #4a9eff; font-weight: 600; margin-bottom: 3px;">${dest.ip}</div>
                    <div style="font-size: 0.85em; color: #666;">Port: ${dest.port || 'N/A'} ${protocol ? `(${protocol})` : ''}</div>
                </div>
            `;
        });
        destinationsList.innerHTML = destHtml;

        // Update note
        const totalDests = app.dest_count;
        const showingDests = app.destinations.length;
        document.getElementById('appDestNote').textContent =
            showingDests < totalDests ?
            `Showing top ${showingDests} of ${totalDests} total destinations` :
            `Showing all ${totalDests} destinations`;
    } else {
        destinationsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No destination data available</div>';
        document.getElementById('appDestNote').textContent = 'No destinations found';
    }

    // Show modal
    const modal = document.getElementById('appDestinationsModal');
    modal.style.display = 'flex';
}

function hideAppDestinations() {
    const modal = document.getElementById('appDestinationsModal');
    modal.style.display = 'none';
}

function showAppDetails(appIndex) {
    const searchTerm = document.getElementById('applicationsSearchInput').value.toLowerCase();
    const vlanFilter = document.getElementById('applicationsVlanFilter').value;
    const categoryFilter = document.getElementById('applicationsCategoryFilter').value;
    const limit = parseInt(document.getElementById('applicationsLimit').value);

    // Get the filtered and sorted list (same logic as table rendering)
    let filtered = allApplications.filter(app => {
        if (searchTerm && !app.name.toLowerCase().includes(searchTerm)) return false;
        if (vlanFilter && (!app.vlans || !app.vlans.includes(vlanFilter))) return false;
        if (categoryFilter && app.category !== categoryFilter) return false;
        return true;
    });

    filtered.sort((a, b) => {
        let aVal = a[applicationsSortBy];
        let bVal = b[applicationsSortBy];
        if (typeof aVal === 'string') {
            return applicationsSortDesc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
        }
        return applicationsSortDesc ? bVal - aVal : aVal - bVal;
    });

    const displayed = limit === -1 ? filtered : filtered.slice(0, limit);
    const app = displayed[appIndex];

    if (!app) {
        console.error('Application not found at index:', appIndex);
        return;
    }

    // Populate modal header
    document.getElementById('appDetailsName').textContent = app.name;
    document.getElementById('appDetailsCategory').textContent = app.category || 'unknown';

    // Populate summary stats
    document.getElementById('appDetailsSessions').textContent = app.sessions.toLocaleString();
    document.getElementById('appDetailsVolume').textContent = formatBytesHuman(app.bytes);
    document.getElementById('appDetailsSourceIPs').textContent = app.source_count;
    document.getElementById('appDetailsDestinations').textContent = app.dest_count;

    // Populate source IP addresses
    const sourceList = document.getElementById('appDetailsSourceList');
    if (app.source_ips && app.source_ips.length > 0) {
        let sourceHtml = '';
        app.source_ips.forEach(ip => {
            sourceHtml += `
                <div style="background: white; border: 2px solid #FA582D; border-radius: 6px; padding: 8px 12px; font-family: monospace; color: #333; font-size: 0.9em; font-weight: 500;">
                    ${ip}
                </div>
            `;
        });
        sourceList.innerHTML = sourceHtml;
    } else {
        sourceList.innerHTML = '<div style="padding: 10px; color: #999;">-</div>';
    }

    // Populate protocols
    const protocolsDiv = document.getElementById('appDetailsProtocols');
    if (app.protocols && app.protocols.length > 0) {
        protocolsDiv.textContent = app.protocols.join(', ');
    } else {
        protocolsDiv.textContent = '-';
    }

    // Populate top ports
    const topPortsDiv = document.getElementById('appDetailsTopPorts');
    if (app.ports && app.ports.length > 0) {
        // Format ports with protocol hints
        const portLabels = app.ports.map(port => {
            if (port === '443') return '443 (https)';
            if (port === '80') return '80 (http)';
            if (port === '22') return '22 (ssh)';
            if (port === '3389') return '3389 (rdp)';
            return port;
        });
        topPortsDiv.textContent = portLabels.join(', ');
    } else {
        topPortsDiv.textContent = '-';
    }

    // Populate VLANs
    const vlansDiv = document.getElementById('appDetailsVLANs');
    if (app.vlans && app.vlans.length > 0) {
        vlansDiv.textContent = app.vlans.join(', ');
    } else {
        vlansDiv.textContent = '-';
    }

    // Show modal
    const modal = document.getElementById('appDetailsModal');
    modal.style.display = 'flex';
}

function hideAppDetails() {
    const modal = document.getElementById('appDetailsModal');
    modal.style.display = 'none';
}

