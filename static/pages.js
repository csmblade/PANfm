/**
 * pages.js - Page-Specific Functions Module
 *
 * Handles page-specific functionality including:
 * - Software updates page
 * - Connected devices page
 * - Homepage modals (threat logs, top applications)
 * - Export functionality (CSV, XML)
 */

// Format timestamp for display (YYYY-MM-DD HH:MM:SS)
function formatTimestamp(timestamp) {
    if (!timestamp || timestamp === 'Never' || timestamp === 'N/A') {
        return 'N/A';
    }

    try {
        // Handle Palo Alto timestamp format: "YYYY/MM/DD HH:MM:SS"
        let dateStr = timestamp;
        if (typeof timestamp === 'string' && timestamp.includes('/')) {
            // Convert YYYY/MM/DD to YYYY-MM-DD for parsing
            dateStr = timestamp.replace(/\//g, '-');
        }

        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            return 'N/A';
        }

        // Format to match firewall: YYYY-MM-DD HH:MM:SS
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (e) {
        return 'N/A';
    }
}

// Format timestamp to show how long ago (for threat last seen)
function formatDaysAgo(timestamp) {
    if (!timestamp || timestamp === 'N/A' || timestamp === 'Never') {
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
                        <tr style="background: linear-gradient(135deg, #FA582D 0%, #FF7A55 100%); color: white;">
                            <th style="padding: 15px; text-align: left; font-size: 1.1em; font-family: 'Roboto', sans-serif;">Component</th>
                            <th style="padding: 15px; text-align: left; font-size: 1.1em; font-family: 'Roboto', sans-serif;">Version</th>
                            <th style="padding: 15px; text-align: center; font-size: 1.1em; font-family: 'Roboto', sans-serif;">Downloaded</th>
                            <th style="padding: 15px; text-align: center; font-size: 1.1em; font-family: 'Roboto', sans-serif;">Current</th>
                            <th style="padding: 15px; text-align: center; font-size: 1.1em; font-family: 'Roboto', sans-serif;">Latest</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            // Add rows for each software component
            data.software.forEach((item, index) => {
                const bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
                tableHtml += `
                    <tr style="background: ${bgColor}; border-bottom: 1px solid #e0e0e0;">
                        <td style="padding: 15px; font-weight: 600; color: #333; font-family: 'Roboto', sans-serif;">${item.name}</td>
                        <td style="padding: 15px; color: #666; font-family: monospace;">${item.version}</td>
                        <td style="padding: 15px; text-align: center; color: ${item.downloaded === 'yes' ? '#28a745' : '#999'}; font-weight: 600; font-family: 'Roboto', sans-serif;">${item.downloaded}</td>
                        <td style="padding: 15px; text-align: center; color: ${item.current === 'yes' ? '#28a745' : '#999'}; font-weight: 600; font-family: 'Roboto', sans-serif;">${item.current}</td>
                        <td style="padding: 15px; text-align: center; color: ${item.latest === 'yes' ? '#28a745' : '#999'}; font-weight: 600; font-family: 'Roboto', sans-serif;">${item.latest}</td>
                    </tr>
                `;
            });

            tableHtml += `
                    </tbody>
                </table>
                <div style="margin-top: 15px; padding: 10px; background: #f0f0f0; border-radius: 8px; color: #666; font-size: 0.9em; font-family: 'Open Sans', sans-serif;">
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

// ============================================================================
// HOMEPAGE MODAL FUNCTIONS
// ============================================================================

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

// ============================================================================
// TECH SUPPORT FUNCTIONS
// ============================================================================

// Store job ID for polling
let techSupportJobId = null;
let techSupportPollingInterval = null;

async function generateTechSupport() {
    const statusDiv = document.getElementById('techSupportStatus');
    const downloadDiv = document.getElementById('techSupportDownload');
    const generateBtn = document.getElementById('generateTechSupportBtn');
    const statusText = document.getElementById('techSupportStatusText');
    const progressText = document.getElementById('techSupportProgressText');

    // Reset UI
    downloadDiv.style.display = 'none';
    statusDiv.style.display = 'block';
    generateBtn.disabled = true;
    generateBtn.style.opacity = '0.5';
    generateBtn.style.cursor = 'not-allowed';

    statusText.textContent = 'Generating tech support file...';
    progressText.textContent = 'Please wait, this may take several minutes.';

    try {
        // Get CSRF token
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

        // Request tech support file generation
        const response = await fetch('/api/tech-support/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            }
        });

        const data = await response.json();

        console.log('Tech support generation response:', data);

        if (data.status === 'success' && data.job_id) {
            techSupportJobId = data.job_id;
            statusText.textContent = 'Tech support file generation in progress...';
            progressText.textContent = `Job ID: ${data.job_id} - Checking status...`;

            // Start polling for job status
            startTechSupportPolling();
        } else {
            const errorMsg = data.message || 'Failed to generate tech support file';
            console.error('Tech support generation failed:', errorMsg, data);
            throw new Error(errorMsg);
        }
    } catch (error) {
        console.error('Error generating tech support file:', error);
        statusDiv.style.display = 'none';
        generateBtn.disabled = false;
        generateBtn.style.opacity = '1';
        generateBtn.style.cursor = 'pointer';

        const errorDiv = document.getElementById('techSupportErrorMessage');
        errorDiv.textContent = `Error: ${error.message}`;
        errorDiv.style.display = 'block';

        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

function startTechSupportPolling() {
    // Poll every 5 seconds
    techSupportPollingInterval = setInterval(checkTechSupportStatus, 5000);

    // Check immediately
    checkTechSupportStatus();
}

async function checkTechSupportStatus() {
    if (!techSupportJobId) return;

    const progressText = document.getElementById('techSupportProgressText');

    try {
        const response = await fetch(`/api/tech-support/status/${techSupportJobId}`);
        const data = await response.json();

        if (data.status === 'success') {
            const jobStatus = data.job_status;
            const progress = data.progress;

            progressText.textContent = `Status: ${jobStatus} - Progress: ${progress}%`;

            // Check if job is complete
            if (data.ready) {
                clearInterval(techSupportPollingInterval);
                techSupportPollingInterval = null;

                // Job is complete, get download URL
                getTechSupportDownloadUrl();
            }
        } else {
            throw new Error(data.message || 'Failed to check job status');
        }
    } catch (error) {
        console.error('Error checking tech support status:', error);
        clearInterval(techSupportPollingInterval);
        techSupportPollingInterval = null;

        const statusDiv = document.getElementById('techSupportStatus');
        const generateBtn = document.getElementById('generateTechSupportBtn');

        statusDiv.style.display = 'none';
        generateBtn.disabled = false;
        generateBtn.style.opacity = '1';
        generateBtn.style.cursor = 'pointer';

        const errorDiv = document.getElementById('techSupportErrorMessage');
        errorDiv.textContent = `Error: ${error.message}`;
        errorDiv.style.display = 'block';
    }
}

async function getTechSupportDownloadUrl() {
    const statusDiv = document.getElementById('techSupportStatus');
    const downloadDiv = document.getElementById('techSupportDownload');
    const generateBtn = document.getElementById('generateTechSupportBtn');
    const fileNameText = document.getElementById('techSupportFileName');
    const downloadLink = document.getElementById('techSupportDownloadLink');

    try {
        const response = await fetch(`/api/tech-support/download/${techSupportJobId}`);
        const data = await response.json();

        if (data.status === 'success' && data.download_url) {
            // Hide status, show download
            statusDiv.style.display = 'none';
            downloadDiv.style.display = 'block';

            // Set download link and filename
            fileNameText.textContent = data.filename;
            downloadLink.href = data.download_url;

            // Re-enable generate button
            generateBtn.disabled = false;
            generateBtn.style.opacity = '1';
            generateBtn.style.cursor = 'pointer';
        } else {
            throw new Error(data.message || 'Failed to get download URL');
        }
    } catch (error) {
        console.error('Error getting download URL:', error);

        statusDiv.style.display = 'none';
        generateBtn.disabled = false;
        generateBtn.style.opacity = '1';
        generateBtn.style.cursor = 'pointer';

        const errorDiv = document.getElementById('techSupportErrorMessage');
        errorDiv.textContent = `Error: ${error.message}`;
        errorDiv.style.display = 'block';
    }
}

