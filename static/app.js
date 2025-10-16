// Configuration (will be loaded from settings)
let UPDATE_INTERVAL = 30000; // Update every 30 seconds (default)
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
    dataCpu: [],
    mgmtCpu: []
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
    dataCpu: [],
    mgmtCpu: [],
    criticalThreats: [],
    mediumThreats: [],
    blockedUrls: [],
    urlFiltering: [],
    memory: [],
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

    // Display throughput with utilization percentage if available
    const inboundText = data.inbound_mbps.toLocaleString() + calculateTrend(historicalData.inbound);
    const outboundText = data.outbound_mbps.toLocaleString() + calculateTrend(historicalData.outbound);
    const totalText = data.total_mbps.toLocaleString() + calculateTrend(historicalData.total);

    document.getElementById('inboundValue').innerHTML = inboundText;
    document.getElementById('outboundValue').innerHTML = outboundText;
    document.getElementById('totalValue').innerHTML = totalText;

    // Update the unit text to show utilization percentage if available
    if (data.interface_speed_mbps && data.inbound_utilization !== undefined) {
        // Find the stat-unit elements for throughput cards and update them
        const inboundCard = document.getElementById('inboundValue').closest('.stat-card');
        const outboundCard = document.getElementById('outboundValue').closest('.stat-card');
        const totalCard = document.getElementById('totalValue').closest('.stat-card');

        if (inboundCard) {
            const unitDiv = inboundCard.querySelector('.stat-unit');
            if (unitDiv) {
                unitDiv.innerHTML = `Mbps (${data.inbound_utilization}% of ${data.interface_speed_mbps} Mbps)`;
            }
        }
        if (outboundCard) {
            const unitDiv = outboundCard.querySelector('.stat-unit');
            if (unitDiv) {
                unitDiv.innerHTML = `Mbps (${data.outbound_utilization}% of ${data.interface_speed_mbps} Mbps)`;
            }
        }
        if (totalCard) {
            const unitDiv = totalCard.querySelector('.stat-unit');
            if (unitDiv) {
                unitDiv.innerHTML = `Mbps (${data.total_utilization}% of ${data.interface_speed_mbps} Mbps)`;
            }
        }
    }

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
        historicalData.dataCpu.push(data.cpu.data_plane_cpu);
        historicalData.mgmtCpu.push(data.cpu.mgmt_plane_cpu);
        if (historicalData.dataCpu.length > 60) {
            historicalData.dataCpu.shift();
            historicalData.mgmtCpu.shift();
        }

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
            topAppsContainer.innerHTML = '';

            data.top_applications.apps.forEach((app) => {
                const barWidth = data.top_applications.apps[0].count > 0 ? (app.count / data.top_applications.apps[0].count * 100) : 0;

                // Create app item container
                const appItem = document.createElement('div');
                appItem.style.marginBottom = '8px';

                // Create header row with name and count
                const headerRow = document.createElement('div');
                headerRow.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 2px;';

                // Create clickable app name link
                const appLink = document.createElement('a');
                appLink.href = `https://applipedia.paloaltonetworks.com/`;
                appLink.target = '_blank';
                appLink.rel = 'noopener noreferrer';
                appLink.textContent = app.name;
                appLink.title = `View ${app.name} on Applipedia`;
                appLink.style.cssText = 'color: #ffffff; font-size: 0.85em; text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.3); cursor: pointer; transition: all 0.2s ease;';

                // Add hover effect
                appLink.addEventListener('mouseenter', function() {
                    this.style.color = '#ffeb3b';
                    this.style.borderBottomColor = '#ffeb3b';
                });
                appLink.addEventListener('mouseleave', function() {
                    this.style.color = '#ffffff';
                    this.style.borderBottomColor = 'rgba(255,255,255,0.3)';
                });

                // Create count span
                const countSpan = document.createElement('span');
                countSpan.textContent = app.count;
                countSpan.style.cssText = 'color: #ffcc99; font-size: 0.85em; font-weight: 600;';

                headerRow.appendChild(appLink);
                headerRow.appendChild(countSpan);

                // Create progress bar
                const barContainer = document.createElement('div');
                barContainer.style.cssText = 'background: rgba(255,255,255,0.2); border-radius: 4px; height: 6px; overflow: hidden;';

                const barFill = document.createElement('div');
                barFill.style.cssText = `background: #ffffff; height: 100%; width: ${barWidth}%; transition: width 0.3s ease;`;

                barContainer.appendChild(barFill);

                // Assemble the item
                appItem.appendChild(headerRow);
                appItem.appendChild(barContainer);

                topAppsContainer.appendChild(appItem);
            });
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
    if (!timeStr || timeStr === '-' || timeStr === '') return '<span style="color: #999;">No time</span>';

    try {
        let date;

        // Check if it's a Unix timestamp (all digits)
        if (/^\d+$/.test(timeStr)) {
            // Convert to milliseconds if it's in seconds
            const timestamp = timeStr.length === 10 ? parseInt(timeStr) * 1000 : parseInt(timeStr);
            date = new Date(timestamp);
        } else if (timeStr.includes('/')) {
            // Palo Alto format: 2025/01/13 10:30:45 or 2025/01/13
            const normalized = timeStr.replace(/\//g, '-');
            date = new Date(normalized);
        } else if (timeStr.includes('-')) {
            // Already in ISO-like format (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)
            date = new Date(timeStr);
        } else if (timeStr.includes(' ') && timeStr.match(/\d{4}/)) {
            // Try to parse as general date time string
            date = new Date(timeStr);
        } else {
            // Return original with styling if format unknown
            return `<span style="color: #999;">${timeStr}</span>`;
        }

        if (isNaN(date.getTime())) {
            // Return original with styling if parsing fails
            return `<span style="color: #999;">${timeStr}</span>`;
        }

        // Format the date nicely
        const dateStr = date.toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
        });

        const timeStr24 = date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        return `<div style="white-space: nowrap;">
                    <div style="font-weight: 600; color: #333;">${dateStr}</div>
                    <div style="font-size: 0.85em; color: #666;">${timeStr24}</div>
                </div>`;
    } catch (e) {
        console.error('Error parsing time:', timeStr, e);
        return `<span style="color: #999;">${timeStr}</span>`;
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

// ============================================================================
// Connected Devices Functions
// ============================================================================

let allConnectedDevices = [];
let currentDeviceLimit = 50;
let connectedDevicesListenersSetup = false;

async function loadConnectedDevices() {
    const tableDiv = document.getElementById('connectedDevicesTable');
    const errorDiv = document.getElementById('connectedDevicesErrorMessage');

    try {
        console.log('Fetching connected devices...');
        // Add timestamp to prevent caching
        const timestamp = new Date().getTime();
        const response = await fetch(`/api/connected-devices?_=${timestamp}`, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        console.log('Response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Connected devices data:', data);
        console.log('Sample device with vendor:', data.devices.find(d => d.mac));

        if (data.status === 'success' && data.devices) {
            errorDiv.style.display = 'none';

            // Store devices for filtering
            allConnectedDevices = data.devices;

            // Populate VLAN filter dropdown
            populateVlanFilter();

            // Render the connected devices table
            renderConnectedDevicesTable(allConnectedDevices, data.timestamp);

            // Set up event listeners only once
            if (!connectedDevicesListenersSetup) {
                setupConnectedDevicesEventListeners();
                connectedDevicesListenersSetup = true;
            }
        } else {
            errorDiv.textContent = data.message || 'No connected devices available';
            errorDiv.style.display = 'block';
            tableDiv.innerHTML = '';
        }
    } catch (error) {
        console.error('Error loading connected devices:', error);
        errorDiv.textContent = 'Failed to load connected devices: ' + error.message;
        errorDiv.style.display = 'block';
    }
}

function renderConnectedDevicesTable(devices, timestamp) {
    const tableDiv = document.getElementById('connectedDevicesTable');

    // Apply limit
    const devicesToShow = currentDeviceLimit === -1 ? devices : devices.slice(0, currentDeviceLimit);

    // Create table HTML
    let tableHtml = `
        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.15); border-top: 4px solid #ff6600;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                <thead>
                    <tr style="border-bottom: 2px solid #ff6600;">
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Hostname</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">IP Address</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">MAC Address</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Interface</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">VLAN</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Status</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Age</th>
                    </tr>
                </thead>
                <tbody id="connectedDevicesTableBody">
    `;

    // Add rows for each device
    devicesToShow.forEach((device, index) => {
        // Highlight new devices with a gradient background
        let bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
        let rowStyle = `background: ${bgColor}; border-bottom: 1px solid #eee;`;
        let newBadge = '';

        if (device.is_new) {
            // Gradient from orange to transparent for new devices
            rowStyle = `background: linear-gradient(90deg, rgba(255, 102, 0, 0.15) 0%, ${bgColor} 100%); border-bottom: 1px solid #eee; border-left: 4px solid #ff6600;`;
            newBadge = '<span style="background: #ff6600; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; font-weight: 700; margin-left: 8px;">NEW</span>';
        }

        // Determine status display and color
        let statusText = device.status || '-';
        let statusColor = '#666';

        if (device.status === 'c' || device.status === 'complete') {
            statusText = 'c';
            statusColor = '#10b981';
        } else if (device.status === 'active_session') {
            statusText = 's';
            statusColor = '#dc2626';
        }

        // Show MAC or indicate if learned from session
        let macDisplay;
        if (device.mac) {
            macDisplay = `
                <div style="font-family: 'Courier New', monospace; color: #333; font-weight: 600;">${device.mac}</div>
                ${device.vendor ? `<div style="font-size: 0.85em; color: #666; margin-top: 2px;">${device.vendor}</div>` : ''}
            `;
        } else {
            macDisplay = '<span style="color: #999; font-style: italic;">N/A</span>';
        }
        const vlanDisplay = device.vlan || '-';

        // Format age display - use TTL from firewall or calculated age
        let ageDisplay = '-';
        if (device.ttl) {
            // Show TTL from firewall (in seconds)
            const ttlSeconds = parseInt(device.ttl);
            if (!isNaN(ttlSeconds)) {
                const ttlMinutes = Math.floor(ttlSeconds / 60);
                const ttlHours = Math.floor(ttlMinutes / 60);
                if (ttlHours > 0) {
                    ageDisplay = `${ttlHours}h ${ttlMinutes % 60}m`;
                } else {
                    ageDisplay = `${ttlMinutes}m`;
                }
                ageDisplay = `<span title="ARP TTL from firewall">${ageDisplay}</span>`;
            }
        } else if (device.age_hours !== undefined && device.age_hours >= 0) {
            // Show calculated age from first seen
            const hours = device.age_hours;
            if (hours < 1) {
                ageDisplay = '<span style="color: #ff6600; font-weight: 600;" title="First seen in cache">New</span>';
            } else if (hours < 24) {
                ageDisplay = `<span title="Hours since first seen in cache">${hours}h</span>`;
            } else {
                const days = Math.floor(hours / 24);
                ageDisplay = `<span title="Days since first seen in cache">${days}d</span>`;
            }
        }

        tableHtml += `
            <tr style="${rowStyle}">
                <td style="padding: 10px; color: #333; font-weight: 600;">
                    ${device.hostname || device.ip}${newBadge}
                </td>
                <td style="padding: 10px; color: #333; font-family: 'Courier New', monospace;">
                    ${device.ip ? `<a href="#" class="client-ip-link" data-ip="${device.ip}" style="color: #2563eb; text-decoration: none; border-bottom: 2px solid transparent; transition: all 0.2s; font-weight: 600;" onmouseover="this.style.borderBottomColor='#2563eb'" onmouseout="this.style.borderBottomColor='transparent'">${device.ip}</a>` : '-'}
                </td>
                <td style="padding: 10px;">${macDisplay}</td>
                <td style="padding: 10px; color: #666;">${device.interface || '-'}</td>
                <td style="padding: 10px; color: #666; font-weight: 600;">${vlanDisplay}</td>
                <td style="padding: 10px; color: ${statusColor}; font-weight: 600;">${statusText}</td>
                <td style="padding: 10px; color: #666; font-weight: 600;">${ageDisplay}</td>
            </tr>
        `;
    });

    tableHtml += `
                </tbody>
            </table>
            <div style="margin-top: 15px; padding: 10px; background: #f0f0f0; border-radius: 8px; color: #666; font-size: 0.9em;" id="connectedDevicesFooter">
                Showing ${devicesToShow.length} of ${devices.length} devices | Last updated: ${new Date(timestamp).toLocaleString()}
            </div>
        </div>
    `;

    tableDiv.innerHTML = tableHtml;
}

function filterConnectedDevices(searchTerm) {
    const term = searchTerm.toLowerCase().trim();

    if (!term) {
        // Show all devices if search is empty
        renderConnectedDevicesTable(allConnectedDevices, new Date().toISOString());
        return;
    }

    // Filter devices by searching across multiple fields including VLAN and vendor
    const filteredDevices = allConnectedDevices.filter(device => {
        return (
            (device.hostname && device.hostname.toLowerCase().includes(term)) ||
            (device.ip && device.ip.toLowerCase().includes(term)) ||
            (device.mac && device.mac.toLowerCase().includes(term)) ||
            (device.interface && device.interface.toLowerCase().includes(term)) ||
            (device.vlan && device.vlan.toLowerCase().includes(term)) ||
            (device.vendor && device.vendor.toLowerCase().includes(term)) ||
            (device.status && device.status.toLowerCase().includes(term))
        );
    });

    // Re-render table with filtered devices
    const tableDiv = document.getElementById('connectedDevicesTable');

    // Apply limit to filtered results
    const devicesToShow = currentDeviceLimit === -1 ? filteredDevices : filteredDevices.slice(0, currentDeviceLimit);

    let tableHtml = `
        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.15); border-top: 4px solid #ff6600;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                <thead>
                    <tr style="border-bottom: 2px solid #ff6600;">
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Hostname</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">IP Address</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">MAC Address</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Interface</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">VLAN</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Status</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Age</th>
                    </tr>
                </thead>
                <tbody>
    `;

    devicesToShow.forEach((device, index) => {
        // Highlight new devices with a gradient background
        let bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
        let rowStyle = `background: ${bgColor}; border-bottom: 1px solid #eee;`;
        let newBadge = '';

        if (device.is_new) {
            // Gradient from orange to transparent for new devices
            rowStyle = `background: linear-gradient(90deg, rgba(255, 102, 0, 0.15) 0%, ${bgColor} 100%); border-bottom: 1px solid #eee; border-left: 4px solid #ff6600;`;
            newBadge = '<span style="background: #ff6600; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; font-weight: 700; margin-left: 8px;">NEW</span>';
        }

        // Determine status display and color
        let statusText = device.status || '-';
        let statusColor = '#666';

        if (device.status === 'c' || device.status === 'complete') {
            statusText = 'c';
            statusColor = '#10b981';
        } else if (device.status === 'active_session') {
            statusText = 's';
            statusColor = '#dc2626';
        }

        // Show MAC or indicate if learned from session
        let macDisplay;
        if (device.mac) {
            macDisplay = `
                <div style="font-family: 'Courier New', monospace; color: #333; font-weight: 600;">${device.mac}</div>
                ${device.vendor ? `<div style="font-size: 0.85em; color: #666; margin-top: 2px;">${device.vendor}</div>` : ''}
            `;
        } else {
            macDisplay = '<span style="color: #999; font-style: italic;">N/A</span>';
        }
        const vlanDisplay = device.vlan || '-';

        // Format age display - use TTL from firewall or calculated age
        let ageDisplay = '-';
        if (device.ttl) {
            // Show TTL from firewall (in seconds)
            const ttlSeconds = parseInt(device.ttl);
            if (!isNaN(ttlSeconds)) {
                const ttlMinutes = Math.floor(ttlSeconds / 60);
                const ttlHours = Math.floor(ttlMinutes / 60);
                if (ttlHours > 0) {
                    ageDisplay = `${ttlHours}h ${ttlMinutes % 60}m`;
                } else {
                    ageDisplay = `${ttlMinutes}m`;
                }
                ageDisplay = `<span title="ARP TTL from firewall">${ageDisplay}</span>`;
            }
        } else if (device.age_hours !== undefined && device.age_hours >= 0) {
            // Show calculated age from first seen
            const hours = device.age_hours;
            if (hours < 1) {
                ageDisplay = '<span style="color: #ff6600; font-weight: 600;" title="First seen in cache">New</span>';
            } else if (hours < 24) {
                ageDisplay = `<span title="Hours since first seen in cache">${hours}h</span>`;
            } else {
                const days = Math.floor(hours / 24);
                ageDisplay = `<span title="Days since first seen in cache">${days}d</span>`;
            }
        }

        tableHtml += `
            <tr style="${rowStyle}">
                <td style="padding: 10px; color: #333; font-weight: 600;">
                    ${device.hostname || device.ip}${newBadge}
                </td>
                <td style="padding: 10px; color: #333; font-family: 'Courier New', monospace;">
                    ${device.ip ? `<a href="#" class="client-ip-link" data-ip="${device.ip}" style="color: #2563eb; text-decoration: none; border-bottom: 2px solid transparent; transition: all 0.2s; font-weight: 600;" onmouseover="this.style.borderBottomColor='#2563eb'" onmouseout="this.style.borderBottomColor='transparent'">${device.ip}</a>` : '-'}
                </td>
                <td style="padding: 10px;">${macDisplay}</td>
                <td style="padding: 10px; color: #666;">${device.interface || '-'}</td>
                <td style="padding: 10px; color: #666; font-weight: 600;">${vlanDisplay}</td>
                <td style="padding: 10px; color: ${statusColor}; font-weight: 600;">${statusText}</td>
                <td style="padding: 10px; color: #666; font-weight: 600;">${ageDisplay}</td>
            </tr>
        `;
    });

    tableHtml += `
                </tbody>
            </table>
            <div style="margin-top: 15px; padding: 10px; background: #f0f0f0; border-radius: 8px; color: #666; font-size: 0.9em;">
                Showing ${devicesToShow.length} of ${filteredDevices.length} devices | Last updated: ${new Date().toLocaleString()}
            </div>
        </div>
    `;

    tableDiv.innerHTML = tableHtml;
}

// Get currently filtered devices based on all active filters
function getFilteredDevices() {
    let filtered = [...allConnectedDevices];

    // Apply general search filter
    const searchInput = document.getElementById('connectedDevicesSearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    if (searchTerm) {
        filtered = filtered.filter(device => {
            return (
                (device.hostname && device.hostname.toLowerCase().includes(searchTerm)) ||
                (device.ip && device.ip.toLowerCase().includes(searchTerm)) ||
                (device.mac && device.mac.toLowerCase().includes(searchTerm)) ||
                (device.interface && device.interface.toLowerCase().includes(searchTerm)) ||
                (device.vlan && device.vlan.toLowerCase().includes(searchTerm)) ||
                (device.vendor && device.vendor.toLowerCase().includes(searchTerm)) ||
                (device.status && device.status.toLowerCase().includes(searchTerm))
            );
        });
    }

    // Apply VLAN filter
    const vlanFilter = document.getElementById('connectedDevicesVlanFilter');
    const selectedVlan = vlanFilter ? vlanFilter.value : '';

    if (selectedVlan) {
        filtered = filtered.filter(device => device.vlan === selectedVlan);
    }

    // Apply status filter
    const statusFilter = document.getElementById('connectedDevicesStatusFilter');
    const selectedStatus = statusFilter ? statusFilter.value : '';

    if (selectedStatus) {
        filtered = filtered.filter(device => device.status === selectedStatus);
    }

    return filtered;
}

// Populate VLAN filter dropdown with unique VLANs
function populateVlanFilter() {
    const vlanFilter = document.getElementById('connectedDevicesVlanFilter');
    if (!vlanFilter) return;

    // Get unique VLANs from all devices
    const vlans = [...new Set(allConnectedDevices.map(d => d.vlan).filter(v => v && v !== '-'))].sort((a, b) => {
        return parseInt(a) - parseInt(b);
    });

    // Keep the "All VLANs" option and add unique VLANs
    const currentValue = vlanFilter.value;
    vlanFilter.innerHTML = '<option value="">All VLANs</option>';

    vlans.forEach(vlan => {
        const option = document.createElement('option');
        option.value = vlan;
        option.textContent = `VLAN ${vlan}`;
        vlanFilter.appendChild(option);
    });

    // Restore previous selection if it still exists
    if (currentValue && vlans.includes(currentValue)) {
        vlanFilter.value = currentValue;
    }
}

// Export devices to CSV
function exportDevicesCSV() {
    const devices = getFilteredDevices();

    if (devices.length === 0) {
        alert('No devices to export!');
        return;
    }

    // CSV header
    const headers = ['Hostname', 'IP Address', 'MAC Address', 'Vendor', 'Country', 'Interface', 'VLAN', 'Status', 'Age (hours)', 'First Seen', 'Last Seen', 'Is New'];

    // CSV rows
    const rows = devices.map(device => {
        return [
            device.hostname || '',
            device.ip || '',
            device.mac || '',
            device.vendor || '',
            device.country || '',
            device.interface || '',
            device.vlan || '',
            device.status || '',
            device.age_hours !== undefined ? device.age_hours : '',
            device.first_seen || '',
            device.last_seen || '',
            device.is_new ? 'Yes' : 'No'
        ].map(field => {
            // Escape quotes and wrap in quotes if contains comma
            const escaped = String(field).replace(/"/g, '""');
            return escaped.includes(',') || escaped.includes('"') ? `"${escaped}"` : escaped;
        }).join(',');
    });

    // Combine into CSV content
    const csvContent = [headers.join(','), ...rows].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    link.setAttribute('href', url);
    link.setAttribute('download', `connected-devices-${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Export devices to XML
function exportDevicesXML() {
    const devices = getFilteredDevices();

    if (devices.length === 0) {
        alert('No devices to export!');
        return;
    }

    // Build XML content
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<ConnectedDevices>\n';
    xml += `  <ExportInfo>\n`;
    xml += `    <Timestamp>${new Date().toISOString()}</Timestamp>\n`;
    xml += `    <DeviceCount>${devices.length}</DeviceCount>\n`;
    xml += `  </ExportInfo>\n`;
    xml += '  <Devices>\n';

    devices.forEach(device => {
        xml += '    <Device>\n';
        xml += `      <Hostname>${escapeXml(device.hostname || '')}</Hostname>\n`;
        xml += `      <IPAddress>${escapeXml(device.ip || '')}</IPAddress>\n`;
        xml += `      <MACAddress>${escapeXml(device.mac || '')}</MACAddress>\n`;
        xml += `      <Vendor>${escapeXml(device.vendor || '')}</Vendor>\n`;
        xml += `      <Country>${escapeXml(device.country || '')}</Country>\n`;
        xml += `      <Interface>${escapeXml(device.interface || '')}</Interface>\n`;
        xml += `      <VLAN>${escapeXml(device.vlan || '')}</VLAN>\n`;
        xml += `      <Status>${escapeXml(device.status || '')}</Status>\n`;
        xml += `      <AgeHours>${device.age_hours !== undefined ? device.age_hours : ''}</AgeHours>\n`;
        xml += `      <FirstSeen>${escapeXml(device.first_seen || '')}</FirstSeen>\n`;
        xml += `      <LastSeen>${escapeXml(device.last_seen || '')}</LastSeen>\n`;
        xml += `      <IsNew>${device.is_new ? 'true' : 'false'}</IsNew>\n`;
        xml += '    </Device>\n';
    });

    xml += '  </Devices>\n';
    xml += '</ConnectedDevices>';

    // Create download link
    const blob = new Blob([xml], { type: 'text/xml;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    link.setAttribute('href', url);
    link.setAttribute('download', `connected-devices-${timestamp}.xml`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Helper function to escape XML special characters
function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Enhanced filter function that applies all filters
function applyAllFilters() {
    const filteredDevices = getFilteredDevices();

    // Update the table with filtered results
    const tableDiv = document.getElementById('connectedDevicesTable');
    const devicesToShow = currentDeviceLimit === -1 ? filteredDevices : filteredDevices.slice(0, currentDeviceLimit);

    let tableHtml = `
        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.15); border-top: 4px solid #ff6600;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                <thead>
                    <tr style="border-bottom: 2px solid #ff6600;">
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Hostname</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">IP Address</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">MAC Address</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Interface</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">VLAN</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Status</th>
                        <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Age</th>
                    </tr>
                </thead>
                <tbody>
    `;

    devicesToShow.forEach((device, index) => {
        let bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
        let rowStyle = `background: ${bgColor}; border-bottom: 1px solid #eee;`;
        let newBadge = '';

        if (device.is_new) {
            rowStyle = `background: linear-gradient(90deg, rgba(255, 102, 0, 0.15) 0%, ${bgColor} 100%); border-bottom: 1px solid #eee; border-left: 4px solid #ff6600;`;
            newBadge = '<span style="background: #ff6600; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; font-weight: 700; margin-left: 8px;">NEW</span>';
        }

        let statusText = device.status || '-';
        let statusColor = '#666';

        if (device.status === 'c' || device.status === 'complete') {
            statusText = 'c';
            statusColor = '#10b981';
        } else if (device.status === 'active_session') {
            statusText = 's';
            statusColor = '#dc2626';
        }

        let macDisplay;
        if (device.mac) {
            macDisplay = `
                <div style="font-family: 'Courier New', monospace; color: #333; font-weight: 600;">${device.mac}</div>
                ${device.vendor ? `<div style="font-size: 0.85em; color: #666; margin-top: 2px;">${device.vendor}</div>` : ''}
            `;
        } else {
            macDisplay = '<span style="color: #999; font-style: italic;">N/A</span>';
        }

        const vlanDisplay = device.vlan || '-';

        let ageDisplay = '-';
        if (device.ttl) {
            const ttlSeconds = parseInt(device.ttl);
            if (!isNaN(ttlSeconds)) {
                const ttlMinutes = Math.floor(ttlSeconds / 60);
                const ttlHours = Math.floor(ttlMinutes / 60);
                if (ttlHours > 0) {
                    ageDisplay = `${ttlHours}h ${ttlMinutes % 60}m`;
                } else {
                    ageDisplay = `${ttlMinutes}m`;
                }
                ageDisplay = `<span title="ARP TTL from firewall">${ageDisplay}</span>`;
            }
        } else if (device.age_hours !== undefined && device.age_hours >= 0) {
            const hours = device.age_hours;
            if (hours < 1) {
                ageDisplay = '<span style="color: #ff6600; font-weight: 600;" title="First seen in cache">New</span>';
            } else if (hours < 24) {
                ageDisplay = `<span title="Hours since first seen in cache">${hours}h</span>`;
            } else {
                const days = Math.floor(hours / 24);
                ageDisplay = `<span title="Days since first seen in cache">${days}d</span>`;
            }
        }

        tableHtml += `
            <tr style="${rowStyle}">
                <td style="padding: 10px; color: #333; font-weight: 600;">
                    ${device.hostname || device.ip}${newBadge}
                </td>
                <td style="padding: 10px; color: #333; font-family: 'Courier New', monospace;">
                    ${device.ip ? `<a href="#" class="client-ip-link" data-ip="${device.ip}" style="color: #2563eb; text-decoration: none; border-bottom: 2px solid transparent; transition: all 0.2s; font-weight: 600;" onmouseover="this.style.borderBottomColor='#2563eb'" onmouseout="this.style.borderBottomColor='transparent'">${device.ip}</a>` : '-'}
                </td>
                <td style="padding: 10px;">${macDisplay}</td>
                <td style="padding: 10px; color: #666;">${device.interface || '-'}</td>
                <td style="padding: 10px; color: #666; font-weight: 600;">${vlanDisplay}</td>
                <td style="padding: 10px; color: ${statusColor}; font-weight: 600;">${statusText}</td>
                <td style="padding: 10px; color: #666; font-weight: 600;">${ageDisplay}</td>
            </tr>
        `;
    });

    tableHtml += `
                </tbody>
            </table>
            <div style="margin-top: 15px; padding: 10px; background: #f0f0f0; border-radius: 8px; color: #666; font-size: 0.9em;">
                Showing ${devicesToShow.length} of ${filteredDevices.length} filtered devices (${allConnectedDevices.length} total) | Last updated: ${new Date().toLocaleString()}
            </div>
        </div>
    `;

    tableDiv.innerHTML = tableHtml;
}

function setupConnectedDevicesEventListeners() {
    // Search input listener
    const searchInput = document.getElementById('connectedDevicesSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            applyAllFilters();
        });
    }

    // VLAN filter listener
    const vlanFilter = document.getElementById('connectedDevicesVlanFilter');
    if (vlanFilter) {
        vlanFilter.addEventListener('change', () => {
            applyAllFilters();
        });
    }

    // Status filter listener
    const statusFilter = document.getElementById('connectedDevicesStatusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            applyAllFilters();
        });
    }

    // Limit selector listener
    const limitSelect = document.getElementById('connectedDevicesLimit');
    if (limitSelect) {
        limitSelect.addEventListener('change', (e) => {
            currentDeviceLimit = parseInt(e.target.value);
            applyAllFilters();
        });
    }

    // Refresh button listener
    const refreshBtn = document.getElementById('refreshConnectedDevicesBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadConnectedDevices();
        });
    }

    // Export CSV button listener
    const exportCSVBtn = document.getElementById('exportDevicesCSV');
    if (exportCSVBtn) {
        exportCSVBtn.addEventListener('click', exportDevicesCSV);
    }

    // Export XML button listener
    const exportXMLBtn = document.getElementById('exportDevicesXML');
    if (exportXMLBtn) {
        exportXMLBtn.addEventListener('click', exportDevicesXML);
    }

    // Set up client IP click handlers using event delegation
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('client-ip-link')) {
            e.preventDefault();
            const clientIp = e.target.getAttribute('data-ip');
            if (clientIp) {
                showClientApplications(clientIp);
            }
        }
    });
}

// ============================================================================
// Client Applications Modal Functions
// ============================================================================

async function showClientApplications(clientIp) {
    const modal = document.getElementById('clientAppsModal');
    const loading = document.getElementById('clientAppsLoading');
    const content = document.getElementById('clientAppsContent');
    const error = document.getElementById('clientAppsError');
    const subtitle = document.getElementById('clientAppsModalSubtitle');

    // Show modal and loading state
    modal.style.display = 'flex';
    loading.style.display = 'block';
    content.style.display = 'none';
    error.style.display = 'none';
    subtitle.textContent = `Client: ${clientIp}`;

    try {
        console.log(`Fetching applications for client ${clientIp}`);
        const response = await fetch(`/api/client-apps/${clientIp}`);
        const data = await response.json();

        if (data.status === 'success') {
            loading.style.display = 'none';
            content.style.display = 'block';

            // Update summary stats
            document.getElementById('clientAppsTotalSessions').textContent = data.total_sessions.toLocaleString();

            // Format total bytes
            const totalBytes = data.total_bytes;
            let dataDisplay;
            if (totalBytes >= 1073741824) {
                dataDisplay = (totalBytes / 1073741824).toFixed(2) + ' GB';
            } else if (totalBytes >= 1048576) {
                dataDisplay = (totalBytes / 1048576).toFixed(2) + ' MB';
            } else if (totalBytes >= 1024) {
                dataDisplay = (totalBytes / 1024).toFixed(2) + ' KB';
            } else {
                dataDisplay = totalBytes + ' B';
            }
            document.getElementById('clientAppsTotalData').textContent = dataDisplay;
            document.getElementById('clientAppsCount').textContent = data.applications.length;

            // Render applications table
            renderClientApplicationsTable(data.applications);
        } else {
            loading.style.display = 'none';
            error.style.display = 'block';
            error.textContent = 'Error: ' + (data.message || 'Unknown error');
        }
    } catch (err) {
        console.error('Error fetching client applications:', err);
        loading.style.display = 'none';
        error.style.display = 'block';
        error.textContent = 'Failed to load application data: ' + err.message;
    }
}

function renderClientApplicationsTable(applications) {
    const tableDiv = document.getElementById('clientAppsTable');

    if (applications.length === 0) {
        tableDiv.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No application data found for this client.</p>';
        return;
    }

    let tableHtml = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
            <thead>
                <tr style="border-bottom: 2px solid #ff6600;">
                    <th style="padding: 10px; text-align: left; color: #333; font-weight: 600;">Application</th>
                    <th style="padding: 10px; text-align: center; color: #333; font-weight: 600;">Sessions</th>
                    <th style="padding: 10px; text-align: right; color: #333; font-weight: 600;">Sent</th>
                    <th style="padding: 10px; text-align: right; color: #333; font-weight: 600;">Received</th>
                    <th style="padding: 10px; text-align: right; color: #333; font-weight: 600;">Total</th>
                    <th style="padding: 10px; text-align: center; color: #333; font-weight: 600;">Destinations</th>
                </tr>
            </thead>
            <tbody>
    `;

    applications.forEach((app, index) => {
        const bgColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';

        // Format bytes
        const formatBytes = (bytes) => {
            if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
            if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
            if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
            return bytes + ' B';
        };

        tableHtml += `
            <tr style="background: ${bgColor}; border-bottom: 1px solid #eee;">
                <td style="padding: 10px; color: #333; font-weight: 600;">${app.app}</td>
                <td style="padding: 10px; text-align: center; color: #666;">${app.sessions}</td>
                <td style="padding: 10px; text-align: right; color: #666; font-family: 'Courier New', monospace;">${formatBytes(app.bytes_sent)}</td>
                <td style="padding: 10px; text-align: right; color: #666; font-family: 'Courier New', monospace;">${formatBytes(app.bytes_received)}</td>
                <td style="padding: 10px; text-align: right; color: #ff6600; font-family: 'Courier New', monospace; font-weight: 600;">${formatBytes(app.total_bytes)}</td>
                <td style="padding: 10px; text-align: center; color: #666;">${app.destinations_count}</td>
            </tr>
        `;
    });

    tableHtml += `
            </tbody>
        </table>
    `;

    tableDiv.innerHTML = tableHtml;
}

function initClientAppsModal() {
    const closeBtn = document.getElementById('closeClientAppsModalBtn');
    const modal = document.getElementById('clientAppsModal');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    // Close modal when clicking outside
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });
}

// Update threat log display
function updateThreatLogs(elementId, logs, borderColor) {
    const container = document.getElementById(elementId);
    container.innerHTML = '';

    if (logs.length === 0) {
        container.innerHTML = '<div style="font-size: 0.8em; color: rgba(255,255,255,0.6); padding: 10px; text-align: center;">No recent matches</div>';
        return;
    }

    // Check if this is for blocked URLs
    const isBlockedUrls = elementId === 'blockedUrlLogs';

    logs.forEach((log, index) => {
        const threat = log.threat || log.url || 'Unknown';
        const threatId = log.threat_id || null;
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

        // Create list item
        const item = document.createElement('div');
        item.className = 'threat-list-item';
        item.style.borderLeftColor = borderColor;

        // Check if this is a blocked URL
        if (isBlockedUrls) {
            const urlFilteringUrl = `https://urlfiltering.paloaltonetworks.com/`;

            console.log(`Creating URL Filtering link for: ${threat}`);

            // Create clickable URL link
            const urlLink = document.createElement('a');
            urlLink.href = urlFilteringUrl;
            urlLink.target = '_blank';
            urlLink.rel = 'noopener noreferrer';
            urlLink.textContent = threat;
            urlLink.title = `Click to check URL category on Palo Alto URL Filtering`;
            urlLink.style.cssText = 'color: #ffffff; font-size: 0.85em; text-decoration: none; border-bottom: 2px solid rgba(255,255,255,0.3); padding-bottom: 2px; cursor: pointer; font-weight: 600; transition: all 0.2s ease; display: inline-block;';

            // Add hover effect
            urlLink.addEventListener('mouseenter', function() {
                this.style.color = '#ffeb3b';
                this.style.borderBottomColor = '#ffeb3b';
            });
            urlLink.addEventListener('mouseleave', function() {
                this.style.color = '#ffffff';
                this.style.borderBottomColor = 'rgba(255,255,255,0.3)';
            });

            const urlDiv = document.createElement('div');
            urlDiv.className = 'threat-list-name';
            urlDiv.appendChild(urlLink);

            item.appendChild(urlDiv);
        } else if (threatId) {
            // This is a threat with Threat ID - link to Threat Vault
            const threatVaultUrl = `https://threatvault.paloaltonetworks.com/?query=${encodeURIComponent(threatId)}`;

            console.log(`Creating Threat Vault link: ${threatId} -> ${threatVaultUrl}`);

            // Create Threat ID header as clickable badge
            const threatIdHeaderDiv = document.createElement('div');
            threatIdHeaderDiv.className = 'threat-cve-header';

            const threatIdLink = document.createElement('a');
            threatIdLink.href = threatVaultUrl;
            threatIdLink.target = '_blank';
            threatIdLink.rel = 'noopener noreferrer';
            threatIdLink.textContent = `Threat ID: ${threatId}`;
            threatIdLink.title = `Click to view threat details on Palo Alto Threat Vault`;
            threatIdLink.style.cssText = 'color: #ffffff; background: rgba(220, 38, 38, 0.8); padding: 4px 10px; border-radius: 4px; font-size: 0.75em; font-weight: 700; text-decoration: none; display: inline-block; cursor: pointer; transition: all 0.2s ease; letter-spacing: 0.5px;';

            // Add click event for debugging
            threatIdLink.addEventListener('click', function(e) {
                console.log(`Threat Vault link clicked: ${threatVaultUrl}`);
            });

            // Add hover effect via JavaScript
            threatIdLink.addEventListener('mouseenter', function() {
                this.style.background = '#ffeb3b';
                this.style.color = '#000000';
                this.style.transform = 'scale(1.05)';
            });
            threatIdLink.addEventListener('mouseleave', function() {
                this.style.background = 'rgba(220, 38, 38, 0.8)';
                this.style.color = '#ffffff';
                this.style.transform = 'scale(1)';
            });

            threatIdHeaderDiv.appendChild(threatIdLink);

            // Create threat description element
            const threatDescDiv = document.createElement('div');
            threatDescDiv.className = 'threat-list-name';
            threatDescDiv.textContent = threat;
            threatDescDiv.style.marginTop = '6px';
            threatDescDiv.style.fontWeight = '600';
            threatDescDiv.style.color = 'rgba(255,255,255,0.95)';

            // Add Threat ID header first, then description
            item.appendChild(threatIdHeaderDiv);
            item.appendChild(threatDescDiv);
        } else {
            // Regular text for non-CVE threats
            const threatNameDiv = document.createElement('div');
            threatNameDiv.className = 'threat-list-name';
            threatNameDiv.textContent = threat;
            threatNameDiv.style.fontWeight = '600';
            threatNameDiv.style.color = 'rgba(255,255,255,0.95)';

            item.appendChild(threatNameDiv);
        }

        // Create time element
        const timeDiv = document.createElement('div');
        timeDiv.className = 'threat-list-time';
        timeDiv.textContent = time;

        // Create details element (source -> destination)
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'threat-list-details';
        detailsDiv.textContent = `${src}:${sport} → ${dst}:${dport}`;
        detailsDiv.title = `Source: ${src}:${sport}\nDestination: ${dst}:${dport}\nApp: ${app}\nAction: ${action}${severity !== 'N/A' ? '\nSeverity: ' + severity : ''}${category !== 'N/A' ? '\nCategory: ' + category : ''}`;

        // Add time and details (CVE header and description were already added above for CVE threats)
        item.appendChild(timeDiv);
        item.appendChild(detailsDiv);

        container.appendChild(item);
    });
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

    // Initialize client applications modal
    initClientAppsModal();

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
        'policies': document.getElementById('policies-content'),
        'system-logs': document.getElementById('system-logs-content'),
        'traffic': document.getElementById('traffic-content'),
        'software-updates': document.getElementById('software-updates-content'),
        'site-monitor': document.getElementById('site-monitor-content'),
        'devices': document.getElementById('devices-content'),
        'connected-devices': document.getElementById('connected-devices-content'),
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
                    } else if (pageKey === 'system-logs') {
                        loadSystemLogs();
                    } else if (pageKey === 'traffic') {
                        updateTrafficPage();
                    } else if (pageKey === 'software-updates') {
                        loadSoftwareUpdates();
                    } else if (pageKey === 'site-monitor') {
                        loadSiteMonitor();
                    } else if (pageKey === 'devices') {
                        loadDevices();
                    } else if (pageKey === 'connected-devices') {
                        loadConnectedDevices();
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
        container.innerHTML = `
            <div style="background: white; border-radius: 12px; padding: 40px; text-align: center; box-shadow: 0 5px 15px rgba(0,0,0,0.15); border-top: 4px solid #ff6600;">
                <div style="font-size: 1.2em; color: #666; margin-bottom: 10px;">No security policies found</div>
                <div style="font-size: 0.9em; color: #999;">Security policies will appear here once configured on the firewall.</div>
            </div>
        `;
        return;
    }

    // Calculate summary stats
    const totalHits = policies.reduce((sum, p) => sum + p.hit_count, 0);
    const activeRules = policies.filter(p => p.hit_count > 0).length;
    const unusedRules = policies.filter(p => p.hit_count === 0).length;

    let html = `
        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.15); border-top: 4px solid #ff6600;">
            <div style="margin-bottom: 15px; padding: 12px; background: linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%); border-left: 4px solid #ff6600; border-radius: 6px;">
                <div style="font-weight: 600; color: #9a3412; margin-bottom: 5px;">
                    Total Security Policies: ${policies.length} | Active: ${activeRules} | Unused: ${unusedRules} | Total Hits: ${totalHits.toLocaleString()}
                </div>
                <div style="font-size: 0.85em; color: #c2410c;">Security rules controlling access between zones and applications</div>
            </div>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #ff6600; background: #f9f9f9;">
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Policy Name</th>
                        <th style="padding: 12px; text-align: center; color: #333; font-weight: 600;">Status</th>
                        <th style="padding: 12px; text-align: right; color: #333; font-weight: 600;">Hit Count</th>
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">First Hit</th>
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Latest Hit</th>
                        <th style="padding: 12px; text-align: center; color: #333; font-weight: 600;">Type</th>
                    </tr>
                </thead>
                <tbody>
    `;

    policies.forEach((policy, index) => {
        const bgColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
        const hitCountColor = policy.hit_count > 1000 ? '#ff6600' : policy.hit_count > 0 ? '#333' : '#999';

        // Status badge
        let statusBadge = '';
        let statusColor = '#10b981';
        let statusBgColor = '#d1fae5';
        let statusText = 'Active';

        if (policy.hit_count === 0) {
            statusText = 'Unused';
            statusColor = '#ef4444';
            statusBgColor = '#fee2e2';
        } else if (policy.hit_count > 10000) {
            statusText = 'High Traffic';
            statusColor = '#f59e0b';
            statusBgColor = '#fef3c7';
        }

        statusBadge = `<span style="background: ${statusBgColor}; color: ${statusColor}; padding: 6px 12px; border-radius: 20px; font-size: 0.85em; font-weight: 600;">${statusText}</span>`;

        // Show trend indicator if available
        let trendIcon = '';
        if (policy.trend) {
            if (policy.trend === 'up') {
                trendIcon = '<span style="color: #ff6600; margin-left: 5px;">▲</span>';
            } else if (policy.trend === 'down') {
                trendIcon = '<span style="color: #10b981; margin-left: 5px;">▼</span>';
            } else {
                trendIcon = '<span style="color: #999; margin-left: 5px;">━</span>';
            }
        }

        html += `
            <tr style="background: ${bgColor}; border-bottom: 1px solid #e5e7eb; transition: background 0.2s;" onmouseover="this.style.background='#fef3c7'" onmouseout="this.style.background='${bgColor}'">
                <td style="padding: 12px; color: #333; font-weight: 500;">
                    <div style="display: flex; align-items: center;">
                        <div style="width: 4px; height: 24px; background: ${hitCountColor}; margin-right: 10px; border-radius: 2px;"></div>
                        ${policy.name}
                    </div>
                </td>
                <td style="padding: 12px; text-align: center;">${statusBadge}</td>
                <td style="padding: 12px; text-align: right; color: ${hitCountColor}; font-weight: 600; font-size: 1.1em; font-family: monospace;">${policy.hit_count.toLocaleString()}${trendIcon}</td>
                <td style="padding: 12px; color: #666; font-size: 0.85em; font-family: monospace;">${formatTimestamp(policy.first_hit)}</td>
                <td style="padding: 12px; color: #666; font-size: 0.85em; font-family: monospace;">${formatTimestamp(policy.latest_hit)}</td>
                <td style="padding: 12px; text-align: center;">
                    <span style="background: #f3f4f6; color: #666; padding: 6px 12px; border-radius: 20px; font-size: 0.85em; font-weight: 600; white-space: nowrap;">
                        ${policy.type}
                    </span>
                </td>
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

// ============================================================================
// NAT Policies Functions
// ============================================================================

async function loadNatPolicies() {
    try {
        const response = await fetch('/api/nat-policies');
        const data = await response.json();

        if (data.status === 'success') {
            displayNatPolicies(data.nat_policies);
        } else {
            showNatPoliciesError(data.message || 'Failed to load NAT policies');
        }
    } catch (error) {
        console.error('Error loading NAT policies:', error);
        showNatPoliciesError('Connection error: ' + error.message);
    }
}

function displayNatPolicies(natPolicies) {
    const container = document.getElementById('natPoliciesTable');

    if (natPolicies.length === 0) {
        container.innerHTML = `
            <div style="background: white; border-radius: 12px; padding: 40px; text-align: center; box-shadow: 0 5px 15px rgba(0,0,0,0.15); border-top: 4px solid #ff6600;">
                <div style="font-size: 1.2em; color: #666; margin-bottom: 10px;">No NAT policies found</div>
                <div style="font-size: 0.9em; color: #999;">NAT policies will appear here once configured on the firewall.</div>
            </div>
        `;
        return;
    }

    let html = `
        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.15); border-top: 4px solid #ff6600;">
            <div style="margin-bottom: 15px; padding: 12px; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-left: 4px solid #3b82f6; border-radius: 6px;">
                <div style="font-weight: 600; color: #1e40af; margin-bottom: 5px;">Total NAT Policies: ${natPolicies.length}</div>
                <div style="font-size: 0.85em; color: #3b82f6;">Source NAT, Destination NAT, and Dynamic IP & Port rules</div>
            </div>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #ff6600; background: #f9f9f9;">
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Rule Name</th>
                        <th style="padding: 12px; text-align: center; color: #333; font-weight: 600;">Type</th>
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Source Zone</th>
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Destination Zone</th>
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Source Address</th>
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Destination Address</th>
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Service</th>
                        <th style="padding: 12px; text-align: left; color: #333; font-weight: 600;">Translation</th>
                    </tr>
                </thead>
                <tbody>
    `;

    natPolicies.forEach((policy, index) => {
        const bgColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';

        // Color code the NAT type
        let typeColor = '#3b82f6';
        let typeBgColor = '#dbeafe';
        if (policy.type.includes('Destination')) {
            typeColor = '#059669';
            typeBgColor = '#d1fae5';
        } else if (policy.type.includes('Dynamic')) {
            typeColor = '#f59e0b';
            typeBgColor = '#fef3c7';
        }

        // Format translation info
        let translationInfo = policy.translated_address;
        if (policy.translated_port && policy.translated_port !== 'N/A') {
            translationInfo += `:${policy.translated_port}`;
        }

        html += `
            <tr style="background: ${bgColor}; border-bottom: 1px solid #e5e7eb; transition: background 0.2s;" onmouseover="this.style.background='#fef3c7'" onmouseout="this.style.background='${bgColor}'">
                <td style="padding: 12px; color: #333; font-weight: 500;">
                    <div style="display: flex; align-items: center;">
                        <div style="width: 4px; height: 24px; background: #ff6600; margin-right: 10px; border-radius: 2px;"></div>
                        ${policy.name}
                    </div>
                </td>
                <td style="padding: 12px; text-align: center;">
                    <span style="background: ${typeBgColor}; color: ${typeColor}; padding: 6px 12px; border-radius: 20px; font-size: 0.85em; font-weight: 600; white-space: nowrap;">
                        ${policy.type}
                    </span>
                </td>
                <td style="padding: 12px; color: #666; font-size: 0.9em;">
                    <span style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-family: monospace;">
                        ${policy.source_zone}
                    </span>
                </td>
                <td style="padding: 12px; color: #666; font-size: 0.9em;">
                    <span style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-family: monospace;">
                        ${policy.destination_zone}
                    </span>
                </td>
                <td style="padding: 12px; color: #666; font-size: 0.85em; font-family: monospace;">${policy.source_address}</td>
                <td style="padding: 12px; color: #666; font-size: 0.85em; font-family: monospace;">${policy.destination_address}</td>
                <td style="padding: 12px; color: #666; font-size: 0.85em;">
                    <span style="background: #fef3c7; color: #f59e0b; padding: 4px 8px; border-radius: 4px; font-weight: 500;">
                        ${policy.service}
                    </span>
                </td>
                <td style="padding: 12px; color: #059669; font-size: 0.85em; font-family: monospace; font-weight: 600;">${translationInfo}</td>
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

function showNatPoliciesError(message) {
    const container = document.getElementById('natPoliciesTable');
    container.innerHTML = `
        <div style="background: #fee2e2; border-left: 4px solid #dc2626; border-radius: 8px; padding: 20px; color: #991b1b;">
            <div style="font-weight: 600; margin-bottom: 5px;">Error Loading NAT Policies</div>
            <div style="font-size: 0.9em;">${message}</div>
        </div>
    `;
}

// Setup policy tab switching
function setupPolicyTabs() {
    const tabs = document.querySelectorAll('.policy-tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');

            // Update tab buttons
            tabs.forEach(t => {
                if (t === tab) {
                    t.style.background = 'linear-gradient(135deg, #ff6600 0%, #ff9933 100%)';
                    t.classList.add('active');
                } else {
                    t.style.background = '#666';
                    t.classList.remove('active');
                }
            });

            // Update tab content
            const securityTab = document.getElementById('security-policies-tab');
            const natTab = document.getElementById('nat-policies-tab');

            if (tabName === 'security') {
                securityTab.style.display = 'block';
                natTab.style.display = 'none';
            } else if (tabName === 'nat') {
                natTab.style.display = 'block';
                securityTab.style.display = 'none';

                // Load NAT policies if not already loaded
                loadNatPolicies();
            }
        });
    });
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
        console.error('Error loading software versions:', error);
        loadingDiv.style.display = 'none';
        tableDiv.style.display = 'none';
        errorDiv.textContent = 'Failed to load software updates: ' + error.message;
        errorDiv.style.display = 'block';
    }
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

            // Display MAC vendor database info if available
            console.log('MAC vendor DB info from settings:', data.settings.mac_vendor_db);
            if (data.settings.mac_vendor_db) {
                updateMacVendorDbInfo(data.settings.mac_vendor_db);
            } else {
                // Hide the info div if no database is uploaded
                const infoDiv = document.getElementById('macVendorDbInfo');
                if (infoDiv) {
                    infoDiv.style.display = 'none';
                }
            }

            // Monitored interface will be loaded from the selected device in updateDeviceSelector
        }
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
    document.getElementById('refreshInterval').value = 60;
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

            // Load MAC vendor database info on startup (for settings page)
            if (data.settings.mac_vendor_db) {
                updateMacVendorDbInfo(data.settings.mac_vendor_db);
            }
        }
    } catch (error) {
        console.error('Error loading initial settings:', error);
    }

    // Setup event listeners
    document.getElementById('saveSettings').addEventListener('click', saveSettingsData);
    document.getElementById('resetSettings').addEventListener('click', resetSettingsData);
    document.getElementById('uploadMacVendorDb').addEventListener('click', uploadMacVendorDatabase);
}

async function uploadMacVendorDatabase() {
    const fileInput = document.getElementById('macVendorDbFile');
    const statusElement = document.getElementById('macVendorDbStatus');
    const uploadButton = document.getElementById('uploadMacVendorDb');

    try {
        if (!fileInput.files || fileInput.files.length === 0) {
            statusElement.textContent = 'Please select a file first';
            statusElement.style.color = '#dc2626';
            statusElement.style.display = 'block';
            return;
        }

        const file = fileInput.files[0];
        if (!file.name.endsWith('.json')) {
            statusElement.textContent = 'Please select a JSON file';
            statusElement.style.color = '#dc2626';
            statusElement.style.display = 'block';
            return;
        }

        // Show uploading status
        uploadButton.disabled = true;
        uploadButton.textContent = 'Uploading...';
        statusElement.textContent = 'Uploading database...';
        statusElement.style.color = '#ff6600';
        statusElement.style.display = 'block';

        // Upload file
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/mac-vendor-db', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.status === 'success') {
            statusElement.textContent = data.message;
            statusElement.style.color = '#10b981';
            fileInput.value = ''; // Clear file input

            // Update the database info display
            updateMacVendorDbInfo({
                uploaded: true,
                filename: data.filename,
                entries: data.entries,
                file_size: data.file_size,
                upload_time: data.upload_time
            });
        } else {
            statusElement.textContent = 'Error: ' + data.message;
            statusElement.style.color = '#dc2626';
        }

    } catch (error) {
        console.error('Error uploading MAC vendor database:', error);
        statusElement.textContent = 'Upload failed: ' + error.message;
        statusElement.style.color = '#dc2626';
        statusElement.style.display = 'block';
    } finally {
        uploadButton.disabled = false;
        uploadButton.textContent = 'Upload';
    }
}

function updateMacVendorDbInfo(dbInfo) {
    const infoDiv = document.getElementById('macVendorDbInfo');
    const statusElement = document.getElementById('macVendorDbStatus');

    if (!dbInfo || !dbInfo.uploaded) {
        infoDiv.style.display = 'none';
        // Clear any previous status message
        if (statusElement) {
            statusElement.style.display = 'none';
            statusElement.textContent = '';
        }
        return;
    }

    // Show the info box
    infoDiv.style.display = 'block';

    // Show a success status message
    if (statusElement) {
        statusElement.style.display = 'block';
        statusElement.style.color = '#10b981';
        statusElement.textContent = '✓ Database loaded and active';
    }

    // Update fields
    document.getElementById('dbFilename').textContent = dbInfo.filename || '-';
    document.getElementById('dbEntries').textContent = dbInfo.entries ? dbInfo.entries.toLocaleString() : '-';

    // Format file size
    const sizeInKB = dbInfo.file_size ? (dbInfo.file_size / 1024).toFixed(2) : 0;
    const sizeInMB = dbInfo.file_size ? (dbInfo.file_size / (1024 * 1024)).toFixed(2) : 0;
    const sizeDisplay = sizeInMB > 1 ? `${sizeInMB} MB` : `${sizeInKB} KB`;
    document.getElementById('dbFileSize').textContent = sizeDisplay;

    // Format upload time and age
    if (dbInfo.upload_time) {
        const uploadDate = new Date(dbInfo.upload_time);
        document.getElementById('dbUploadTime').textContent = uploadDate.toLocaleString();

        // Calculate and display age
        const now = new Date();
        const diffMs = now - uploadDate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        let ageText = '';
        if (diffMins < 1) {
            ageText = '(just now)';
        } else if (diffMins < 60) {
            ageText = `(${diffMins} min${diffMins !== 1 ? 's' : ''} ago)`;
        } else if (diffHours < 24) {
            ageText = `(${diffHours} hour${diffHours !== 1 ? 's' : ''} ago)`;
        } else if (diffDays < 30) {
            ageText = `(${diffDays} day${diffDays !== 1 ? 's' : ''} ago)`;
        } else {
            const diffMonths = Math.floor(diffDays / 30);
            ageText = `(${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago)`;
        }

        document.getElementById('dbAge').textContent = ageText;
    } else {
        document.getElementById('dbUploadTime').textContent = '-';
        document.getElementById('dbAge').textContent = '';
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init();
        initSidebarResize();
        initPageNavigation();
        initDeviceSelector();
        setupPolicyTabs();
    });
} else {
    init();
    initSidebarResize();
    initPageNavigation();
    initDeviceSelector();
    setupPolicyTabs();
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
                } else if (pageId === 'connected-devices-content') {
                    console.log('Reloading connected devices for new device...');
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

    // Update group options before showing modal
    updateGroupOptions();

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

// ============================================================================
// Site Monitor Functions
// ============================================================================

async function loadSiteMonitor() {
    console.log('Loading site monitor...');
    const loadingDiv = document.getElementById('siteMonitorLoading');
    const tableDiv = document.getElementById('siteMonitorTable');
    const emptyDiv = document.getElementById('siteMonitorEmpty');
    const errorDiv = document.getElementById('siteMonitorErrorMessage');

    // Show loading state
    loadingDiv.style.display = 'block';
    tableDiv.style.display = 'none';
    emptyDiv.style.display = 'none';
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';

    try {
        const response = await fetch('/api/devices/status-all');
        const data = await response.json();

        if (data.status === 'success') {
            loadingDiv.style.display = 'none';

            if (data.devices.length === 0) {
                emptyDiv.style.display = 'block';
            } else {
                renderSiteMonitorTable(data.devices);
                tableDiv.style.display = 'block';
            }
        } else {
            throw new Error(data.message || 'Failed to load device status');
        }
    } catch (error) {
        console.error('Error loading site monitor:', error);
        loadingDiv.style.display = 'none';
        errorDiv.textContent = 'Error loading device status: ' + error.message;
        errorDiv.style.display = 'block';
    }
}

function renderSiteMonitorTable(devices) {
    const tbody = document.getElementById('siteMonitorTableBody');
    tbody.innerHTML = '';

    devices.forEach(device => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #e9ecef';

        // Status column with colored indicator
        const statusCell = document.createElement('td');
        statusCell.style.padding = '12px';

        let statusColor = '#28a745'; // green for up
        let statusText = '● Online';
        let statusBg = 'rgba(40, 167, 69, 0.1)';

        if (device.status === 'down' || device.status === 'error') {
            statusColor = '#dc3545'; // red for down
            statusText = '● Offline';
            statusBg = 'rgba(220, 53, 69, 0.1)';
        } else if (device.status === 'timeout') {
            statusColor = '#ffc107'; // yellow for timeout
            statusText = '● Timeout';
            statusBg = 'rgba(255, 193, 7, 0.1)';
        } else if (device.status === 'unknown') {
            statusColor = '#6c757d'; // gray for unknown
            statusText = '● Unknown';
            statusBg = 'rgba(108, 117, 125, 0.1)';
        }

        statusCell.innerHTML = `<span style="color: ${statusColor}; background: ${statusBg}; padding: 6px 12px; border-radius: 4px; font-weight: 600; font-size: 0.9em;">${statusText}</span>`;
        row.appendChild(statusCell);

        // Name column
        const nameCell = document.createElement('td');
        nameCell.style.padding = '12px';
        nameCell.textContent = device.name;
        nameCell.style.fontWeight = '600';
        row.appendChild(nameCell);

        // IP column
        const ipCell = document.createElement('td');
        ipCell.style.padding = '12px';
        ipCell.textContent = device.ip;
        ipCell.style.fontFamily = 'monospace';
        row.appendChild(ipCell);

        // Hostname column
        const hostnameCell = document.createElement('td');
        hostnameCell.style.padding = '12px';
        hostnameCell.textContent = device.hostname;
        row.appendChild(hostnameCell);

        // Model column
        const modelCell = document.createElement('td');
        modelCell.style.padding = '12px';
        modelCell.textContent = device.model;
        modelCell.style.fontSize = '0.9em';
        row.appendChild(modelCell);

        // Uptime column
        const uptimeCell = document.createElement('td');
        uptimeCell.style.padding = '12px';
        uptimeCell.textContent = device.uptime;
        uptimeCell.style.fontSize = '0.9em';
        row.appendChild(uptimeCell);

        // Version column
        const versionCell = document.createElement('td');
        versionCell.style.padding = '12px';
        versionCell.textContent = device.sw_version;
        versionCell.style.fontSize = '0.9em';
        versionCell.style.color = '#666';
        row.appendChild(versionCell);

        tbody.appendChild(row);
    });
}

function refreshSiteMonitor() {
    console.log('Refreshing site monitor...');
    loadSiteMonitor();
}
