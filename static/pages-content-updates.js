/**
 * Content Update Orchestration Module
 * Handles App & Threat, Antivirus, WildFire content updates
 *
 * User Requirements:
 * - Download and install as combined workflow
 * - Same modal design as PAN-OS upgrades
 * - No reboot required
 *
 * File created per .clinerules to keep other files under size limits
 */

// Global state
let contentUpdateState = {
    currentStep: null,  // 'check', 'download', 'install', 'complete'
    downloadJobId: null,
    installJobId: null,
    pollInterval: null,
    updateInfo: null
};

/**
 * Check for content updates
 * Called when user clicks "Check for Updates" button
 */
async function checkContentUpdates() {
    const btn = document.getElementById('checkContentUpdatesBtn');
    const info = document.getElementById('contentUpdateInfo');

    if (!btn || !info) {
        console.error('Content update UI elements not found');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Checking...';
    info.style.display = 'none';

    try {
        console.log('Checking for content updates...');
        const response = await fetch('/api/content-updates/check');
        const data = await response.json();

        console.log('Content update check response:', data);

        if (data.status === 'success') {
            contentUpdateState.updateInfo = data;
            displayContentUpdateStatus(data);
        } else {
            info.innerHTML = `<p style="color: #dc3545; margin-top: 10px;">❌ Error: ${data.message}</p>`;
            info.style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking content updates:', error);
        info.innerHTML = `<p style="color: #dc3545; margin-top: 10px;">❌ Error: ${error.message}</p>`;
        info.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Check for Updates';
    }
}

/**
 * Display content update status
 */
function displayContentUpdateStatus(data) {
    const info = document.getElementById('contentUpdateInfo');

    if (data.needs_update) {
        info.innerHTML = `
            <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin-top: 15px;">
                <p style="margin: 0 0 10px 0; color: #856404; font-weight: 600; font-family: var(--font-primary);">
                    📥 Content Update Available
                </p>
                <p style="margin: 0 0 5px 0; color: #666; font-family: var(--font-secondary); font-size: 0.9em;">
                    <strong>Current Version:</strong> ${data.current_version}
                </p>
                <p style="margin: 0 0 15px 0; color: #666; font-family: var(--font-secondary); font-size: 0.9em;">
                    <strong>Latest Version:</strong> ${data.latest_version}
                </p>
                <button onclick="startContentUpdate()" style="padding: 8px 16px; background: linear-gradient(135deg, #FA582D 0%, #FF7A55 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-family: var(--font-primary); box-shadow: 0 2px 4px rgba(250, 88, 45, 0.3);">
                    Download & Install Update
                </button>
            </div>
        `;
    } else {
        info.innerHTML = `
            <div style="background: #d4edda; border: 1px solid #28a745; border-radius: 6px; padding: 15px; margin-top: 15px;">
                <p style="margin: 0; color: #155724; font-weight: 600; font-family: var(--font-primary);">
                    ✓ Content is up to date
                </p>
                <p style="margin: 5px 0 0 0; color: #155724; font-family: var(--font-secondary); font-size: 0.9em;">
                    Current Version: ${data.current_version}
                </p>
            </div>
        `;
    }

    info.style.display = 'block';
}

/**
 * Start content update workflow
 * Combined download + install process
 */
async function startContentUpdate() {
    console.log('Starting content update workflow...');

    // Show modal
    showContentUpdateModal();

    // Step 1: Download
    contentUpdateState.currentStep = 'download';
    updateContentModalMessage('📥 Downloading content update...', '#FA582D');

    try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

        const downloadResponse = await fetch('/api/content-updates/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            }
        });

        const downloadData = await downloadResponse.json();
        console.log('Download response:', downloadData);

        if (downloadData.status === 'success') {
            contentUpdateState.downloadJobId = downloadData.jobid;

            // Start polling download job
            await pollContentJob(downloadData.jobid, 'download');

        } else {
            throw new Error(downloadData.message || 'Download failed');
        }

    } catch (error) {
        console.error('Content update error:', error);
        updateContentModalMessage(`❌ Error: ${error.message}`, '#dc3545');

        setTimeout(() => {
            hideContentUpdateModal();
        }, 3000);
    }
}

/**
 * Poll job status
 * Reuses existing /api/panos-upgrade/job-status endpoint
 */
async function pollContentJob(jobId, stepName) {
    return new Promise((resolve, reject) => {
        let pollCount = 0;
        const maxPolls = 120; // 30 minutes

        console.log(`Starting to poll job ${jobId} for step: ${stepName}`);

        const pollInterval = setInterval(async () => {
            pollCount++;

            try {
                const response = await fetch(`/api/panos-upgrade/job-status/${jobId}`);
                const data = await response.json();

                if (data.status === 'success') {
                    const job = data.job;

                    console.log(`Job ${jobId} status:`, job);

                    // Update progress
                    updateContentModalProgress(stepName, job.progress, job.status);

                    if (job.status === 'FIN') {
                        clearInterval(pollInterval);

                        if (job.result === 'OK') {
                            console.log(`${stepName} completed successfully`);

                            if (stepName === 'download') {
                                // Download complete, start install
                                resolve();
                                await startContentInstall();
                            } else if (stepName === 'install') {
                                // Install complete, no reboot needed
                                resolve();
                                handleContentUpdateComplete();
                            }
                        } else {
                            const error = job.details || 'Job failed';
                            clearInterval(pollInterval);
                            reject(new Error(error));
                        }
                    }
                }
            } catch (error) {
                console.error('Polling error:', error);
                // Continue polling despite errors
            }

            if (pollCount >= maxPolls) {
                clearInterval(pollInterval);
                reject(new Error('Timeout waiting for job completion'));
            }
        }, 15000);
    });
}

/**
 * Start install step after download completes
 */
async function startContentInstall() {
    console.log('Starting content install...');

    contentUpdateState.currentStep = 'install';
    updateContentModalMessage('📦 Installing content update...', '#FA582D');

    try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

        const installResponse = await fetch('/api/content-updates/install', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({ version: 'latest' })
        });

        const installData = await installResponse.json();
        console.log('Install response:', installData);

        if (installData.status === 'success') {
            contentUpdateState.installJobId = installData.jobid;

            // Start polling install job
            await pollContentJob(installData.jobid, 'install');

        } else {
            throw new Error(installData.message || 'Install failed');
        }

    } catch (error) {
        console.error('Install error:', error);
        updateContentModalMessage(`❌ Install Error: ${error.message}`, '#dc3545');

        setTimeout(() => {
            hideContentUpdateModal();
        }, 3000);
    }
}

/**
 * Handle content update completion
 * No reboot needed for content updates
 */
function handleContentUpdateComplete() {
    console.log('Content update completed successfully');

    contentUpdateState.currentStep = 'complete';
    updateContentModalMessage('✅ Content Update Complete!', '#28a745');

    // Update the display
    setTimeout(() => {
        hideContentUpdateModal();

        // Refresh components table
        if (typeof loadSoftwareUpdates === 'function') {
            loadSoftwareUpdates();
        }

        // Refresh content update status
        checkContentUpdates();

        alert('✓ Content update completed successfully!\n\nThe firewall now has the latest content version (App & Threat, Antivirus, WildFire).');
    }, 2000);
}

/**
 * Show update progress modal (same design as PAN-OS)
 */
function showContentUpdateModal() {
    let modal = document.getElementById('contentUpdateModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'contentUpdateModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        modal.innerHTML = `
            <div style="background: white; border-radius: 12px; padding: 30px; max-width: 500px; width: 90%; box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
                <h2 style="margin: 0 0 20px 0; color: #333; font-family: var(--font-primary);">Content Update Progress</h2>
                <div id="contentUpdateModalMessage" style="padding: 20px; background: #f8f9fa; border-radius: 8px; margin-bottom: 20px; font-family: var(--font-secondary);">
                    Starting update...
                </div>
                <div id="contentUpdateModalProgress" style="font-family: var(--font-secondary); color: #666;"></div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
}

/**
 * Update modal message
 */
function updateContentModalMessage(message, color) {
    const msgDiv = document.getElementById('contentUpdateModalMessage');
    if (msgDiv) {
        msgDiv.textContent = message;
        msgDiv.style.color = color || '#333';
    }
}

/**
 * Update modal progress
 */
function updateContentModalProgress(step, progress, status) {
    const progressDiv = document.getElementById('contentUpdateModalProgress');
    if (progressDiv) {
        progressDiv.innerHTML = `
            <p style="margin: 0 0 5px 0;"><strong>Step:</strong> ${step}</p>
            <p style="margin: 0 0 5px 0;"><strong>Progress:</strong> ${progress}%</p>
            <p style="margin: 0;"><strong>Status:</strong> ${status}</p>
        `;
    }
}

/**
 * Hide modal
 */
function hideContentUpdateModal() {
    const modal = document.getElementById('contentUpdateModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Initialize content updates UI
 * Called when Components tab loads
 */
function initContentUpdates() {
    console.log('Initializing content updates...');

    const checkBtn = document.getElementById('checkContentUpdatesBtn');
    if (checkBtn && !checkBtn.hasAttribute('data-initialized')) {
        checkBtn.addEventListener('click', checkContentUpdates);
        checkBtn.setAttribute('data-initialized', 'true');
        console.log('Content update button initialized');
    }
}

// Export functions
if (typeof window !== 'undefined') {
    window.initContentUpdates = initContentUpdates;
    window.checkContentUpdates = checkContentUpdates;
    window.startContentUpdate = startContentUpdate;
}
