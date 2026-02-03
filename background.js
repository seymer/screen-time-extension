/**
 * Background Service Worker - Main tracking and blocking logic
 * Handles tab tracking, idle detection, session management, and blocking enforcement
 */

import {
    initializeStorage,
    isTrackingEnabled,
    getTodayKey,
    getDateKey,
    extractDomain,
    updateDomainTime,
    getDailyUsage,
    getAllLimits,
    getSettings,
    cleanupOldData,
    startDomainSession,
    endDomainSession,
    updateCurrentSession,
    clearCurrentSession,
    getCurrentSessions,
    formatTime,
    setTrackingEnabled,
    getUsageForRange,
    getCategories,
    addOverride,
    cleanupOrphanedSessions
} from './utils/storage.js';

import {
    canAccessWebsite,
    startSession,
    endSession,
    getSessionStatus,
    canUseEmergencyOverride
} from './utils/sessionManager.js';

import {
    canPerformAction,
    logAudit,
    isLocked,
    lockSettings,
    getSecuritySettings,
    recordModification,
    verifyPassword,
    isPasswordSet,
    getAuditLog,
    canModifyLimits
} from './utils/security.js';

// Constants
const TRACKING_INTERVAL = 10000; // 10 seconds
const IDLE_THRESHOLD = 30; // 30 seconds

// State
let currentDomain = null;
let lastActiveTime = Date.now();
let isIdle = false;
let trackingIntervalId = null;
let lastDateKey = getTodayKey();
// Map<tabId, { frames: Set<frameId>, domain: String }>
const activeMediaTabs = new Map();

// =====================
// Initialization
// =====================

chrome.runtime.onInstalled.addListener(async () => {
    console.log('Screen Time Tracker installed');
    await initializeStorage();
    await setupAlarms();
    await cleanupOldData();
    await cleanupOrphanedSessions();
});

chrome.runtime.onStartup.addListener(async () => {
    console.log('Screen Time Tracker starting');
    await initializeStorage();
    await setupAlarms();
    await cleanupOldData();
    await cleanupOrphanedSessions();
    startTracking();
});

// =====================
// Alarms
// =====================

async function setupAlarms() {
    // Alarm for midnight reset
    chrome.alarms.create('midnightReset', {
        when: getMidnightTimestamp(),
        periodInMinutes: 24 * 60
    });

    // Alarm for data cleanup (daily)
    chrome.alarms.create('dailyCleanup', {
        periodInMinutes: 24 * 60
    });

    // Alarm for blocking rule updates
    chrome.alarms.create('updateBlockingRules', {
        periodInMinutes: 1
    });
}

function getMidnightTimestamp() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    switch (alarm.name) {
        case 'midnightReset':
            await handleMidnightReset();
            break;
        case 'dailyCleanup':
            await cleanupOldData();
            break;
        case 'updateBlockingRules':
            await updateBlockingRules();
            break;
    }
});

async function handleMidnightReset() {
    console.log('Midnight reset triggered');
    lastDateKey = getTodayKey();

    // End any active sessions from previous day
    const sessions = await getCurrentSessions();
    for (const domain of Object.keys(sessions)) {
        await endSession(domain);
    }

    // Notify open tabs about reset
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        try {
            await chrome.tabs.sendMessage(tab.id, { type: 'MIDNIGHT_RESET' });
        } catch (e) {
            // Tab might not have content script
        }
    }
}

// =====================
// Tab Tracking
// =====================

function startTracking() {
    if (trackingIntervalId) {
        clearInterval(trackingIntervalId);
    }

    trackingIntervalId = setInterval(async () => {
        await trackUsage();
    }, TRACKING_INTERVAL);
}

async function trackUsage() {
    const enabled = await isTrackingEnabled();
    if (!enabled) return;

    // Check for date change
    const currentDateKey = getTodayKey();
    if (currentDateKey !== lastDateKey) {
        await handleMidnightReset();
    }

    try {
        const domainsToTrack = new Set();
        let activeTabDomain = null;

        // 1. Identify domain from Active Tab (if not idle)
        if (!isIdle) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url) {
                const domain = extractDomain(tab.url);
                if (domain && !isExcludedDomain(domain)) {
                    activeTabDomain = domain;
                    domainsToTrack.add(domain);
                }
            }
        }

        // 2. Identify domains from Background Media
        // (Track them even if idle or not active)
        for (const [tabId, data] of activeMediaTabs) {
            if (data.domain) {
                domainsToTrack.add(data.domain);
            }
        }

        // 3. Handle Active Tab switching logic (Current Domain validation)
        if (activeTabDomain !== currentDomain) {
            // Only switch currentDomain if the user actually switched tabs
            // But be careful: currentDomain might be kept alive by background media
            // Actually, currentDomain usually represents the "Focused" domain.
            // Let's keep currentDomain as the "User Focused" domain for badge purposes.
            if (activeTabDomain) {
                await handleDomainChange(currentDomain, activeTabDomain);
            } else if (currentDomain && !isDomainPlayingMedia(currentDomain)) {
                // If user is idle or on excluded page, AND the old domain isn't playing media
                // then we close the session.
                await endSession(currentDomain);
                currentDomain = null;
                if (isIdle) {
                    updateBadge('⏸', '#607D8B');
                } else {
                    updateBadge('', '#4CAF50');
                }
            }
        }

        // 4. Ensure sessions exist BEFORE updating time (so duration is tracked properly)
        for (const domain of domainsToTrack) {
            const currentSessions = await getCurrentSessions();
            if (!currentSessions[domain]) {
                await startSession(domain);
            }
        }

        // 5. Update Time for ALL tracked domains
        for (const domain of domainsToTrack) {
            // Check limits first
            // Note: If multiple tabs open for same domain, we only check/block once per tick
            // Ideally we should track which *tab* is being tracked to block it specifically
            // But for now, domain-level blocking is fine.

            // Limit check
            await checkLimitsAndUpdateBadge(domain, domain === activeTabDomain);

            // Update usage
            await updateDomainTime(domain, TRACKING_INTERVAL / 1000, {
                active: domain === activeTabDomain,
                media: isDomainPlayingMedia(domain)
            });
        }

    } catch (error) {
        console.error('Error tracking usage:', error);
    }
}

function isDomainPlayingMedia(domain) {
    for (const [tabId, data] of activeMediaTabs) {
        if (data.domain === domain) return true;
    }
    return false;
}

function isExcludedDomain(domain) {
    const excluded = [
        'chrome.google.com',
        'extensions',
        'newtab',
        'devtools'
    ];
    return excluded.some(ex => domain.includes(ex));
}

async function handleNoActiveTab() {
    // Use trackUsage logic to handle cleanup
}

async function handleDomainChange(oldDomain, newDomain) {
    // Only close old session if it's NOT playing media
    if (oldDomain && !isDomainPlayingMedia(oldDomain)) {
        await endSession(oldDomain);
    }

    // Start session for new domain
    currentDomain = newDomain;
    // startSession handles duplicates gracefully (updates current session)
    await startSession(newDomain);

    // Check if blocked
    const accessCheck = await canAccessWebsite(newDomain);



    if (!accessCheck.allowed) {
        await blockCurrentTab(accessCheck);
    }
}

async function checkLimitsAndUpdateBadge(domain, isFocused) {
    // Only update badge if it's the focused domain
    const updateUI = isFocused;

    const status = await getSessionStatus(domain);



    if (updateUI && !status.hasLimits) {
        updateBadge('', '#4CAF50');
        return;
    }

    if (!status.allowed) {


        if (updateUI) updateBadge('!', '#F44336');

        // Find all tabs for this domain and block them
        // This is important because background tabs might hit the limit
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.url && extractDomain(tab.url) === domain) {
                const accessCheck = await canAccessWebsite(domain);
                // Block this specific tab
                await blockTab(tab.id, accessCheck);
            }
        }
        return;
    }

    if (updateUI && status.sessionTimeRemaining !== null) {
        const minutes = Math.ceil(status.sessionTimeRemaining / 60);
        if (status.isWarning) {
            updateBadge(`${minutes}`, '#FFC107');
            if (status.sessionTimeRemaining <= 300 && status.sessionTimeRemaining > 295) {
                sendNotification('Session Ending Soon', `${domain}: ${formatTime(status.sessionTimeRemaining)} left`);
            }
        } else {
            updateBadge(`${minutes}`, '#4CAF50');
        }
    } else if (updateUI) {
        updateBadge('', '#4CAF50');
    }
}

function updateBadge(text, color) {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
}

// =====================
// Blocking
// =====================

// Replace blockCurrentTab with blockTab
async function blockTab(tabId, accessCheck) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) return;

        // Don't block if already blocked
        if (tab.url.includes('blocked/blocked.html')) return;

        const blockedUrl = chrome.runtime.getURL('blocked/blocked.html');
        const params = new URLSearchParams({
            domain: extractDomain(tab.url) || '',
            reason: accessCheck.reason || 'unknown',
            reasonText: accessCheck.reasonText || 'Access blocked',
            nextAvailable: accessCheck.nextAvailable?.toString() || ''
        });



        await chrome.tabs.update(tabId, {
            url: `${blockedUrl}?${params.toString()}`
        });
    } catch (error) {
        console.error('Error blocking tab:', error);
    }
}

async function blockCurrentTab(accessCheck) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await blockTab(tab.id, accessCheck);
}

async function updateBlockingRules() {
    const limits = await getAllLimits();
    const rules = [];
    let ruleId = 1;

    for (const [domain, limit] of Object.entries(limits)) {
        const accessCheck = await canAccessWebsite(domain);

        if (!accessCheck.allowed && limit.enforcement?.hardBlock) {
            rules.push({
                id: ruleId++,
                priority: 1,
                action: {
                    type: 'redirect',
                    redirect: {
                        extensionPath: `/blocked/blocked.html?domain=${encodeURIComponent(domain)}&reason=${accessCheck.reason}`
                    }
                },
                condition: {
                    urlFilter: `*://*.${domain}/*`,
                    resourceTypes: ['main_frame']
                }
            });

            // Also block without www
            rules.push({
                id: ruleId++,
                priority: 1,
                action: {
                    type: 'redirect',
                    redirect: {
                        extensionPath: `/blocked/blocked.html?domain=${encodeURIComponent(domain)}&reason=${accessCheck.reason}`
                    }
                },
                condition: {
                    urlFilter: `*://${domain}/*`,
                    resourceTypes: ['main_frame']
                }
            });
        }
    }

    try {
        // Get existing rules
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const existingIds = existingRules.map(r => r.id);

        // Update rules
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existingIds,
            addRules: rules
        });
    } catch (error) {
        console.error('Error updating blocking rules:', error);
    }
}

// =====================
// Idle Detection
// =====================

chrome.idle.onStateChanged.addListener(async (state) => {
    if (state === 'idle' || state === 'locked') {
        isIdle = true;
        // Only end session for current domain if it is NOT playing media
        if (currentDomain && !isDomainPlayingMedia(currentDomain)) {
            await endSession(currentDomain);
            currentDomain = null;
            updateBadge('⏸', '#607D8B');
        }
    } else if (state === 'active') {
        isIdle = false;
        lastActiveTime = Date.now();
    }
});

// Set idle detection threshold
chrome.idle.setDetectionInterval(IDLE_THRESHOLD);

// =====================
// Tab Events
// =====================

chrome.tabs.onRemoved.addListener((tabId) => {
    activeMediaTabs.delete(tabId);
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    lastActiveTime = Date.now();
    isIdle = false;

    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url) {
            const domain = extractDomain(tab.url);
            if (domain && !isExcludedDomain(domain)) {
                await handleDomainChange(currentDomain, domain);
            }
        }
    } catch (error) {
        console.error('Error on tab activated:', error);
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Clear media state on main frame navigation
    if (changeInfo.status === 'loading') {
        activeMediaTabs.delete(tabId);
    }

    if (changeInfo.status === 'complete' && tab.active && tab.url) {
        const domain = extractDomain(tab.url);
        if (domain && !isExcludedDomain(domain)) {
            // Check if blocked
            const accessCheck = await canAccessWebsite(domain);



            if (!accessCheck.allowed) {
                await blockCurrentTab(accessCheck);
            }
        }
    }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // All windows lost focus
        if (currentDomain) {
            await endSession(currentDomain);
            currentDomain = null;
        }
    } else {
        // Window gained focus
        lastActiveTime = Date.now();
        isIdle = false;

        try {
            const [tab] = await chrome.tabs.query({ active: true, windowId });
            if (tab && tab.url) {
                const domain = extractDomain(tab.url);
                if (domain && !isExcludedDomain(domain)) {
                    await handleDomainChange(currentDomain, domain);
                }
            }
        } catch (error) {
            console.error('Error on window focus changed:', error);
        }
    }
});

// =====================
// Notifications
// =====================

function sendNotification(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title,
        message,
        priority: 2
    });
}

// =====================
// Message Handling
// =====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
            console.error('Error handling message:', error);
            sendResponse({ error: error.message || 'Unknown error' });
        });
    return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
    try {
        switch (message.type) {
            case 'GET_STATUS':
                return await getStatusForPopup(message.domain);

            case 'GET_TODAY_STATS':
                return await getTodayStats();

            case 'GET_USAGE_DATA':
                return await getUsageData(message.startDate, message.endDate);

            case 'TOGGLE_TRACKING':
                // Security check: prevent disabling tracking without password
                if (!message.enabled) {
                    const permCheck = await canPerformAction('DISABLE_TRACKING', message.password);
                    if (!permCheck.allowed) {
                        await logAudit('BLOCKED_TRACKING_DISABLE', `Attempt to disable tracking blocked: ${permCheck.reason}`);
                        return {
                            success: false,
                            error: permCheck.message,
                            reason: permCheck.reason,
                            requiresPassword: permCheck.reason === 'password_required'
                        };
                    }
                    await logAudit('TRACKING_DISABLED', 'Tracking was disabled');
                } else {
                    await logAudit('TRACKING_ENABLED', 'Tracking was enabled');
                }
                await setTrackingEnabled(message.enabled);
                return { success: true };

            case 'REQUEST_OVERRIDE':
                return await handleOverrideRequest(message.domain);

            case 'GET_CURRENT_DOMAIN':
                return { domain: currentDomain };

            case 'ACTIVITY_UPDATE':
                if (sender.tab && sender.tab.id) {
                    const tabId = sender.tab.id;
                    const frameId = sender.frameId || 0;
                    const domain = sender.tab.url ? extractDomain(sender.tab.url) : null;

                    if (message.isMediaPlaying) {
                        if (!activeMediaTabs.has(tabId)) {
                            activeMediaTabs.set(tabId, { frames: new Set(), domain: domain });
                        }
                        const tabData = activeMediaTabs.get(tabId);
                        tabData.frames.add(frameId);
                        if (domain) tabData.domain = domain; // Update domain if available

                        // Force wake up if was idle (optional - user preference?)
                        // For now, let's say media playing means "active" usage regardless of mouse
                        // but we don't necessarily need to set isIdle=false global flag
                        // because trackUsage handles the distinction.

                        // Actually, if media starts playing, we should ensure a session exists
                        if (domain) {
                            const currentSessions = await getCurrentSessions();
                            if (!currentSessions[domain]) {
                                await startSession(domain);
                            }
                        }

                    } else {
                        if (activeMediaTabs.has(tabId)) {
                            const tabData = activeMediaTabs.get(tabId);
                            tabData.frames.delete(frameId);
                            if (tabData.frames.size === 0) {
                                activeMediaTabs.delete(tabId);

                                // If this was the only thing keeping the domain active (and user is idle or elsewhere)
                                // check if we should close session
                                if (domain && !isDomainPlayingMedia(domain) && (domain !== currentDomain || isIdle)) {
                                    await endSession(domain);
                                }
                            }
                        }
                    }
                }
                return { success: true };

            case 'LIMITS_UPDATED':
                // Immediate check to enforce new/removed limits
                await trackUsage();
                // Check if any currently blocked tabs should be unblocked
                await recheckBlockedTabs();
                // Also update blocking rules just in case
                await updateBlockingRules();
                return { success: true };

            // Security-related messages
            case 'VERIFY_PASSWORD': {
                const isValid = await verifyPassword(message.password);
                return { valid: isValid };
            }

            case 'GET_SECURITY_SETTINGS': {
                const securitySettings = await getSecuritySettings();
                const passwordSet = await isPasswordSet();
                return { settings: securitySettings, passwordSet };
            }

            case 'GET_AUDIT_LOG': {
                const log = await getAuditLog(message.limit || 50);
                return { log };
            }

            case 'CHECK_LOCK_STATUS': {
                const lockStatus = await isLocked();
                return lockStatus;
            }

            case 'CAN_MODIFY_LIMITS': {
                const modCheck = await canModifyLimits(message.domain);
                return modCheck;
            }

            default:
                return { error: 'Unknown message type' };
        }
    } catch (error) {
        console.error('Error in handleMessage:', error);
        return { error: error.message || 'Internal error' };
    }
}

async function recheckBlockedTabs() {
    try {
        const blockedUrl = chrome.runtime.getURL('blocked/blocked.html');
        // Find all tabs currently on the blocked page
        const tabs = await chrome.tabs.query({ url: blockedUrl + '*' });

        for (const tab of tabs) {
            if (!tab.url) continue;

            try {
                const url = new URL(tab.url);
                const domain = url.searchParams.get('domain');

                if (domain) {
                    const accessCheck = await canAccessWebsite(domain);
                    if (accessCheck.allowed) {
                        // Restore access
                        const targetUrl = `https://${domain}`;
                        await chrome.tabs.update(tab.id, { url: targetUrl });
                    }
                }
            } catch (e) {
                console.error('Error rechecking blocked tab:', e);
            }
        }
    } catch (error) {
        console.error('Error querying blocked tabs:', error);
    }
}

async function getStatusForPopup(domain) {
    if (!domain) {
        const enabled = await isTrackingEnabled();
        return {
            enabled,
            currentDomain,
            isIdle
        };
    }

    const status = await getSessionStatus(domain);
    const enabled = await isTrackingEnabled();

    return {
        enabled,
        currentDomain,
        isIdle,
        ...status
    };
}

async function getTodayStats() {
    const usage = await getDailyUsage();
    const enabled = await isTrackingEnabled();

    // Calculate totals
    let totalTime = 0;
    const sites = [];

    for (const [domain, data] of Object.entries(usage)) {
        totalTime += data.totalTime;
        sites.push({
            domain,
            time: data.totalTime,
            sessions: data.sessions?.length || 0
        });
    }

    // Sort by time
    sites.sort((a, b) => b.time - a.time);

    return {
        enabled,
        totalTime,
        totalTimeFormatted: formatTime(totalTime),
        sites,
        topSites: sites.slice(0, 5),
        currentDomain,
        isIdle
    };
}

async function getUsageData(startDate, endDate) {
    const usage = await getUsageForRange(startDate, endDate);
    const categories = await getCategories();

    return {
        usage,
        categories
    };
}

async function handleOverrideRequest(domain) {
    const canOverride = await canUseEmergencyOverride(domain);

    if (!canOverride.available) {
        return {
            success: false,
            reason: canOverride.reason
        };
    }

    await addOverride(domain);

    // Remove blocking rules temporarily
    await updateBlockingRules();

    // Set a timer to re-enable blocking after override period (15 minutes)
    setTimeout(async () => {
        await updateBlockingRules();
    }, 15 * 60 * 1000);

    return {
        success: true,
        remaining: canOverride.remaining - 1
    };
}

// Start tracking on load
startTracking();
