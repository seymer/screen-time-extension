/**
 * Popup Script - Handles popup UI interactions and data display
 */

// DOM Elements
const elements = {
    totalTime: document.getElementById('totalTime'),
    currentSiteSection: document.getElementById('currentSiteSection'),
    siteFavicon: document.getElementById('siteFavicon'),
    siteDomain: document.getElementById('siteDomain'),
    siteStatus: document.getElementById('siteStatus'),
    sessionProgress: document.getElementById('sessionProgress'),
    sessionTime: document.getElementById('sessionTime'),
    sessionProgressBar: document.getElementById('sessionProgressBar'),
    sessionRemaining: document.getElementById('sessionRemaining'),
    dailyProgress: document.getElementById('dailyProgress'),
    dailyTime: document.getElementById('dailyTime'),
    dailyProgressBar: document.getElementById('dailyProgressBar'),
    dailyRemaining: document.getElementById('dailyRemaining'),
    sessionsCount: document.getElementById('sessionsCount'),
    sessionsText: document.getElementById('sessionsText'),
    blockedSection: document.getElementById('blockedSection'),
    blockedReason: document.getElementById('blockedReason'),
    blockedNextAvailable: document.getElementById('blockedNextAvailable'),
    topSitesList: document.getElementById('topSitesList'),
    trackingToggle: document.getElementById('trackingToggle'),
    trackingLabel: document.getElementById('trackingLabel'),
    settingsBtn: document.getElementById('settingsBtn'),
    dashboardBtn: document.getElementById('dashboardBtn'),
    dashboardBtnFooter: document.getElementById('dashboardBtnFooter'),
    toggleLimitBtn: document.getElementById('toggleLimitBtn'),
    limitForm: document.getElementById('limitForm'),
    limitInput: document.getElementById('limitInput'),
    saveLimitBtn: document.getElementById('saveLimitBtn'),
    removeLimitBtn: document.getElementById('removeLimitBtn')
};

// State
let updateInterval = null;
let currentDomain = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    init();
});

async function init() {
    setupEventListeners();
    await loadTodayStats();
    await loadCurrentSiteStatus();
    await loadLimitStatus();
    startAutoUpdate();
}

// Load today's statistics
async function loadTodayStats() {
    try {
        const stats = await chrome.runtime.sendMessage({ type: 'GET_TODAY_STATS' });

        if (!stats) {
            throw new Error('No stats received');
        }

        // Update total time
        elements.totalTime.textContent = stats.totalTimeFormatted || '0h 0m';

        // Update tracking toggle
        elements.trackingToggle.checked = stats.enabled;
        elements.trackingLabel.textContent = stats.enabled ? 'Tracking enabled' : 'Tracking paused';

        // Update top sites list
        updateTopSitesList(stats.topSites || []);

        // Note: currentDomain is set in loadCurrentSiteStatus from the actual tab URL,
        // not from background's tracked domain (stats.currentDomain)
    } catch (error) {
        console.error('Error loading today stats:', error);
        elements.totalTime.textContent = 'Error';
        elements.totalTime.title = error.message; // Show details on hover
    }
}

// Load current site status
async function loadCurrentSiteStatus() {
    try {
        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url) {
            elements.currentSiteSection.classList.add('hidden');
            currentDomain = null;
            return;
        }

        const domain = extractDomain(tab.url);

        if (!domain || isExcludedDomain(domain)) {
            elements.currentSiteSection.classList.add('hidden');
            currentDomain = null;
            return;
        }

        // Update currentDomain to match the actual tab domain (used for limit operations)
        currentDomain = domain;

        // Get status for this domain
        const status = await chrome.runtime.sendMessage({
            type: 'GET_STATUS',
            domain
        });

        updateCurrentSiteUI(domain, status, tab.favIconUrl);
    } catch (error) {
        console.error('Error loading current site status:', error);
        elements.currentSiteSection.classList.add('hidden');
        currentDomain = null;
    }
}

// Update current site UI
function updateCurrentSiteUI(domain, status, faviconUrl) {
    elements.currentSiteSection.classList.remove('hidden');
    elements.blockedSection.classList.add('hidden');

    // Set domain and favicon
    elements.siteDomain.textContent = domain;
    elements.siteFavicon.src = faviconUrl || `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    elements.siteFavicon.onerror = () => {
        elements.siteFavicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236366f1"><circle cx="12" cy="12" r="10"/></svg>';
    };

    // Check if blocked
    if (!status.allowed && status.hasLimits) {
        showBlockedStatus(status);
        return;
    }

    // Update status badge
    updateStatusBadge(status);

    // Update session progress
    if (status.hasLimits && status.sessionTimeRemaining !== null) {
        elements.sessionProgress.classList.remove('hidden');

        const sessionDuration = status.currentSessionDuration || 0;
        const sessionLimit = sessionDuration + (status.sessionTimeRemaining || 0);
        const sessionPercent = sessionLimit > 0 ? (sessionDuration / sessionLimit) * 100 : 0;

        elements.sessionTime.textContent = status.currentSessionDurationFormatted || '0m';
        elements.sessionProgressBar.style.width = `${Math.min(100, sessionPercent)}%`;
        elements.sessionRemaining.textContent = `${status.sessionTimeRemainingFormatted || '0m'} remaining`;

        // Update progress bar color based on time remaining
        updateProgressBarColor(elements.sessionProgressBar, status.sessionTimeRemaining);
    } else {
        elements.sessionProgress.classList.add('hidden');
    }

    // Update daily progress
    if (status.hasLimits && status.dailyTimeRemaining !== null) {
        elements.dailyProgress.classList.remove('hidden');

        const dailyUsed = status.totalTimeToday || 0;
        const dailyLimit = dailyUsed + (status.dailyTimeRemaining || 0);
        const dailyPercent = dailyLimit > 0 ? (dailyUsed / dailyLimit) * 100 : 0;

        elements.dailyTime.textContent = status.totalTimeTodayFormatted || '0m';
        elements.dailyProgressBar.style.width = `${Math.min(100, dailyPercent)}%`;
        elements.dailyRemaining.textContent = `${status.dailyTimeRemainingFormatted || '0m'} remaining today`;
    } else {
        elements.dailyProgress.classList.add('hidden');
        elements.dailyTime.textContent = status.totalTimeTodayFormatted || '0m';
    }

    // Update sessions count
    if (status.hasLimits && status.sessionsTotal) {
        elements.sessionsCount.classList.remove('hidden');
        updateSessionDots(status.sessionsUsed, status.sessionsTotal, status.inSession);
        elements.sessionsText.textContent = `${status.sessionsRemaining || 0} session${status.sessionsRemaining !== 1 ? 's' : ''} remaining`;
    } else {
        elements.sessionsCount.classList.add('hidden');
    }
}

// Show blocked status
function showBlockedStatus(status) {
    elements.currentSiteSection.classList.add('hidden');
    elements.blockedSection.classList.remove('hidden');

    elements.blockedReason.textContent = status.reasonText || 'Access Blocked';

    if (status.nextAvailable) {
        const nextTime = new Date(status.nextAvailable);
        elements.blockedNextAvailable.textContent = `Available at ${formatTimeOfDay(nextTime)}`;
    } else {
        elements.blockedNextAvailable.textContent = 'Available tomorrow';
    }
}

// Update status badge
function updateStatusBadge(status) {
    elements.siteStatus.className = 'status-badge';

    if (status.status === 'yellow' || status.isWarning) {
        elements.siteStatus.classList.add('status-yellow');
        elements.siteStatus.textContent = 'Ending Soon';
    } else if (status.status === 'red') {
        elements.siteStatus.classList.add('status-red');
        elements.siteStatus.textContent = 'Limit Reached';
    } else if (status.status === 'gray') {
        elements.siteStatus.classList.add('status-gray');
        elements.siteStatus.textContent = 'Blocked Hours';
    } else {
        elements.siteStatus.classList.add('status-green');
        elements.siteStatus.textContent = 'Active';
    }
}

// Update progress bar color
function updateProgressBarColor(progressBar, timeRemaining) {
    progressBar.classList.remove('progress-bar-warning', 'progress-bar-danger');

    if (timeRemaining !== null) {
        if (timeRemaining <= 60) { // Last minute
            progressBar.classList.add('progress-bar-danger');
        } else if (timeRemaining <= 300) { // Last 5 minutes
            progressBar.classList.add('progress-bar-warning');
        }
    }
}

// Update session dots
function updateSessionDots(used, total, inSession) {
    const container = elements.sessionsCount.querySelector('.sessions-dots');
    container.innerHTML = '';

    for (let i = 0; i < total; i++) {
        const dot = document.createElement('div');
        dot.className = 'session-dot';

        if (i < used - (inSession ? 1 : 0)) {
            dot.classList.add('used');
        } else if (i === used - 1 && inSession) {
            dot.classList.add('current');
        }

        container.appendChild(dot);
    }
}

// Update top sites list
function updateTopSitesList(sites) {
    if (!sites.length) {
        elements.topSitesList.innerHTML = '<div class="empty-state">No activity yet today</div>';
        return;
    }

    elements.topSitesList.innerHTML = sites.map(site => `
    <div class="site-item">
      <img class="site-favicon" 
           src="https://www.google.com/s2/favicons?domain=${site.domain}&sz=32" 
           alt=""
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%236366f1%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22/></svg>'">
      <span class="site-name">${site.domain}</span>
      <span class="site-time">${formatTime(site.time)}</span>
    </div>
  `).join('');
}

// Setup event listeners
function setupEventListeners() {
    // Tracking toggle
    elements.trackingToggle.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await chrome.runtime.sendMessage({ type: 'TOGGLE_TRACKING', enabled });
        elements.trackingLabel.textContent = enabled ? 'Tracking enabled' : 'Tracking paused';
    });

    // Settings button
    elements.settingsBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
    });

    // Dashboard buttons
    const openDashboard = () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    };

    elements.dashboardBtn.addEventListener('click', openDashboard);
    elements.dashboardBtnFooter.addEventListener('click', openDashboard);

    // Limit Controls
    elements.toggleLimitBtn.addEventListener('click', () => {
        elements.limitForm.classList.toggle('hidden');
        elements.toggleLimitBtn.classList.toggle('active');
        if (!elements.limitForm.classList.contains('hidden')) {
            elements.limitInput.focus();
        }
    });

    elements.saveLimitBtn.addEventListener('click', saveLimit);
    elements.removeLimitBtn.addEventListener('click', removeLimit);

    // Allow enter key to save
    elements.limitInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveLimit();
    });
}

// Load Limit Status
async function loadLimitStatus() {
    if (!currentDomain) return;

    try {
        const { limits } = await chrome.storage.local.get('limits');
        const limit = limits?.[currentDomain];

        if (limit && limit.dailyTotal) {
            elements.toggleLimitBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2"/>
                </svg>
                Edit Limit
            `;
            elements.limitInput.value = Math.round(limit.dailyTotal / 60);
            elements.removeLimitBtn.classList.remove('hidden');
        } else {
            elements.toggleLimitBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
                Set Daily Limit
            `;
            elements.limitInput.value = '';
            elements.removeLimitBtn.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error loading limit status:', error);
    }
}

// Save Limit
async function saveLimit() {
    const minutes = parseInt(elements.limitInput.value);

    if (!currentDomain) return;
    if (isNaN(minutes) || minutes < 1) {
        // Simple shake animation or validation feedback could go here
        return;
    }

    try {
        const { limits = {} } = await chrome.storage.local.get('limits');

        const status = await chrome.runtime.sendMessage({
            type: 'GET_STATUS',
            domain: currentDomain
        });
        const currentUsage = status.totalTimeToday || 0;
        const todayKey = new Date().toISOString().split('T')[0];

        limits[currentDomain] = {
            ...limits[currentDomain],
            dailyTotal: minutes * 60, // Convert to seconds
            usageOffset: {
                date: todayKey,
                duration: currentUsage
            },
            enforcement: {
                hardBlock: true,
                showWarnings: true,
                emergencyOverride: false,
                maxOverridesPerDay: 2,
                ...limits[currentDomain]?.enforcement
            }
        };

        await chrome.storage.local.set({ limits });

        // Hide form and reload status
        elements.limitForm.classList.add('hidden');
        await loadLimitStatus();
        await loadCurrentSiteStatus();

        // Notify background to re-check limits immediately
        chrome.runtime.sendMessage({ type: 'LIMITS_UPDATED' });

    } catch (error) {
        console.error('Error saving limit:', error);
    }
}

// Remove Limit
async function removeLimit() {
    if (!currentDomain) return;

    try {
        const { limits = {} } = await chrome.storage.local.get('limits');

        if (limits[currentDomain]) {
            delete limits[currentDomain];
            await chrome.storage.local.set({ limits });

            // Hide form and reload status
            elements.limitForm.classList.add('hidden');
            await loadLimitStatus();
            await loadCurrentSiteStatus();

            // Notify background to re-check limits immediately
            chrome.runtime.sendMessage({ type: 'LIMITS_UPDATED' });
        }
    } catch (error) {
        console.error('Error removing limit:', error);
    }
}

// Start auto-update timer
function startAutoUpdate() {
    updateInterval = setInterval(async () => {
        await loadTodayStats();
        await loadCurrentSiteStatus();
    }, 5000); // Update every 5 seconds
}

// Utility functions
function extractDomain(url) {
    try {
        const urlObj = new URL(url);

        // Only allow http and https protocols
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            return null;
        }

        return urlObj.hostname.replace('www.', '');
    } catch {
        return null;
    }
}

function isExcludedDomain(domain) {
    const excluded = ['chrome.google.com', 'extensions', 'newtab', 'devtools'];
    return excluded.some(ex => domain.includes(ex));
}

function formatTime(seconds) {
    if (seconds < 60) {
        return `${Math.floor(seconds)}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

function formatTimeOfDay(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Cleanup on popup close
window.addEventListener('unload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});
