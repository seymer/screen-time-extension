/**
 * Blocked Page Script - Handles countdown, stats display, and override requests
 */

// DOM Elements
const elements = {
    blockedDomain: document.getElementById('blockedDomain'),
    blockedReason: document.getElementById('blockedReason'),
    countdownSection: document.getElementById('countdownSection'),
    countdownHours: document.getElementById('countdownHours'),
    countdownMinutes: document.getElementById('countdownMinutes'),
    countdownSeconds: document.getElementById('countdownSeconds'),
    statTimeSpent: document.getElementById('statTimeSpent'),
    statSessions: document.getElementById('statSessions'),
    statLimit: document.getElementById('statLimit'),
    motivationText: document.getElementById('motivationText'),
    dashboardBtn: document.getElementById('dashboardBtn'),
    modifyBtn: document.getElementById('modifyBtn'),
    overrideSection: document.getElementById('overrideSection'),
    overrideBtn: document.getElementById('overrideBtn'),
    overrideRemaining: document.getElementById('overrideRemaining')
};

// State
let domain = '';
let reason = '';
let nextAvailable = null;
let countdownInterval = null;

// Motivational messages
const motivationalMessages = [
    "Taking breaks helps you stay focused and productive. Use this time to rest your eyes!",
    "Great things happen when you give yourself time to recharge. Take a breather!",
    "Your future self will thank you for taking this break. Stay strong!",
    "Every break is an opportunity to come back refreshed. You've got this!",
    "Step away, stretch, breathe. Your mind and body will thank you.",
    "Balance is key. This break is part of your journey to better digital wellness.",
    "Use this time wisely - maybe take a walk, grab some water, or just relax.",
    "Remember: Screen time limits are about making intentional choices, not restrictions."
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    parseUrlParams();
    loadStats();
    setupEventListeners();
    startCountdown();
    setMotivationalMessage();
});

// Parse URL parameters
function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);

    domain = params.get('domain') || 'Unknown';
    reason = params.get('reason') || 'limit_reached';
    const reasonText = params.get('reasonText') || getReasonText(reason);
    const nextAvailableParam = params.get('nextAvailable');

    if (nextAvailableParam) {
        nextAvailable = parseInt(nextAvailableParam);
    }

    // Update UI
    elements.blockedDomain.textContent = domain;
    elements.blockedReason.textContent = reasonText;

    // Apply body class for styling
    if (reason === 'blocked_time_range') {
        document.body.classList.add('blocked-time-range');
    } else if (reason === 'break_interval_required') {
        document.body.classList.add('break-required');
    }
}

// Get human-readable reason text
function getReasonText(reason) {
    const reasons = {
        'daily_limit_reached': 'Your daily time limit has been reached',
        'session_limit_reached': 'Your session time limit has been reached',
        'session_count_exceeded': 'All sessions have been used today',
        'break_interval_required': 'Break time required between sessions',
        'blocked_time_range': 'Access is blocked during this time period'
    };
    return reasons[reason] || 'Your screen time limit has been reached';
}

// Load stats from storage
async function loadStats() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'GET_STATUS',
            domain
        });

        if (response) {
            elements.statTimeSpent.textContent = response.totalTimeTodayFormatted || '0m';
            elements.statSessions.textContent = response.sessionsUsed || 0;

            if (response.limits?.dailyTotal) {
                elements.statLimit.textContent = formatTime(response.limits.dailyTotal);
            }

            // Check if override is available
            if (response.limits?.enforcement?.emergencyOverride) {
                await checkOverrideAvailability();
            }
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Check if emergency override is available
async function checkOverrideAvailability() {
    try {
        const storage = await chrome.storage.local.get(['limits', 'todayOverrides']);
        const limit = storage.limits?.[domain];

        if (!limit?.enforcement?.emergencyOverride) {
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        const overrides = storage.todayOverrides || {};

        // Check if overrides are from today
        if (overrides._date !== today) {
            overrides[domain] = { count: 0, timestamps: [] };
        }

        const usedOverrides = overrides[domain]?.count || 0;
        const maxOverrides = limit.enforcement.maxOverridesPerDay || 2;
        const remaining = maxOverrides - usedOverrides;

        if (remaining > 0) {
            elements.overrideSection.classList.remove('hidden');
            elements.overrideRemaining.textContent = `(${remaining} left today)`;
        }
    } catch (error) {
        console.error('Error checking override availability:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    elements.dashboardBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    });

    elements.modifyBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
    });

    elements.overrideBtn.addEventListener('click', handleOverride);
}

// Handle override request
async function handleOverride() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'REQUEST_OVERRIDE',
            domain
        });

        if (response.success) {
            // Redirect back to the site
            window.location.href = `https://${domain}`;
        } else {
            alert(response.reason || 'Override not available');
        }
    } catch (error) {
        console.error('Error requesting override:', error);
        alert('Failed to request override');
    }
}

// Start countdown timer
function startCountdown() {
    if (!nextAvailable) {
        elements.countdownSection.style.display = 'none';
        return;
    }

    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

// Update countdown display
function updateCountdown() {
    const now = Date.now();
    const remaining = Math.max(0, nextAvailable - now);

    if (remaining === 0) {
        clearInterval(countdownInterval);
        // Show access restored message
        elements.countdownSection.innerHTML = `
      <p class="countdown-label" style="color: #10b981; font-size: 16px;">
        ✓ Access Restored!
      </p>
      <button id="continueBtn" class="btn btn-primary" style="margin-top: 16px;">
        Continue to ${domain}
      </button>
    `;
        
        // Attach event listener for continue button
        const continueBtn = document.getElementById('continueBtn');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                window.location.href = `https://${domain}`;
            });
        }
        return;
    }

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

    elements.countdownHours.textContent = hours.toString().padStart(2, '0');
    elements.countdownMinutes.textContent = minutes.toString().padStart(2, '0');
    elements.countdownSeconds.textContent = seconds.toString().padStart(2, '0');
}

// Set random motivational message
function setMotivationalMessage() {
    const index = Math.floor(Math.random() * motivationalMessages.length);
    elements.motivationText.textContent = motivationalMessages[index];
}

// Format time helper
function formatTime(seconds) {
    if (!seconds) return '0m';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

// Cleanup on page unload
window.addEventListener('unload', () => {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
});
