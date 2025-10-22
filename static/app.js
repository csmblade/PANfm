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
    sessions: []
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

// Mini chart instances
let sessionChart = null;

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
                display: true,
                position: 'top',
                labels: {
                    font: {
                        size: 14,
                        family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                    },
                    padding: 15,
                    usePointStyle: true
                }
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
                        size: 11
                    },
                    maxRotation: 45,
                    minRotation: 45
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
        return '<span style="color: #22c55e; font-size: 0.8em; margin-left: 5px; opacity: 0.8;">▲</span>';
    } else if (percentChange < -5) {
        return '<span style="color: #ef4444; font-size: 0.8em; margin-left: 5px; opacity: 0.8;">▼</span>';
    } else {
        return '<span style="color: #94a3b8; font-size: 0.8em; margin-left: 5px; opacity: 0.8;">━</span>';
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
    }

    // Update CPU metrics and mini charts
    if (data.cpu) {
        // Store historical data
        // Update uptime display in sidebar
        const sidebarUptimeElement = document.getElementById('sidebarUptime');
        if (data.cpu.uptime && sidebarUptimeElement) {
            sidebarUptimeElement.textContent = data.cpu.uptime;
        }

        // Update PPS display in sidebar
        const sidebarTotalPpsElement = document.getElementById('sidebarTotalPps');
        const sidebarInboundPpsElement = document.getElementById('sidebarInboundPps');
        const sidebarOutboundPpsElement = document.getElementById('sidebarOutboundPps');

        if (data.total_pps !== undefined && sidebarTotalPpsElement) {
            sidebarTotalPpsElement.textContent = data.total_pps.toLocaleString();
        }
        if (data.inbound_pps !== undefined && sidebarInboundPpsElement) {
            sidebarInboundPpsElement.textContent = data.inbound_pps.toLocaleString();
        }
        if (data.outbound_pps !== undefined && sidebarOutboundPpsElement) {
            sidebarOutboundPpsElement.textContent = data.outbound_pps.toLocaleString();
        }

    }

    // Update API stats display in sidebar
    if (data.api_stats) {
        const apiStatsElement = document.getElementById('sidebarApiStats');
        if (apiStatsElement) {
            apiStatsElement.textContent = `${data.api_stats.total_calls.toLocaleString()} (${data.api_stats.calls_per_minute}/min)`;
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

        // Update total count
        if (topAppsValueElement) {
            topAppsValueElement.textContent = data.top_applications.total_count || 0;
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

        document.getElementById('criticalValue').innerHTML = data.threats.critical_threats.toLocaleString() + calculateTrend(historicalData.criticalThreats);
        document.getElementById('mediumValue').innerHTML = data.threats.medium_threats.toLocaleString() + calculateTrend(historicalData.mediumThreats);
        document.getElementById('blockedUrlValue').innerHTML = data.threats.blocked_urls.toLocaleString() + calculateTrend(historicalData.blockedUrls);

        // Update threat logs
        updateThreatLogs('criticalLogs', data.threats.critical_logs, '#dc2626');
        updateThreatLogs('mediumLogs', data.threats.medium_logs, '#f59e0b');
        updateThreatLogs('blockedUrlLogs', data.threats.blocked_url_logs, '#2563eb');

        // Update sidebar last seen stats
        const sidebarCritical = document.getElementById('sidebarCriticalLastSeen');
        const sidebarMedium = document.getElementById('sidebarMediumLastSeen');
        const sidebarBlocked = document.getElementById('sidebarBlockedUrlLastSeen');

        if (sidebarCritical) {
            sidebarCritical.textContent = formatDaysAgo(data.threats.critical_last_seen);
        }
        if (sidebarMedium) {
            sidebarMedium.textContent = formatDaysAgo(data.threats.medium_last_seen);
        }
        if (sidebarBlocked) {
            sidebarBlocked.textContent = formatDaysAgo(data.threats.blocked_url_last_seen);
        }
    }

    // System logs are now on their own page, no need to update here

    // Update last update time in sidebar
    const timestamp = new Date(data.timestamp);
    const lastUpdateElement = document.getElementById('sidebarLastUpdate');
    if (lastUpdateElement) {
        lastUpdateElement.textContent = timestamp.toLocaleTimeString();
    }

    // Update license information in sidebar
    if (data.license) {
        const expiredElement = document.getElementById('sidebarLicenseExpired');
        const licensedElement = document.getElementById('sidebarLicenseLicensed');

        if (expiredElement) {
            expiredElement.textContent = data.license.expired || 0;
            // Color code: red if expired > 0, green otherwise
            expiredElement.style.color = data.license.expired > 0 ? '#ef4444' : '#10b981';
        }

        if (licensedElement) {
            licensedElement.textContent = data.license.licensed || 0;
            // Color code: green if licensed > 0, gray otherwise
            licensedElement.style.color = data.license.licensed > 0 ? '#10b981' : '#999';
        }
    }
}

// Store all traffic logs for filtering
let allTrafficLogs = [];

// Store all system logs for filtering
let allSystemLogs = [];
let systemLogsMetadata = {};

// Load traffic logs
async function updateTrafficPage() {
    const tableDiv = document.getElementById('trafficLogsTable');
    const errorDiv = document.getElementById('trafficLogsErrorMessage');

    try {
        console.log('Fetching traffic logs...');
        const response = await fetch('/api/traffic-logs?max_logs=100');
        console.log('Response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Traffic logs data:', data);

        if (data.status === 'success' && data.logs && data.logs.length > 0) {
            errorDiv.style.display = 'none';

            // Store logs for filtering
            allTrafficLogs = data.logs;

            // Render the traffic logs table
            renderTrafficLogsTable(allTrafficLogs, data.timestamp);
        } else {
            errorDiv.textContent = data.message || 'No traffic logs available';
            errorDiv.style.display = 'block';
            tableDiv.innerHTML = '';
        }
    } catch (error) {
        console.error('Error loading traffic logs:', error);
        document.getElementById('trafficLogsErrorMessage').textContent = 'Failed to load traffic logs: ' + error.message;
        document.getElementById('trafficLogsErrorMessage').style.display = 'block';
    }
}

// Parse Palo Alto time format to readable format
function parsePaloAltoTime(timeStr) {
    if (!timeStr) return '-';

    try {
        let date;

        // Check if it's a Unix timestamp (all digits)
        if (/^\d+$/.test(timeStr)) {
            // Convert to milliseconds if it's in seconds
            const timestamp = timeStr.length === 10 ? parseInt(timeStr) * 1000 : parseInt(timeStr);
            date = new Date(timestamp);
        } else if (timeStr.includes('/')) {
            // Palo Alto format: 2025/01/13 10:30:45
            const normalized = timeStr.replace(/\//g, '-');
            date = new Date(normalized);
        } else if (timeStr.includes('-')) {
            // Already in ISO-like format
            date = new Date(timeStr);
        } else {
            return timeStr; // Return original if format unknown
        }

        if (isNaN(date.getTime())) {
            return timeStr; // Return original if parsing fails
        }

        return date.toLocaleString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    } catch (e) {
        return timeStr;
    }
}

// Format bytes to human-readable format (KB, MB, GB)
function formatBytes(bytes) {
    const value = parseInt(bytes || 0);

    if (value === 0) return '0 B';

    if (value < 1024) {
        return `${value} B`;
    } else if (value < 1024 * 1024) {
        return `${(value / 1024).toFixed(2)} KB`;
    } else if (value < 1024 * 1024 * 1024) {
        return `${(value / (1024 * 1024)).toFixed(2)} MB`;
    } else {
        return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
}

// Render traffic logs table with optional filtering
function renderTrafficLogsTable(logs, timestamp) {
    const tableDiv = document.getElementById('trafficLogsTable');

    // Create search box and table HTML
    let tableHtml = `
        <div style="margin-bottom: 20px;">
            <input type="text"
                id="trafficLogsSearchInput"
                placeholder="Search by source, destination, app, protocol, or action..."
                style="width: 100%; padding: 12px 15px; border: 2px solid #ff6600; border-radius: 8px; font-size: 0.95em; box-sizing: border-box;"
            />
        </div>
        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.15); border-top: 4px solid #ff6600;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                <thead>
                    <tr style="border-bottom: 2px solid #ff6600;">
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Time</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Source</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Destination</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">App</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Proto</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Action</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Bytes</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Packets</th>
                    </tr>
                </thead>
                <tbody id="trafficLogsTableBody">
    `;

    // Add rows for each log entry
    logs.forEach((log, index) => {
        const bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
        const actionColor = log.action === 'allow' ? '#10b981' : '#dc2626';
        const time = parsePaloAltoTime(log.time);
        const totalBytes = parseInt(log.bytes_sent || 0) + parseInt(log.bytes_received || 0);
        const formattedBytes = formatBytes(totalBytes);

        tableHtml += `
            <tr style="background: ${bgColor}; border-bottom: 1px solid #eee;">
                <td style="padding: 10px; color: #666; white-space: nowrap;">${time}</td>
                <td style="padding: 10px; color: #333;">${log.src}:${log.sport}</td>
                <td style="padding: 10px; color: #333;">${log.dst}:${log.dport}</td>
                <td style="padding: 10px; color: #666;">${log.app}</td>
                <td style="padding: 10px; color: #666;">${log.proto}</td>
                <td style="padding: 10px; color: ${actionColor}; font-weight: 600;">${log.action}</td>
                <td style="padding: 10px; color: #666;">${formattedBytes}</td>
                <td style="padding: 10px; color: #666;">${parseInt(log.packets || 0).toLocaleString()}</td>
            </tr>
        `;
    });

    tableHtml += `
                </tbody>
            </table>
            <div style="margin-top: 15px; padding: 10px; background: #f0f0f0; border-radius: 8px; color: #666; font-size: 0.9em;" id="trafficLogsFooter">
                Showing ${logs.length} of ${allTrafficLogs.length} logs | Last updated: ${new Date(timestamp).toLocaleString()}
            </div>
        </div>
    `;

    tableDiv.innerHTML = tableHtml;

    // Add search event listener
    const searchInput = document.getElementById('trafficLogsSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterTrafficLogs(e.target.value);
        });
    }
}

// Filter traffic logs based on search term
function filterTrafficLogs(searchTerm) {
    const term = searchTerm.toLowerCase().trim();

    if (!term) {
        // Show all logs if search is empty
        renderTrafficLogsTable(allTrafficLogs, new Date().toISOString());
        return;
    }

    // Filter logs by searching across multiple fields
    const filteredLogs = allTrafficLogs.filter(log => {
        return (
            (log.src && log.src.toLowerCase().includes(term)) ||
            (log.dst && log.dst.toLowerCase().includes(term)) ||
            (log.app && log.app.toLowerCase().includes(term)) ||
            (log.proto && log.proto.toLowerCase().includes(term)) ||
            (log.action && log.action.toLowerCase().includes(term)) ||
            (log.sport && log.sport.toString().includes(term)) ||
            (log.dport && log.dport.toString().includes(term))
        );
    });

    // Re-render table with filtered logs
    const tableBody = document.getElementById('trafficLogsTableBody');
    const footer = document.getElementById('trafficLogsFooter');

    if (tableBody) {
        let rowsHtml = '';
        filteredLogs.forEach((log, index) => {
            const bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
            const actionColor = log.action === 'allow' ? '#10b981' : '#dc2626';
            const time = parsePaloAltoTime(log.time);
            const totalBytes = parseInt(log.bytes_sent || 0) + parseInt(log.bytes_received || 0);
            const formattedBytes = formatBytes(totalBytes);

            rowsHtml += `
                <tr style="background: ${bgColor}; border-bottom: 1px solid #eee;">
                    <td style="padding: 10px; color: #666; white-space: nowrap;">${time}</td>
                    <td style="padding: 10px; color: #333;">${log.src}:${log.sport}</td>
                    <td style="padding: 10px; color: #333;">${log.dst}:${log.dport}</td>
                    <td style="padding: 10px; color: #666;">${log.app}</td>
                    <td style="padding: 10px; color: #666;">${log.proto}</td>
                    <td style="padding: 10px; color: ${actionColor}; font-weight: 600;">${log.action}</td>
                    <td style="padding: 10px; color: #666;">${formattedBytes}</td>
                    <td style="padding: 10px; color: #666;">${parseInt(log.packets || 0).toLocaleString()}</td>
                </tr>
            `;
        });

        if (filteredLogs.length === 0) {
            rowsHtml = `
                <tr>
                    <td colspan="8" style="padding: 20px; text-align: center; color: #999;">
                        No logs match your search criteria
                    </td>
                </tr>
            `;
        }

        tableBody.innerHTML = rowsHtml;
    }

    if (footer) {
        footer.innerHTML = `Showing ${filteredLogs.length} of ${allTrafficLogs.length} logs | Last updated: ${new Date().toLocaleString()}`;
    }
}

// Update threat log display
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
    sessionChart = createMiniChart('sessionChart', '#ff6600');

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
        'policies': document.getElementById('policies-content'),
        'system-logs': document.getElementById('system-logs-content'),
        'traffic': document.getElementById('traffic-content'),
        'software-updates': document.getElementById('software-updates-content'),
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
                    if (pageKey === 'policies') {
                        loadPolicies();
                    } else if (pageKey === 'connected-devices') {
                        loadConnectedDevices();
                    } else if (pageKey === 'system-logs') {
                        loadSystemLogs();
                    } else if (pageKey === 'traffic') {
                        updateTrafficPage();
                    } else if (pageKey === 'software-updates') {
                        loadSoftwareUpdates();
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
}

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
async function loadSystemLogs() {
    try {
        const response = await fetch('/api/system-logs');
        const data = await response.json();

        const tableDiv = document.getElementById('systemLogsTable');
        const errorDiv = document.getElementById('systemLogsErrorMessage');

        if (data.status === 'success' && data.logs.length > 0) {
            errorDiv.style.display = 'none';

            // Store logs and metadata for filtering/searching
            allSystemLogs = data.logs;
            systemLogsMetadata = {
                total: data.total,
                timestamp: data.timestamp
            };

            // Load saved sort preference
            const sortBy = localStorage.getItem('systemLogsSortBy') || 'time';
            const sortSelect = document.getElementById('systemLogsSortBy');
            if (sortSelect) {
                sortSelect.value = sortBy;

                // Add event listener if not already added
                if (!sortSelect.hasAttribute('data-listener')) {
                    sortSelect.addEventListener('change', (e) => {
                        localStorage.setItem('systemLogsSortBy', e.target.value);
                        renderSystemLogsTable();
                    });
                    sortSelect.setAttribute('data-listener', 'true');
                }
            }

            // Load saved severity filter preference
            const filterSeverity = localStorage.getItem('systemLogsFilterSeverity') || 'all';
            const filterSelect = document.getElementById('systemLogsFilterSeverity');
            if (filterSelect) {
                filterSelect.value = filterSeverity;

                // Add event listener if not already added
                if (!filterSelect.hasAttribute('data-listener')) {
                    filterSelect.addEventListener('change', (e) => {
                        localStorage.setItem('systemLogsFilterSeverity', e.target.value);
                        renderSystemLogsTable();
                    });
                    filterSelect.setAttribute('data-listener', 'true');
                }
            }

            // Add search event listener
            const searchInput = document.getElementById('systemLogsSearchInput');
            if (searchInput && !searchInput.hasAttribute('data-listener')) {
                searchInput.addEventListener('input', (e) => {
                    renderSystemLogsTable();
                });
                searchInput.setAttribute('data-listener', 'true');
            }

            // Render the table
            renderSystemLogsTable();
        } else {
            errorDiv.textContent = data.message || 'No system logs available';
            errorDiv.style.display = 'block';
            tableDiv.innerHTML = '';
        }
    } catch (error) {
        console.error('Error loading system logs:', error);
        document.getElementById('systemLogsErrorMessage').textContent = 'Failed to load system logs: ' + error.message;
        document.getElementById('systemLogsErrorMessage').style.display = 'block';
    }
}

// Render system logs table with filtering and sorting
function renderSystemLogsTable() {
    const tableDiv = document.getElementById('systemLogsTable');
    const sortBy = localStorage.getItem('systemLogsSortBy') || 'time';
    const filterSeverity = localStorage.getItem('systemLogsFilterSeverity') || 'all';
    const searchTerm = (document.getElementById('systemLogsSearchInput')?.value || '').toLowerCase().trim();

    // Apply severity filter
    let filteredLogs = [...allSystemLogs];
    if (filterSeverity !== 'all') {
        filteredLogs = filteredLogs.filter(log =>
            log.severity.toLowerCase() === filterSeverity.toLowerCase()
        );
    }

    // Apply search filter
    if (searchTerm) {
        filteredLogs = filteredLogs.filter(log => {
            return (
                (log.time && log.time.toLowerCase().includes(searchTerm)) ||
                (log.eventid && log.eventid.toString().toLowerCase().includes(searchTerm)) ||
                (log.severity && log.severity.toLowerCase().includes(searchTerm)) ||
                (log.module && log.module.toLowerCase().includes(searchTerm)) ||
                (log.subtype && log.subtype.toLowerCase().includes(searchTerm)) ||
                (log.description && log.description.toLowerCase().includes(searchTerm)) ||
                (log.result && log.result.toLowerCase().includes(searchTerm))
            );
        });
    }

    // Sort the filtered logs based on selected criteria
    const sortedLogs = sortSystemLogs(filteredLogs, sortBy);

            // Create table HTML
            let tableHtml = `
                <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.15); border-top: 4px solid #ff6600;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #ff6600;">
                                <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Time</th>
                                <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Event ID</th>
                                <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Severity</th>
                                <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Module</th>
                                <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Subtype</th>
                                <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Description</th>
                                <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Result</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            // Add rows for each log entry
            sortedLogs.forEach((log, index) => {
                const bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
                const severityColor = log.severity === 'critical' ? '#dc2626' : (log.severity === 'high' ? '#f59e0b' : '#666');

                tableHtml += `
                    <tr style="background: ${bgColor}; border-bottom: 1px solid #eee;">
                        <td style="padding: 12px; color: #666; font-size: 0.9em; white-space: nowrap;">${formatTimestamp(log.time)}</td>
                        <td style="padding: 12px; color: #666;">${log.eventid}</td>
                        <td style="padding: 12px; color: ${severityColor}; font-weight: 600;">${log.severity}</td>
                        <td style="padding: 12px; color: #666;">${log.module}</td>
                        <td style="padding: 12px; color: #666;">${log.subtype}</td>
                        <td style="padding: 12px; color: #333; max-width: 400px; overflow: hidden; text-overflow: ellipsis;" title="${log.description}">${log.description}</td>
                        <td style="padding: 12px; color: #666;">${log.result}</td>
                    </tr>
                `;
            });

    tableHtml += `
                    </tbody>
                </table>
                <div style="margin-top: 15px; padding: 10px; background: #f0f0f0; border-radius: 8px; color: #666; font-size: 0.9em;">
                    Showing ${sortedLogs.length} of ${systemLogsMetadata.total} logs${searchTerm ? ' (search filtered)' : ''}${filterSeverity !== 'all' ? ` (filtered by ${filterSeverity})` : ''} | Last updated: ${new Date(systemLogsMetadata.timestamp).toLocaleString()}
                </div>
            </div>
    `;

    tableDiv.innerHTML = tableHtml;
}

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

// Settings functionality
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();

        if (data.status === 'success') {
            document.getElementById('refreshInterval').value = data.settings.refresh_interval;
            document.getElementById('matchCount').value = data.settings.match_count;
            document.getElementById('topAppsCount').value = data.settings.top_apps_count || 5;
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
        const matchCount = parseInt(document.getElementById('matchCount').value);
        const topAppsCount = parseInt(document.getElementById('topAppsCount').value);
        const debugLogging = document.getElementById('debugLogging').checked;

        // Get current settings to preserve selected_device_id and monitored_interface
        const currentSettings = await fetch('/api/settings').then(r => r.json());
        const settingsToSave = {
            refresh_interval: refreshInterval,
            match_count: matchCount,
            top_apps_count: topAppsCount,
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

        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settingsToSave)
        });

        const data = await response.json();

        if (data.status === 'success') {
            // Update local variables
            UPDATE_INTERVAL = refreshInterval * 1000;
            MATCH_COUNT = matchCount;
            TOP_APPS_COUNT = topAppsCount;

            // Update tile headings
            updateTileHeadings();

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
    document.getElementById('refreshInterval').value = 5;
    document.getElementById('matchCount').value = 5;
    document.getElementById('topAppsCount').value = 5;
    document.getElementById('debugLogging').checked = false;
}

// Update monitored interface from dashboard
async function updateMonitoredInterface() {
    console.log('=== updateMonitoredInterface fired ===');
    try {
        const interfaceInput = document.getElementById('monitoredInterfaceInput');
        const newInterface = interfaceInput.value.trim();
        console.log('New interface:', newInterface);

        if (!newInterface) {
            alert('Please enter an interface name (e.g., ethernet1/12)');
            return;
        }

        // Get current settings
        console.log('Fetching current settings...');
        const currentSettings = await fetch('/api/settings').then(r => r.json());
        console.log('Current settings:', currentSettings);

        if (currentSettings.status === 'success') {
            const settings = currentSettings.settings;
            settings.monitored_interface = newInterface;

            // Save updated settings
            console.log('Saving interface to settings...');
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(settings)
            });

            const data = await response.json();
            console.log('Settings save response:', data);

            if (data.status === 'success') {
                // If a device is selected, save the interface to the device
                if (selectedDeviceId) {
                    console.log('Device selected:', selectedDeviceId);
                    const device = currentDevices.find(d => d.id === selectedDeviceId);
                    console.log('Found device:', device);

                    if (device) {
                        device.monitored_interface = newInterface;
                        console.log('Updating device with interface:', newInterface);

                        // Update device via API
                        const updateResponse = await fetch(`/api/devices/${selectedDeviceId}`, {
                            method: 'PUT',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify(device)
                        });
                        console.log('Device update response:', updateResponse.status);

                        if (updateResponse.ok) {
                            console.log('Reloading devices...');
                            await loadDevices();
                            console.log('Devices reloaded');
                        }
                    }
                } else {
                    console.log('No device selected');
                }

                // Reset chart data
                console.log('Clearing chart data...');
                chartData.labels = [];
                chartData.inbound = [];
                chartData.outbound = [];
                chartData.total = [];
                chart.update();

                // Show brief success message
                const btn = document.getElementById('updateInterfaceBtn');
                const originalText = btn.textContent;
                btn.textContent = 'Updated!';
                btn.style.background = '#10b981';

                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = 'linear-gradient(135deg, #ff6600 0%, #ff9933 100%)';
                }, 2000);

                // Refresh data
                console.log('Fetching new throughput data...');
                fetchThroughputData();
            } else {
                alert('Error updating interface: ' + (data.message || 'Unknown error'));
            }
        }
    } catch (error) {
        console.error('Error updating interface:', error);
        alert('Error updating interface: ' + error.message);
    }
    console.log('=== updateMonitoredInterface complete ===');
}

function updateTileHeadings() {
    // Update the "last X matches" text in tile headings
    const matchText = `last ${MATCH_COUNT} matches`;
    document.querySelectorAll('.stat-unit').forEach(el => {
        if (el.textContent.includes('last') && el.textContent.includes('matches')) {
            el.textContent = matchText;
        }
        if (el.textContent.includes('last') && el.textContent.includes('events')) {
            el.textContent = `last ${MATCH_COUNT} events`;
        }
    });

    // Update Top Applications unit text
    const topAppsUnitElement = document.getElementById('topAppsUnit');
    if (topAppsUnitElement) {
        topAppsUnitElement.textContent = `last ${TOP_APPS_COUNT} matches`;
    }
}

async function initSettings() {
    // Load settings on startup
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();

        if (data.status === 'success') {
            UPDATE_INTERVAL = data.settings.refresh_interval * 1000;
            MATCH_COUNT = data.settings.match_count;
            TOP_APPS_COUNT = data.settings.top_apps_count || 5;
            updateTileHeadings();

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

        const response = await fetch('/api/vendor-db/upload', {
            method: 'POST',
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
                const status = device.enabled ? '🟢' : '🔴';
                options += `<option value="${device.id}" ${selected}>${status} ${device.name} (${device.ip})</option>`;
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
                <td colspan="5" style="padding: 40px; text-align: center; color: #999;">
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
