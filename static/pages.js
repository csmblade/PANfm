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

