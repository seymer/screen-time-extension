/**
 * Storage Manager - Handles all Chrome storage operations
 * Provides abstraction for daily usage, categories, limits, and settings
 */

// Constants
const STORAGE_KEYS = {
    DAILY_USAGE: 'dailyUsage',
    CATEGORIES: 'categories',
    LIMITS: 'limits',
    CURRENT_SESSIONS: 'currentSessions',
    TODAY_OVERRIDES: 'todayOverrides',
    SETTINGS: 'settings',
    TRACKING_ENABLED: 'trackingEnabled'
};

const DEFAULT_SETTINGS = {
    idleTimeout: 30,
    quietHours: { start: '22:00', end: '08:00' },
    defaultEnforcement: 'soft',
    retentionDays: 90
};

const DEFAULT_CATEGORIES = {
    'youtube.com': 'Entertainment',
    'netflix.com': 'Entertainment',
    'facebook.com': 'Social Media',
    'twitter.com': 'Social Media',
    'x.com': 'Social Media',
    'instagram.com': 'Social Media',
    'linkedin.com': 'Social Media',
    'reddit.com': 'Social Media',
    'github.com': 'Work/Productivity',
    'stackoverflow.com': 'Work/Productivity',
    'docs.google.com': 'Work/Productivity',
    'amazon.com': 'Shopping',
    'ebay.com': 'Shopping',
    'cnn.com': 'News',
    'bbc.com': 'News',
    'nytimes.com': 'News'
};

const CATEGORY_COLORS = {
    'Social Media': '#E91E63',
    'Entertainment': '#9C27B0',
    'Work/Productivity': '#4CAF50',
    'News': '#2196F3',
    'Shopping': '#FF9800',
    'Other': '#607D8B'
};

/**
 * Get today's date string in YYYY-MM-DD format
 */
/**
 * Get today's date string in YYYY-MM-DD format (Local Time)
 */
export function getTodayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Get a date string for N days ago (Local Time)
 */
export function getDateKey(daysAgo = 0) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Extract domain from URL
 */
export function extractDomain(url) {
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

/**
 * Format seconds to human-readable time
 */
export function formatTime(seconds) {
    if (seconds < 60) {
        return `${Math.floor(seconds)}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${secs}s`;
}

/**
 * Format seconds to detailed time string
 */
export function formatTimeDetailed(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (secs > 0 && hours === 0) parts.push(`${secs} second${secs !== 1 ? 's' : ''}`);

    return parts.join(' ') || '0 seconds';
}

// =====================
// Storage Operations
// =====================

/**
 * Initialize storage with default values
 */
export async function initializeStorage() {
    const data = await chrome.storage.local.get(null);

    const updates = {};

    if (!data[STORAGE_KEYS.SETTINGS]) {
        updates[STORAGE_KEYS.SETTINGS] = DEFAULT_SETTINGS;
    }

    if (!data[STORAGE_KEYS.CATEGORIES]) {
        updates[STORAGE_KEYS.CATEGORIES] = DEFAULT_CATEGORIES;
    }

    if (!data[STORAGE_KEYS.DAILY_USAGE]) {
        updates[STORAGE_KEYS.DAILY_USAGE] = {};
    }

    if (!data[STORAGE_KEYS.LIMITS]) {
        updates[STORAGE_KEYS.LIMITS] = {};
    }

    if (!data[STORAGE_KEYS.CURRENT_SESSIONS]) {
        updates[STORAGE_KEYS.CURRENT_SESSIONS] = {};
    }

    if (!data[STORAGE_KEYS.TODAY_OVERRIDES]) {
        updates[STORAGE_KEYS.TODAY_OVERRIDES] = {};
    }

    if (data[STORAGE_KEYS.TRACKING_ENABLED] === undefined) {
        updates[STORAGE_KEYS.TRACKING_ENABLED] = true;
    }

    if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
    }

    return { ...data, ...updates };
}

/**
 * Get settings
 */
export async function getSettings() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return data[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;
}

/**
 * Update settings
 */
export async function updateSettings(newSettings) {
    const current = await getSettings();
    const updated = { ...current, ...newSettings };
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
    return updated;
}

/**
 * Check if tracking is enabled
 */
export async function isTrackingEnabled() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.TRACKING_ENABLED);
    return data[STORAGE_KEYS.TRACKING_ENABLED] !== false;
}

/**
 * Set tracking enabled state
 */
export async function setTrackingEnabled(enabled) {
    await chrome.storage.local.set({ [STORAGE_KEYS.TRACKING_ENABLED]: enabled });
}

// =====================
// Daily Usage Operations
// =====================

/**
 * Get all daily usage data
 */
export async function getAllDailyUsage() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.DAILY_USAGE);
    return data[STORAGE_KEYS.DAILY_USAGE] || {};
}

/**
 * Get usage for a specific date
 */
export async function getDailyUsage(dateKey = getTodayKey()) {
    const allUsage = await getAllDailyUsage();
    return allUsage[dateKey] || {};
}

/**
 * Get today's usage
 */
export async function getTodayUsage() {
    return getDailyUsage(getTodayKey());
}

/**
 * Update time for a domain
 */
export async function updateDomainTime(domain, additionalSeconds, sessionInfo = null) {
    const dateKey = getTodayKey();
    const allUsage = await getAllDailyUsage();

    if (!allUsage[dateKey]) {
        allUsage[dateKey] = {};
    }

    if (!allUsage[dateKey][domain]) {
        allUsage[dateKey][domain] = {
            totalTime: 0,
            sessions: []
        };
    }

    allUsage[dateKey][domain].totalTime += additionalSeconds;

    // Update session if provided
    if (sessionInfo) {
        const sessions = allUsage[dateKey][domain].sessions;
        const lastSession = sessions[sessions.length - 1];

        if (lastSession && !lastSession.endTime) {
            // Update existing open session
            lastSession.duration = (lastSession.duration || 0) + additionalSeconds;
        }
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.DAILY_USAGE]: allUsage });
    return allUsage[dateKey][domain];
}

/**
 * Start a new session for a domain
 */
export async function startDomainSession(domain, startTime = Date.now()) {
    const dateKey = getTodayKey();
    const allUsage = await getAllDailyUsage();

    if (!allUsage[dateKey]) {
        allUsage[dateKey] = {};
    }

    if (!allUsage[dateKey][domain]) {
        allUsage[dateKey][domain] = {
            totalTime: 0,
            sessions: []
        };
    }

    const sessions = allUsage[dateKey][domain].sessions;
    const lastSession = sessions[sessions.length - 1];

    // Check for existing open session to avoid duplicates
    if (lastSession && !lastSession.endTime) {
        // Session already open, return it
        return lastSession;
    }

    const newSession = {
        startTime: startTime,
        endTime: null,
        duration: 0
    };

    allUsage[dateKey][domain].sessions.push(newSession);
    await chrome.storage.local.set({ [STORAGE_KEYS.DAILY_USAGE]: allUsage });

    return newSession;
}

/**
 * End current session for a domain
 */
export async function endDomainSession(domain) {
    const dateKey = getTodayKey();
    const allUsage = await getAllDailyUsage();

    if (allUsage[dateKey]?.[domain]?.sessions) {
        const sessions = allUsage[dateKey][domain].sessions;
        const lastSession = sessions[sessions.length - 1];

        if (lastSession && !lastSession.endTime) {
            lastSession.endTime = Date.now();
            // REMOVE: lastSession.duration = Math.floor((lastSession.endTime - lastSession.startTime) / 1000);
            // Duration is updated incrementally by updateDomainTime, so we trust that value.
            // Recalculating from (end - start) includes idle/sleep time which is wrong.
            await chrome.storage.local.set({ [STORAGE_KEYS.DAILY_USAGE]: allUsage });
            return lastSession;
        }
    }

    return null;
}

/**
 * Get usage for date range
 */
export async function getUsageForRange(startDate, endDate) {
    const allUsage = await getAllDailyUsage();
    const result = {};

    const start = new Date(startDate);
    const end = new Date(endDate);

    for (const [dateKey, usage] of Object.entries(allUsage)) {
        const date = new Date(dateKey);
        if (date >= start && date <= end) {
            result[dateKey] = usage;
        }
    }

    return result;
}

/**
 * Get total time per domain for date range
 */
export async function getTotalTimePerDomain(startDate, endDate) {
    const rangeUsage = await getUsageForRange(startDate, endDate);
    const totals = {};

    for (const dayUsage of Object.values(rangeUsage)) {
        for (const [domain, data] of Object.entries(dayUsage)) {
            totals[domain] = (totals[domain] || 0) + data.totalTime;
        }
    }

    return totals;
}

// =====================
// Categories Operations
// =====================

/**
 * Get all categories
 */
export async function getCategories() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.CATEGORIES);
    return data[STORAGE_KEYS.CATEGORIES] || DEFAULT_CATEGORIES;
}

/**
 * Get category for a domain
 */
export async function getCategoryForDomain(domain) {
    const categories = await getCategories();
    return categories[domain] || 'Other';
}

/**
 * Set category for a domain
 */
export async function setCategoryForDomain(domain, category) {
    const categories = await getCategories();
    categories[domain] = category;
    await chrome.storage.local.set({ [STORAGE_KEYS.CATEGORIES]: categories });
}

/**
 * Get all available category names
 */
export function getCategoryNames() {
    return ['Social Media', 'Entertainment', 'Work/Productivity', 'News', 'Shopping', 'Other'];
}

/**
 * Get category colors
 */
export function getCategoryColor(category) {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'];
}

// =====================
// Limits Operations
// =====================

/**
 * Get all limits
 */
export async function getAllLimits() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.LIMITS);
    return data[STORAGE_KEYS.LIMITS] || {};
}

/**
 * Get limits for a domain
 */
export async function getLimitsForDomain(domain) {
    const limits = await getAllLimits();
    return limits[domain] || null;
}

/**
 * Set limits for a domain
 */
export async function setLimitsForDomain(domain, limitConfig) {
    const limits = await getAllLimits();
    limits[domain] = {
        dailyTotal: limitConfig.dailyTotal || null,
        sessionCount: limitConfig.sessionCount || null,
        perSessionLimit: limitConfig.perSessionLimit || null,
        minBreakInterval: limitConfig.minBreakInterval || null,
        blockedTimeRanges: limitConfig.blockedTimeRanges || [],
        enforcement: {
            hardBlock: limitConfig.enforcement?.hardBlock ?? true,
            showWarnings: limitConfig.enforcement?.showWarnings ?? true,
            emergencyOverride: limitConfig.enforcement?.emergencyOverride ?? false,
            maxOverridesPerDay: limitConfig.enforcement?.maxOverridesPerDay ?? 2
        }
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.LIMITS]: limits });
    return limits[domain];
}

/**
 * Remove limits for a domain
 */
export async function removeLimitsForDomain(domain) {
    const limits = await getAllLimits();
    delete limits[domain];
    await chrome.storage.local.set({ [STORAGE_KEYS.LIMITS]: limits });
}

// =====================
// Current Sessions Operations
// =====================

/**
 * Get current sessions
 */
export async function getCurrentSessions() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.CURRENT_SESSIONS);
    return data[STORAGE_KEYS.CURRENT_SESSIONS] || {};
}

/**
 * Update current session for domain
 */
export async function updateCurrentSession(domain, sessionData) {
    const sessions = await getCurrentSessions();
    sessions[domain] = sessionData;
    await chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_SESSIONS]: sessions });
}

/**
 * Clear current session for domain
 */
export async function clearCurrentSession(domain) {
    const sessions = await getCurrentSessions();
    delete sessions[domain];
    await chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_SESSIONS]: sessions });
}

// =====================
// Override Operations
// =====================

/**
 * Get today's overrides
 */
export async function getTodayOverrides() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.TODAY_OVERRIDES);
    const overrides = data[STORAGE_KEYS.TODAY_OVERRIDES] || {};
    const todayKey = getTodayKey();

    // Check if overrides are from today
    if (overrides._date !== todayKey) {
        return {};
    }

    return overrides;
}

/**
 * Add override for domain
 */
export async function addOverride(domain) {
    const overrides = await getTodayOverrides();
    const todayKey = getTodayKey();

    overrides._date = todayKey;

    if (!overrides[domain]) {
        overrides[domain] = {
            count: 0,
            timestamps: []
        };
    }

    overrides[domain].count++;
    overrides[domain].timestamps.push(Date.now());

    await chrome.storage.local.set({ [STORAGE_KEYS.TODAY_OVERRIDES]: overrides });
    return overrides[domain];
}

/**
 * Get override count for domain today
 */
export async function getOverrideCount(domain) {
    const overrides = await getTodayOverrides();
    return overrides[domain]?.count || 0;
}

// =====================
// Data Cleanup
// =====================

/**
 * Clean up old data (older than retention period)
 */
export async function cleanupOldData() {
    const settings = await getSettings();
    const retentionDays = settings.retentionDays || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const allUsage = await getAllDailyUsage();
    let hasChanges = false;

    for (const dateKey of Object.keys(allUsage)) {
        const date = new Date(dateKey);
        if (date < cutoffDate) {
            delete allUsage[dateKey];
            hasChanges = true;
        }
    }

    if (hasChanges) {
        await chrome.storage.local.set({ [STORAGE_KEYS.DAILY_USAGE]: allUsage });
    }

    return hasChanges;
}

/**
 * Export all data
 */
export async function exportAllData() {
    const data = await chrome.storage.local.get(null);
    return JSON.stringify(data, null, 2);
}

/**
 * Import data
 */
export async function importData(jsonString) {
    const data = JSON.parse(jsonString);
    await chrome.storage.local.set(data);
}

/**
 * Clear all data
 */
export async function clearAllData() {
    await chrome.storage.local.clear();
    await initializeStorage();
}

/**
 * Close all open sessions (used on startup to fix inconsistencies)
 */
export async function cleanupOrphanedSessions() {
    const dateKey = getTodayKey();
    const allUsage = await getAllDailyUsage();
    let hasChanges = false;

    if (allUsage[dateKey]) {
        for (const domain in allUsage[dateKey]) {
            const data = allUsage[dateKey][domain];
            if (data.sessions && data.sessions.length > 0) {
                const lastSession = data.sessions[data.sessions.length - 1];
                if (!lastSession.endTime) {
                    // Found an orphaned open session
                    lastSession.endTime = Date.now();
                    // Don't recalculate duration here, just mark it ended.
                    // The duration should have been updated by the last heartbeat.
                    hasChanges = true;
                }
            }
        }
    }

    if (hasChanges) {
        await chrome.storage.local.set({ [STORAGE_KEYS.DAILY_USAGE]: allUsage });
    }

    // Also clear current sessions state
    await chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_SESSIONS]: {} });

    return hasChanges;
}

export { STORAGE_KEYS, DEFAULT_SETTINGS, CATEGORY_COLORS };
