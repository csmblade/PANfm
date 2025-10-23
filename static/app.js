// Configuration (will be loaded from settings)
let UPDATE_INTERVAL = 5000; // Update every 5 seconds (default)
let MATCH_COUNT = 5; // Number of matches to display (default)
let TOP_APPS_COUNT = 5; // Number of top apps to display (default)
const MAX_DATA_POINTS = 30; // Show last 30 data points
const MAX_MINI_POINTS = 20; // Mini charts show last 20 points

let updateIntervalId = null; // Store interval ID for updates

// Data storage
let chartData = {
    labels: [],
    inbound: [],
    outbound: [],
    total: []
};

let miniChartData = {
    sessions: [],
    tcp: [],
    udp: [],
    pps: []
};

// Historical data for trend calculation (last 5 minutes worth of data)
let historicalData = {
    inbound: [],
    outbound: [],
    total: [],
    sessions: [],
    tcp: [],
    udp: [],
    icmp: [],
    criticalThreats: [],
    mediumThreats: [],
    blockedUrls: [],
    urlFiltering: [],
    interfaceErrors: []
};

// Storage for modal data
let currentCriticalLogs = [];
let currentMediumLogs = [];
let currentBlockedUrlLogs = [];
let currentTopApps = [];

// Mini chart instances
let sessionChart = null;
let tcpChart = null;
let udpChart = null;
let ppsChart = null;

// Initialize Chart.js
const ctx = document.getElementById('throughputChart').getContext('2d');
const chart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: chartData.labels,
        datasets: [
            {
                label: 'Inbound',
                data: chartData.inbound,
                borderColor: '#ff6600',
                backgroundColor: 'rgba(255, 102, 0, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6
            },
            {
                label: 'Outbound',
                data: chartData.outbound,
                borderColor: '#ff9933',
                backgroundColor: 'rgba(255, 153, 51, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6
            },
            {
                label: 'Total',
                data: chartData.total,
                borderColor: '#333333',
                backgroundColor: 'rgba(51, 51, 51, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                titleFont: {
                    size: 14
                },
                bodyFont: {
                    size: 13
                },
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        label += context.parsed.y.toFixed(2) + ' MB';
                        return label;
                    }
                }
            }
        },
        scales: {
            x: {
                display: true,
                grid: {
                    display: false
                },
                ticks: {
                    font: {
                        size: 10
                    },
                    maxRotation: 0,
                    minRotation: 0,
                    maxTicksLimit: 10,
                    autoSkip: true,
                    autoSkipPadding: 10
                }
            },
            y: {
                display: true,
                beginAtZero: true,
                grid: {
                    color: 'rgba(0, 0, 0, 0.05)'
                },
                ticks: {
                    font: {
                        size: 12
                    },
                    callback: function(value) {
                        return value.toFixed(1) + ' Mbps';
                    }
                }
            }
        },
        animation: {
            duration: 750,
            easing: 'easeInOutQuart'
        }
    }
});

// Calculate trend from historical data
function calculateTrend(dataArray) {
    if (dataArray.length < 2) return ''; // Not enough data

    // Get first half and second half averages
    const halfPoint = Math.floor(dataArray.length / 2);
    const firstHalf = dataArray.slice(0, halfPoint);
    const secondHalf = dataArray.slice(halfPoint);

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const percentChange = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (percentChange > 5) {
        return '<span style="color: #ffffff; font-size: 0.8em; margin-left: 5px; opacity: 0.8;">▲</span>';
    } else if (percentChange < -5) {
        return '<span style="color: #ffffff; font-size: 0.8em; margin-left: 5px; opacity: 0.8;">▼</span>';
    } else {
        return '<span style="color: #ffffff; font-size: 0.8em; margin-left: 5px; opacity: 0.8;">━</span>';
    }
}

// Update the chart with new data
function updateChart(data) {
    const timestamp = new Date(data.timestamp);
    const timeLabel = timestamp.toLocaleTimeString();

    // Add new data (backend already returns Mbps rates)
    chartData.labels.push(timeLabel);
    chartData.inbound.push(data.inbound_mbps);
    chartData.outbound.push(data.outbound_mbps);
    chartData.total.push(data.total_mbps);

    // Keep only the last MAX_DATA_POINTS
    if (chartData.labels.length > MAX_DATA_POINTS) {
        chartData.labels.shift();
        chartData.inbound.shift();
        chartData.outbound.shift();
        chartData.total.shift();
    }

    // Update chart datasets directly
    chart.data.labels = chartData.labels.slice();
    chart.data.datasets[0].data = chartData.inbound.slice();
    chart.data.datasets[1].data = chartData.outbound.slice();
    chart.data.datasets[2].data = chartData.total.slice();

    // Update chart
    chart.update('none'); // No animation for smoother updates
}

// Update stat cards
function updateStats(data) {
    // Store historical data for trends (keep last 60 data points = 5 minutes at 5 second intervals)
    historicalData.inbound.push(data.inbound_mbps);
    historicalData.outbound.push(data.outbound_mbps);
    historicalData.total.push(data.total_mbps);
    if (historicalData.inbound.length > 60) {
        historicalData.inbound.shift();
        historicalData.outbound.shift();
        historicalData.total.shift();
    }

    document.getElementById('inboundValue').innerHTML = data.inbound_mbps.toLocaleString() + calculateTrend(historicalData.inbound);
    document.getElementById('outboundValue').innerHTML = data.outbound_mbps.toLocaleString() + calculateTrend(historicalData.outbound);
    document.getElementById('totalValue').innerHTML = data.total_mbps.toLocaleString() + calculateTrend(historicalData.total);

    // Update session counts and mini chart
    if (data.sessions) {
        // Store historical data
        historicalData.sessions.push(data.sessions.active);
        historicalData.tcp.push(data.sessions.tcp);
        historicalData.udp.push(data.sessions.udp);
        historicalData.icmp.push(data.sessions.icmp);
        if (historicalData.sessions.length > 60) {
            historicalData.sessions.shift();
            historicalData.tcp.shift();
            historicalData.udp.shift();
            historicalData.icmp.shift();
        }

        document.getElementById('sessionValue').innerHTML = data.sessions.active.toLocaleString() + calculateTrend(historicalData.sessions);
        document.getElementById('tcpValue').innerHTML = data.sessions.tcp.toLocaleString() + calculateTrend(historicalData.tcp);
        document.getElementById('udpValue').innerHTML = data.sessions.udp.toLocaleString() + calculateTrend(historicalData.udp);
        document.getElementById('icmpValue').innerHTML = data.sessions.icmp.toLocaleString() + calculateTrend(historicalData.icmp);

        miniChartData.sessions.push(data.sessions.active);
        if (miniChartData.sessions.length > MAX_MINI_POINTS) {
            miniChartData.sessions.shift();
        }
        updateMiniChart(sessionChart, miniChartData.sessions, '#ff6600');

        miniChartData.tcp.push(data.sessions.tcp);
        if (miniChartData.tcp.length > MAX_MINI_POINTS) {
            miniChartData.tcp.shift();
        }
        updateMiniChart(tcpChart, miniChartData.tcp, '#3b82f6');

        miniChartData.udp.push(data.sessions.udp);
        if (miniChartData.udp.length > MAX_MINI_POINTS) {
            miniChartData.udp.shift();
        }
        updateMiniChart(udpChart, miniChartData.udp, '#8b5cf6');
    }

    // Update CPU metrics and mini charts
    if (data.cpu) {
        // Store historical data
        // Update uptime display in sidebar
        const sidebarUptimeElement = document.getElementById('sidebarUptime');
        if (data.cpu.uptime && sidebarUptimeElement) {
            sidebarUptimeElement.textContent = data.cpu.uptime;
        }

        // Update PPS display in Network Traffic tile
        const totalPpsElement = document.getElementById('totalPps');
        const inboundPpsElement = document.getElementById('inboundPps');
        const outboundPpsElement = document.getElementById('outboundPps');

        if (data.total_pps !== undefined && totalPpsElement) {
            totalPpsElement.textContent = data.total_pps.toLocaleString();
        }
        if (data.inbound_pps !== undefined && inboundPpsElement) {
            inboundPpsElement.textContent = data.inbound_pps.toLocaleString();
        }
        if (data.outbound_pps !== undefined && outboundPpsElement) {
            outboundPpsElement.textContent = data.outbound_pps.toLocaleString();
        }

        // Update PPS mini chart
        if (data.total_pps !== undefined) {
            miniChartData.pps.push(data.total_pps);
            if (miniChartData.pps.length > MAX_MINI_POINTS) {
                miniChartData.pps.shift();
            }
            updateMiniChart(ppsChart, miniChartData.pps, '#ffffff');
        }

    }

    // Update PAN-OS version in sidebar
    if (data.panos_version !== undefined) {
        const versionElement = document.getElementById('sidebarPanosVersion');
        const alertElement = document.getElementById('sidebarVersionAlert');
        const latestVersionElement = document.getElementById('sidebarLatestVersion');

        if (versionElement) {
            versionElement.textContent = data.panos_version || 'N/A';
        }

        if (alertElement) {
            if (data.version_update_available) {
                alertElement.style.display = 'block';
                // Update the version text if available
                if (latestVersionElement && data.latest_panos_version) {
                    latestVersionElement.textContent = data.latest_panos_version;
                }
            } else {
                alertElement.style.display = 'none';
            }
        }
    }

    // Update interface stats
    if (data.interfaces) {
        const interfaceErrorsElement = document.getElementById('interfaceErrorsValue');
        const interfaceDetailsElement = document.getElementById('interfaceDetails');

        if (interfaceErrorsElement) {
            const totalIssues = data.interfaces.total_errors + data.interfaces.total_drops;

            // Store historical data
            historicalData.interfaceErrors.push(totalIssues);
            if (historicalData.interfaceErrors.length > 60) {
                historicalData.interfaceErrors.shift();
            }

            interfaceErrorsElement.innerHTML = totalIssues.toLocaleString() + calculateTrend(historicalData.interfaceErrors);

            if (interfaceDetailsElement) {
                interfaceDetailsElement.textContent = `${data.interfaces.total_errors.toLocaleString()} errors, ${data.interfaces.total_drops.toLocaleString()} drops`;
            }
        }
    }

    // Update top applications
    if (data.top_applications) {
        const topAppsValueElement = document.getElementById('topAppsValue');
        const topAppsContainer = document.getElementById('topAppsContainer');
        const topAppNameElement = document.getElementById('topAppName');

        // Store for modals
        currentTopApps = data.top_applications.apps || [];

        // Update total count
        if (topAppsValueElement) {
            topAppsValueElement.textContent = data.top_applications.total_count || 0;
        }

        // Update top application name
        if (topAppNameElement) {
            if (data.top_applications.apps && data.top_applications.apps.length > 0) {
                topAppNameElement.textContent = data.top_applications.apps[0].name;
            } else {
                topAppNameElement.textContent = 'N/A';
            }
        }

        // Update the list of apps
        if (topAppsContainer && data.top_applications.apps && data.top_applications.apps.length > 0) {
            let appsHtml = '';
            data.top_applications.apps.forEach((app) => {
                const barWidth = data.top_applications.apps[0].count > 0 ? (app.count / data.top_applications.apps[0].count * 100) : 0;
                appsHtml += `
                    <div style="margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="color: #ffffff; font-size: 0.85em;">${app.name}</span>
                            <span style="color: #ffcc99; font-size: 0.85em; font-weight: 600;">${app.count}</span>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); border-radius: 4px; height: 6px; overflow: hidden;">
                            <div style="background: #ffffff; height: 100%; width: ${barWidth}%; transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                `;
            });
            topAppsContainer.innerHTML = appsHtml;
        } else if (topAppsContainer) {
            topAppsContainer.innerHTML = '<div style="color: rgba(255,255,255,0.7); font-size: 0.85em; text-align: center;">No data</div>';
        }
    }

    // Update threat statistics and logs
    if (data.threats) {
        // Store historical data
        historicalData.criticalThreats.push(data.threats.critical_threats);
        historicalData.mediumThreats.push(data.threats.medium_threats);
        historicalData.blockedUrls.push(data.threats.blocked_urls);
        historicalData.urlFiltering.push(data.threats.url_filtering_total);
        if (historicalData.criticalThreats.length > 60) {
            historicalData.criticalThreats.shift();
            historicalData.mediumThreats.shift();
            historicalData.blockedUrls.shift();
            historicalData.urlFiltering.shift();
        }

        document.getElementById('criticalValue').innerHTML = data.threats.critical_threats.toLocaleString();
        document.getElementById('mediumValue').innerHTML = data.threats.medium_threats.toLocaleString();
        document.getElementById('blockedUrlValue').innerHTML = data.threats.blocked_urls.toLocaleString();

        // Store threat logs for modals
        currentCriticalLogs = data.threats.critical_logs || [];
        currentMediumLogs = data.threats.medium_logs || [];
        currentBlockedUrlLogs = data.threats.blocked_url_logs || [];

        // Update last seen stats in tiles
        const criticalLastSeen = document.getElementById('criticalLastSeen');
        const mediumLastSeen = document.getElementById('mediumLastSeen');
        const blockedUrlLastSeen = document.getElementById('blockedUrlLastSeen');

        if (criticalLastSeen) {
            criticalLastSeen.textContent = formatDaysAgo(data.threats.critical_last_seen);
        }
        if (mediumLastSeen) {
            mediumLastSeen.textContent = formatDaysAgo(data.threats.medium_last_seen);
        }
        if (blockedUrlLastSeen) {
            blockedUrlLastSeen.textContent = formatDaysAgo(data.threats.blocked_url_last_seen);
        }
    }

    // System logs are now on their own page, no need to update here

    // Update license information in sidebar
    if (data.license) {
        const expiredElement = document.getElementById('sidebarLicenseExpired');
        const licensedElement = document.getElementById('sidebarLicenseLicensed');

        if (expiredElement) {
            expiredElement.textContent = data.license.expired || 0;
            // Use brand theme color
            expiredElement.style.color = '#FA582D';
        }

        if (licensedElement) {
            licensedElement.textContent = data.license.licensed || 0;
            // Use brand theme color
            licensedElement.style.color = '#FA582D';
        }
    }
}

function updateThreatLogs(elementId, logs, borderColor) {
    const container = document.getElementById(elementId);
    container.innerHTML = '';

    if (logs.length === 0) {
        container.innerHTML = '<div style="font-size: 0.7em; color: #999; padding: 5px;">No recent matches</div>';
        return;
    }

    // Create table
    const table = document.createElement('table');
    table.className = 'threat-log-table';

    // Create header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th style="width: 60%;">Threat/URL</th>
            <th style="width: 40%;">Time</th>
        </tr>
    `;
    table.appendChild(thead);

    // Create body
    const tbody = document.createElement('tbody');

    logs.forEach(log => {
        const row = document.createElement('tr');
        row.style.borderLeftColor = borderColor;

        const threat = log.threat || log.url || 'Unknown';
        const src = log.src || 'N/A';
        const dst = log.dst || 'N/A';
        const dport = log.dport || 'N/A';
        const sport = log.sport || 'N/A';
        const action = log.action || 'N/A';
        const app = log.app || 'N/A';
        const category = log.category || 'N/A';
        const severity = log.severity || 'N/A';
        const datetime = log.time ? new Date(log.time) : null;
        const time = datetime ? datetime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
        const fullTime = datetime ? datetime.toLocaleString() : 'N/A';

        // Build comprehensive tooltip
        let tooltipParts = [
            `Threat/URL: ${threat}`,
            `Time: ${fullTime}`,
            `Source: ${src}:${sport}`,
            `Destination: ${dst}:${dport}`,
            `Action: ${action}`,
            `Application: ${app}`
        ];

        if (severity !== 'N/A') tooltipParts.push(`Severity: ${severity}`);
        if (category !== 'N/A') tooltipParts.push(`Category: ${category}`);

        const tooltip = tooltipParts.join('\n');

        row.innerHTML = `
            <td style="border-left-color: ${borderColor};">
                <div class="threat-name" title="${tooltip}">${threat}</div>
            </td>
            <td style="border-left-color: ${borderColor};">
                <div class="threat-time" title="${tooltip}">${time}</div>
            </td>
        `;

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);
}

// Initialize and update mini sparkline charts
function createMiniChart(canvasId, color) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    return new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: Array(MAX_MINI_POINTS).fill(''),
            datasets: [{
                data: [],
                borderColor: color,
                backgroundColor: color + '20',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                x: { display: false },
                y: { display: false }
            },
            animation: { duration: 0 }
        }
    });
}

function updateMiniChart(chart, data, color) {
    if (!chart) return;

    chart.data.datasets[0].data = data;
    chart.update('none');
}

// Update status indicator
function updateStatus(isOnline, message = '') {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (isOnline) {
        statusDot.classList.remove('offline');
        statusDot.classList.add('online');
        statusText.textContent = 'Connected';
    } else {
        statusDot.classList.remove('online');
        statusDot.classList.add('offline');
        statusText.textContent = 'Disconnected';
    }
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = `Error: ${message}`;
    errorDiv.style.display = 'block';

    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// Fetch data from API
async function fetchThroughputData() {
    try {
        const response = await fetch('/api/throughput');
        const data = await response.json();

        if (data.status === 'success') {
            updateStats(data);
            updateChart(data);
            updateStatus(true);
        } else {
            updateStatus(false);
            showError(data.message || 'Failed to fetch data');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        updateStatus(false);
        showError('Connection error: ' + error.message);
    }
}

// Add smooth number animation
function animateValue(element, start, end, duration) {
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
            current = end;
            clearInterval(timer);
        }
        element.textContent = current.toFixed(2);
    }, 16);
}

// Initialize the application
async function init() {
    console.log('Initializing Palo Alto Firewall Monitor...');

    // Load settings first
    await initSettings();

    // Initialize mini charts
    sessionChart = createMiniChart('sessionChart', '#ffffff');
    tcpChart = createMiniChart('tcpChart', '#3b82f6');
    udpChart = createMiniChart('udpChart', '#8b5cf6');
    ppsChart = createMiniChart('ppsChart', '#ffffff');

    // Set up interface update button
    const updateInterfaceBtn = document.getElementById('updateInterfaceBtn');
    if (updateInterfaceBtn) {
        updateInterfaceBtn.addEventListener('click', updateMonitoredInterface);
    }

    // Initial fetch
    fetchThroughputData();

    // Set up polling with the loaded UPDATE_INTERVAL
    updateIntervalId = setInterval(fetchThroughputData, UPDATE_INTERVAL);
}

// Sidebar resize functionality
function initSidebarResize() {
    const sidebar = document.querySelector('.sidebar');
    const resizeHandle = document.querySelector('.resize-handle');
    let isResizing = false;

    resizeHandle.addEventListener('mousedown', () => {
        isResizing = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const newWidth = e.clientX;
        const minWidth = parseInt(getComputedStyle(sidebar).minWidth);
        const maxWidth = parseInt(getComputedStyle(sidebar).maxWidth);

        if (newWidth >= minWidth && newWidth <= maxWidth) {
            sidebar.style.width = newWidth + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });
}

// Page navigation
function initPageNavigation() {
    const menuItems = document.querySelectorAll('.menu-item');
    const pages = {
        'homepage': document.getElementById('homepage-content'),
        'connected-devices': document.getElementById('connected-devices-content'),
        'applications': document.getElementById('applications-content'),
        'device-info': document.getElementById('device-info-content'),
        'logs': document.getElementById('logs-content'),
        'devices': document.getElementById('devices-content'),
        'settings': document.getElementById('settings-content')
    };

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetPage = item.getAttribute('data-page');

            // Update active menu item
            menuItems.forEach(mi => mi.classList.remove('active'));
            item.classList.add('active');

            // Show target page, hide others
            Object.keys(pages).forEach(pageKey => {
                if (pageKey === targetPage) {
                    pages[pageKey].style.display = 'block';
                    if (pageKey === 'device-info') {
                        // Load policies by default (first tab)
                        loadPolicies();
                    } else if (pageKey === 'connected-devices') {
                        loadConnectedDevices();
                    } else if (pageKey === 'applications') {
                        loadApplications();
                        setupApplicationsEventListeners();
                    } else if (pageKey === 'logs') {
                        // Load system logs by default (first tab)
                        loadSystemLogs();
                    } else if (pageKey === 'devices') {
                        loadDevices();
                    } else if (pageKey === 'settings') {
                        loadSettings();
                    }
                } else {
                    pages[pageKey].style.display = 'none';
                }
            });
        });
    });

    // Modal event listeners for devices page
    const addDeviceBtn = document.getElementById('addDeviceBtn');
    if (addDeviceBtn) {
        addDeviceBtn.addEventListener('click', () => showDeviceModal());
    }

    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', hideDeviceModal);
    }

    const cancelModalBtn = document.getElementById('cancelModalBtn');
    if (cancelModalBtn) {
        cancelModalBtn.addEventListener('click', hideDeviceModal);
    }

    const deviceForm = document.getElementById('deviceForm');
    if (deviceForm) {
        deviceForm.addEventListener('submit', saveDevice);
    }

    const testConnectionBtn = document.getElementById('testConnectionBtn');
    if (testConnectionBtn) {
        testConnectionBtn.addEventListener('click', testConnection);
    }

    // Logs page tab switching
    const logsTabs = document.querySelectorAll('.logs-tab');
    if (logsTabs.length > 0) {
        logsTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');

                // Update active tab styling
                logsTabs.forEach(t => {
                    t.classList.remove('active');
                    t.style.color = 'rgba(255, 255, 255, 0.6)';
                    t.style.borderBottom = '3px solid transparent';
                });
                tab.classList.add('active');
                tab.style.color = '#FA582D';
                tab.style.borderBottom = '3px solid #FA582D';

                // Show target tab content, hide others
                const systemLogsTab = document.getElementById('system-logs-tab');
                const trafficLogsTab = document.getElementById('traffic-logs-tab');

                if (targetTab === 'system-logs') {
                    systemLogsTab.style.display = 'block';
                    trafficLogsTab.style.display = 'none';
                    loadSystemLogs();
                } else if (targetTab === 'traffic-logs') {
                    systemLogsTab.style.display = 'none';
                    trafficLogsTab.style.display = 'block';
                    updateTrafficPage();
                }
            });
        });
    }

    // Device Info page tab switching
    const deviceInfoTabs = document.querySelectorAll('.device-info-tab');
    if (deviceInfoTabs.length > 0) {
        deviceInfoTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');

                // Update active tab styling
                deviceInfoTabs.forEach(t => {
                    t.classList.remove('active');
                    t.style.color = 'rgba(255, 255, 255, 0.6)';
                    t.style.borderBottom = '3px solid transparent';
                });
                tab.classList.add('active');
                tab.style.color = '#FA582D';
                tab.style.borderBottom = '3px solid #FA582D';

                // Show target tab content, hide others
                const policiesTab = document.getElementById('policies-tab');
                const softwareUpdatesTab = document.getElementById('software-updates-tab');

                if (targetTab === 'policies') {
                    policiesTab.style.display = 'block';
                    softwareUpdatesTab.style.display = 'none';
                    loadPolicies();
                } else if (targetTab === 'software-updates') {
                    policiesTab.style.display = 'none';
                    softwareUpdatesTab.style.display = 'block';
                    loadSoftwareUpdates();
                }
            });
        });
    }
}

// Modal functions for threat logs and top applications

// Critical Threats Modal
function showCriticalThreatsModal() {
    const modal = document.getElementById('criticalThreatsModal');
    const container = document.getElementById('criticalThreatsTableContainer');
    const countElement = document.getElementById('criticalModalCount');

    // Update count
    countElement.textContent = currentCriticalLogs.length;

    // Build table
    if (currentCriticalLogs.length === 0) {
        container.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">No critical threats detected</div>';
    } else {
        let tableHtml = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: linear-gradient(135deg, #FA582D 0%, #FF7A55 100%); color: white;">
                        <th style="padding: 12px; text-align: left;">Threat</th>
                        <th style="padding: 12px; text-align: left;">Source</th>
                        <th style="padding: 12px; text-align: left;">Destination</th>
                        <th style="padding: 12px; text-align: left;">App</th>
                        <th style="padding: 12px; text-align: left;">Action</th>
                        <th style="padding: 12px; text-align: left;">Time</th>
                    </tr>
                </thead>
                <tbody>
        `;

        currentCriticalLogs.forEach((log, index) => {
            const bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
            const threat = log.threat || 'Unknown';
            const src = log.src || 'N/A';
            const dst = log.dst || 'N/A';
            const app = log.app || 'N/A';
            const action = log.action || 'N/A';
            const datetime = log.time ? new Date(log.time) : null;
            const time = datetime ? datetime.toLocaleString() : 'N/A';

            tableHtml += `
                <tr style="background: ${bgColor}; border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 12px; color: #333; font-weight: 600;">${threat}</td>
                    <td style="padding: 12px; color: #666; font-family: monospace; font-size: 0.9em;">${src}</td>
                    <td style="padding: 12px; color: #666; font-family: monospace; font-size: 0.9em;">${dst}</td>
                    <td style="padding: 12px; color: #666;">${app}</td>
                    <td style="padding: 12px; color: #FA582D; font-weight: 600;">${action}</td>
                    <td style="padding: 12px; color: #999; font-size: 0.9em;">${time}</td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;
        container.innerHTML = tableHtml;
    }

    modal.style.display = 'flex';
}

function closeCriticalThreatsModal() {
    document.getElementById('criticalThreatsModal').style.display = 'none';
}

// Medium Threats Modal
function showMediumThreatsModal() {
    const modal = document.getElementById('mediumThreatsModal');
    const container = document.getElementById('mediumThreatsTableContainer');
    const countElement = document.getElementById('mediumModalCount');

    // Update count
    countElement.textContent = currentMediumLogs.length;

    // Build table
    if (currentMediumLogs.length === 0) {
        container.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">No medium threats detected</div>';
    } else {
        let tableHtml = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: linear-gradient(135deg, #E04F26 0%, #FF6B3D 100%); color: white;">
                        <th style="padding: 12px; text-align: left;">Threat</th>
                        <th style="padding: 12px; text-align: left;">Source</th>
                        <th style="padding: 12px; text-align: left;">Destination</th>
                        <th style="padding: 12px; text-align: left;">App</th>
                        <th style="padding: 12px; text-align: left;">Action</th>
                        <th style="padding: 12px; text-align: left;">Time</th>
                    </tr>
                </thead>
                <tbody>
        `;

        currentMediumLogs.forEach((log, index) => {
            const bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
            const threat = log.threat || 'Unknown';
            const src = log.src || 'N/A';
            const dst = log.dst || 'N/A';
            const app = log.app || 'N/A';
            const action = log.action || 'N/A';
            const datetime = log.time ? new Date(log.time) : null;
            const time = datetime ? datetime.toLocaleString() : 'N/A';

            tableHtml += `
                <tr style="background: ${bgColor}; border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 12px; color: #333; font-weight: 600;">${threat}</td>
                    <td style="padding: 12px; color: #666; font-family: monospace; font-size: 0.9em;">${src}</td>
                    <td style="padding: 12px; color: #666; font-family: monospace; font-size: 0.9em;">${dst}</td>
                    <td style="padding: 12px; color: #666;">${app}</td>
                    <td style="padding: 12px; color: #E04F26; font-weight: 600;">${action}</td>
                    <td style="padding: 12px; color: #999; font-size: 0.9em;">${time}</td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;
        container.innerHTML = tableHtml;
    }

    modal.style.display = 'flex';
}

function closeMediumThreatsModal() {
    document.getElementById('mediumThreatsModal').style.display = 'none';
}

// Blocked URLs Modal
function showBlockedUrlsModal() {
    const modal = document.getElementById('blockedUrlsModal');
    const container = document.getElementById('blockedUrlsTableContainer');
    const countElement = document.getElementById('blockedUrlsModalCount');

    // Update count
    countElement.textContent = currentBlockedUrlLogs.length;

    // Build table
    if (currentBlockedUrlLogs.length === 0) {
        container.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">No blocked URLs</div>';
    } else {
        let tableHtml = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: linear-gradient(135deg, #C64620 0%, #E85A31 100%); color: white;">
                        <th style="padding: 12px; text-align: left;">URL</th>
                        <th style="padding: 12px; text-align: left;">Category</th>
                        <th style="padding: 12px; text-align: left;">Source</th>
                        <th style="padding: 12px; text-align: left;">Destination</th>
                        <th style="padding: 12px; text-align: left;">Action</th>
                        <th style="padding: 12px; text-align: left;">Time</th>
                    </tr>
                </thead>
                <tbody>
        `;

        currentBlockedUrlLogs.forEach((log, index) => {
            const bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
            const url = log.url || log.threat || 'Unknown';
            const category = log.category || 'N/A';
            const src = log.src || 'N/A';
            const dst = log.dst || 'N/A';
            const action = log.action || 'N/A';
            const datetime = log.time ? new Date(log.time) : null;
            const time = datetime ? datetime.toLocaleString() : 'N/A';

            tableHtml += `
                <tr style="background: ${bgColor}; border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 12px; color: #333; font-weight: 600; word-break: break-all;">${url}</td>
                    <td style="padding: 12px; color: #666;">${category}</td>
                    <td style="padding: 12px; color: #666; font-family: monospace; font-size: 0.9em;">${src}</td>
                    <td style="padding: 12px; color: #666; font-family: monospace; font-size: 0.9em;">${dst}</td>
                    <td style="padding: 12px; color: #C64620; font-weight: 600;">${action}</td>
                    <td style="padding: 12px; color: #999; font-size: 0.9em;">${time}</td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;
        container.innerHTML = tableHtml;
    }

    modal.style.display = 'flex';
}

function closeBlockedUrlsModal() {
    document.getElementById('blockedUrlsModal').style.display = 'none';
}

// Top Applications Modal
function showTopAppsModal() {
    const modal = document.getElementById('topAppsModal');
    const container = document.getElementById('topAppsTableContainer');
    const countElement = document.getElementById('topAppsModalCount');

    // Update count
    countElement.textContent = currentTopApps.length;

    // Build table
    if (currentTopApps.length === 0) {
        container.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">No application data</div>';
    } else {
        let tableHtml = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: linear-gradient(135deg, #AD3D1A 0%, #D14925 100%); color: white;">
                        <th style="padding: 12px; text-align: left;">Rank</th>
                        <th style="padding: 12px; text-align: left;">Application</th>
                        <th style="padding: 12px; text-align: right;">Sessions</th>
                        <th style="padding: 12px; text-align: left;">Usage Bar</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const maxCount = currentTopApps[0]?.count || 1;

        currentTopApps.forEach((app, index) => {
            const bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
            const barWidth = maxCount > 0 ? (app.count / maxCount * 100) : 0;

            tableHtml += `
                <tr style="background: ${bgColor}; border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 12px; color: #AD3D1A; font-weight: 700; font-size: 1.2em;">${index + 1}</td>
                    <td style="padding: 12px; color: #333; font-weight: 600;">${app.name}</td>
                    <td style="padding: 12px; text-align: right; color: #AD3D1A; font-weight: 700; font-size: 1.1em;">${app.count.toLocaleString()}</td>
                    <td style="padding: 12px;">
                        <div style="background: #e0e0e0; border-radius: 4px; height: 20px; overflow: hidden; min-width: 200px;">
                            <div style="background: linear-gradient(135deg, #AD3D1A 0%, #D14925 100%); height: 100%; width: ${barWidth}%; transition: width 0.3s ease;"></div>
                        </div>
                    </td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
        `;
        container.innerHTML = tableHtml;
    }

    modal.style.display = 'flex';
}

function closeTopAppsModal() {
    document.getElementById('topAppsModal').style.display = 'none';
}

// Close modals when clicking outside
window.addEventListener('click', function(event) {
    const criticalModal = document.getElementById('criticalThreatsModal');
    const mediumModal = document.getElementById('mediumThreatsModal');
    const blockedModal = document.getElementById('blockedUrlsModal');
    const topAppsModal = document.getElementById('topAppsModal');

    if (event.target === criticalModal) {
        closeCriticalThreatsModal();
    } else if (event.target === mediumModal) {
        closeMediumThreatsModal();
    } else if (event.target === blockedModal) {
        closeBlockedUrlsModal();
    } else if (event.target === topAppsModal) {
        closeTopAppsModal();
    }
});

