/**
 * Security Manager - Handles authentication and protection mechanisms
 * Prevents users from bypassing time limits
 */

import { getTodayKey } from './storage.js';

// Constants
const SECURITY_KEYS = {
    PASSWORD_HASH: 'securityPasswordHash',
    SECURITY_SETTINGS: 'securitySettings',
    AUDIT_LOG: 'auditLog',
    LOCKED_UNTIL: 'lockedUntil',
    LAST_MODIFICATION: 'lastModification'
};

const DEFAULT_SECURITY_SETTINGS = {
    enabled: false,
    requirePasswordForLimitChanges: true,
    requirePasswordForDataClear: true,
    requirePasswordForDisableTracking: true,
    lockDuration: 300, // 5 minutes in seconds
    cooldownPeriod: 3600, // 1 hour between limit modifications
    maxModificationsPerDay: 3,
    preventExtensionRemoval: false
};

// =====================
// Password Management
// =====================

/**
 * Hash password using SHA-256
 */
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Set security password
 */
async function setSecurityPassword(password) {
    if (!password || password.length < 4) {
        throw new Error('Password must be at least 4 characters');
    }

    const hash = await hashPassword(password);
    await chrome.storage.local.set({ [SECURITY_KEYS.PASSWORD_HASH]: hash });

    await logAudit('PASSWORD_SET', 'Security password was set');
    return true;
}

/**
 * Verify password
 */
async function verifyPassword(password) {
    const data = await chrome.storage.local.get(SECURITY_KEYS.PASSWORD_HASH);
    const storedHash = data[SECURITY_KEYS.PASSWORD_HASH];

    if (!storedHash) {
        return false; // No password set
    }

    const inputHash = await hashPassword(password);
    return inputHash === storedHash;
}

/**
 * Check if password is set
 */
async function isPasswordSet() {
    const data = await chrome.storage.local.get(SECURITY_KEYS.PASSWORD_HASH);
    return !!data[SECURITY_KEYS.PASSWORD_HASH];
}

/**
 * Remove password (requires current password)
 */
async function removePassword(currentPassword) {
    const isValid = await verifyPassword(currentPassword);
    if (!isValid) {
        throw new Error('Invalid password');
    }

    await chrome.storage.local.remove(SECURITY_KEYS.PASSWORD_HASH);
    await logAudit('PASSWORD_REMOVED', 'Security password was removed');
    return true;
}

// =====================
// Security Settings
// =====================

/**
 * Get security settings
 */
async function getSecuritySettings() {
    const data = await chrome.storage.local.get(SECURITY_KEYS.SECURITY_SETTINGS);
    return data[SECURITY_KEYS.SECURITY_SETTINGS] || DEFAULT_SECURITY_SETTINGS;
}

/**
 * Update security settings
 */
async function updateSecuritySettings(newSettings) {
    const current = await getSecuritySettings();
    const updated = { ...current, ...newSettings };

    await chrome.storage.local.set({ [SECURITY_KEYS.SECURITY_SETTINGS]: updated });
    await logAudit('SECURITY_SETTINGS_UPDATED', 'Security settings were modified', newSettings);

    return updated;
}

/**
 * Check if security is enabled
 */
async function isSecurityEnabled() {
    const settings = await getSecuritySettings();
    return settings.enabled && await isPasswordSet();
}

// =====================
// Lock Management
// =====================

/**
 * Lock settings for a duration
 */
async function lockSettings(durationSeconds) {
    const unlockTime = Date.now() + (durationSeconds * 1000);
    await chrome.storage.local.set({ [SECURITY_KEYS.LOCKED_UNTIL]: unlockTime });
    await logAudit('SETTINGS_LOCKED', `Settings locked for ${durationSeconds} seconds`);
}

/**
 * Check if settings are locked
 */
async function isLocked() {
    const data = await chrome.storage.local.get(SECURITY_KEYS.LOCKED_UNTIL);
    const lockedUntil = data[SECURITY_KEYS.LOCKED_UNTIL];

    if (!lockedUntil) return false;

    if (Date.now() < lockedUntil) {
        return {
            locked: true,
            remainingSeconds: Math.ceil((lockedUntil - Date.now()) / 1000)
        };
    }

    // Lock expired, remove it
    await chrome.storage.local.remove(SECURITY_KEYS.LOCKED_UNTIL);
    return { locked: false };
}

/**
 * Unlock settings (requires password)
 */
async function unlockSettings(password) {
    const isValid = await verifyPassword(password);
    if (!isValid) {
        throw new Error('Invalid password');
    }

    await chrome.storage.local.remove(SECURITY_KEYS.LOCKED_UNTIL);
    await logAudit('SETTINGS_UNLOCKED', 'Settings were unlocked with password');
    return true;
}

// =====================
// Modification Tracking
// =====================

/**
 * Get today's modifications
 */
async function getTodayModifications() {
    const data = await chrome.storage.local.get(SECURITY_KEYS.LAST_MODIFICATION);
    const modifications = data[SECURITY_KEYS.LAST_MODIFICATION] || {};
    const today = getTodayKey();

    return modifications[today] || [];
}

/**
 * Record a modification
 */
async function recordModification(type, domain = null) {
    const data = await chrome.storage.local.get(SECURITY_KEYS.LAST_MODIFICATION);
    const modifications = data[SECURITY_KEYS.LAST_MODIFICATION] || {};
    const today = getTodayKey();

    if (!modifications[today]) {
        modifications[today] = [];
    }

    modifications[today].push({
        type,
        domain,
        timestamp: Date.now()
    });

    // Keep only last 7 days
    const dates = Object.keys(modifications).sort();
    if (dates.length > 7) {
        dates.slice(0, -7).forEach(date => delete modifications[date]);
    }

    await chrome.storage.local.set({ [SECURITY_KEYS.LAST_MODIFICATION]: modifications });
}

/**
 * Check if modification is allowed based on cooldown and daily limit
 */
async function canModifyLimits(domain = null) {
    const settings = await getSecuritySettings();
    if (!settings.enabled) {
        return { allowed: true };
    }

    const todayMods = await getTodayModifications();

    // Check daily limit
    if (todayMods.length >= settings.maxModificationsPerDay) {
        return {
            allowed: false,
            reason: 'daily_limit',
            message: `You have reached the maximum of ${settings.maxModificationsPerDay} limit modifications today.`
        };
    }

    // Check cooldown period
    if (todayMods.length > 0) {
        const lastMod = todayMods[todayMods.length - 1];
        const timeSinceLastMod = (Date.now() - lastMod.timestamp) / 1000;

        if (timeSinceLastMod < settings.cooldownPeriod) {
            const remainingSeconds = Math.ceil(settings.cooldownPeriod - timeSinceLastMod);
            return {
                allowed: false,
                reason: 'cooldown',
                message: `Please wait ${formatCooldownTime(remainingSeconds)} before modifying limits again.`,
                remainingSeconds
            };
        }
    }

    return { allowed: true };
}

/**
 * Format cooldown time
 */
function formatCooldownTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

// =====================
// Permission Checks
// =====================

/**
 * Check if user can perform an action
 */
async function canPerformAction(action, password = null) {
    const settings = await getSecuritySettings();

    // If security is not enabled, allow all actions
    if (!settings.enabled || !await isPasswordSet()) {
        return { allowed: true };
    }

    // Check if locked
    const lockStatus = await isLocked();
    if (lockStatus.locked) {
        return {
            allowed: false,
            reason: 'locked',
            message: `Settings are locked. Please wait ${formatCooldownTime(lockStatus.remainingSeconds)}.`,
            remainingSeconds: lockStatus.remainingSeconds
        };
    }

    // Check if password is required for this action
    const requiresPassword = {
        'MODIFY_LIMIT': settings.requirePasswordForLimitChanges,
        'DELETE_LIMIT': settings.requirePasswordForLimitChanges,
        'CLEAR_DATA': settings.requirePasswordForDataClear,
        'DISABLE_TRACKING': settings.requirePasswordForDisableTracking,
        'MODIFY_SECURITY': true
    };

    if (requiresPassword[action]) {
        if (!password) {
            return {
                allowed: false,
                reason: 'password_required',
                message: 'Password required for this action.'
            };
        }

        const isValid = await verifyPassword(password);
        if (!isValid) {
            await logAudit('FAILED_AUTH', `Failed authentication attempt for action: ${action}`);
            return {
                allowed: false,
                reason: 'invalid_password',
                message: 'Invalid password.'
            };
        }
    }

    // Check modification limits for limit-related actions
    if (action === 'MODIFY_LIMIT' || action === 'DELETE_LIMIT') {
        const modCheck = await canModifyLimits();
        if (!modCheck.allowed) {
            return modCheck;
        }
    }

    return { allowed: true };
}

// =====================
// Audit Logging
// =====================

/**
 * Log an audit event
 */
async function logAudit(action, description, metadata = null) {
    const data = await chrome.storage.local.get(SECURITY_KEYS.AUDIT_LOG);
    const log = data[SECURITY_KEYS.AUDIT_LOG] || [];

    log.push({
        action,
        description,
        metadata,
        timestamp: Date.now(),
        date: new Date().toISOString()
    });

    // Keep only last 100 entries
    if (log.length > 100) {
        log.splice(0, log.length - 100);
    }

    await chrome.storage.local.set({ [SECURITY_KEYS.AUDIT_LOG]: log });
}

/**
 * Get audit log
 */
async function getAuditLog(limit = 50) {
    const data = await chrome.storage.local.get(SECURITY_KEYS.AUDIT_LOG);
    const log = data[SECURITY_KEYS.AUDIT_LOG] || [];
    return log.slice(-limit).reverse();
}

/**
 * Clear audit log (requires password)
 */
async function clearAuditLog(password) {
    const isValid = await verifyPassword(password);
    if (!isValid) {
        throw new Error('Invalid password');
    }

    await chrome.storage.local.remove(SECURITY_KEYS.AUDIT_LOG);
    await logAudit('AUDIT_LOG_CLEARED', 'Audit log was cleared');
    return true;
}

// =====================
// Tamper Detection
// =====================

/**
 * Create a checksum for limits data
 */
async function createLimitsChecksum(limits) {
    const data = JSON.stringify(limits);
    const hash = await hashPassword(data);
    return hash;
}

/**
 * Verify limits data hasn't been tampered with
 */
async function verifyLimitsIntegrity(limits, expectedChecksum) {
    const actualChecksum = await createLimitsChecksum(limits);
    return actualChecksum === expectedChecksum;
}

/**
 * Store limits with checksum
 */
async function storeLimitsSecurely(limits) {
    const checksum = await createLimitsChecksum(limits);
    await chrome.storage.local.set({
        limits,
        limitsChecksum: checksum
    });
}

/**
 * Retrieve and verify limits
 */
async function retrieveLimitsSecurely() {
    const data = await chrome.storage.local.get(['limits', 'limitsChecksum']);
    const limits = data.limits || {};
    const checksum = data.limitsChecksum;

    if (checksum) {
        const isValid = await verifyLimitsIntegrity(limits, checksum);
        if (!isValid) {
            await logAudit('TAMPER_DETECTED', 'Limits data tampering detected!');
            // Optionally: lock settings or take other action
        }
    }

    return limits;
}

// =====================
// Exports
// =====================

export {
    // Password
    setSecurityPassword,
    verifyPassword,
    isPasswordSet,
    removePassword,

    // Security Settings
    getSecuritySettings,
    updateSecuritySettings,
    isSecurityEnabled,

    // Lock Management
    lockSettings,
    isLocked,
    unlockSettings,

    // Modification Tracking
    getTodayModifications,
    recordModification,
    canModifyLimits,

    // Permission Checks
    canPerformAction,

    // Audit Logging
    logAudit,
    getAuditLog,
    clearAuditLog,

    // Tamper Detection
    storeLimitsSecurely,
    retrieveLimitsSecurely,
    createLimitsChecksum,
    verifyLimitsIntegrity
};
