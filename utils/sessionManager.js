/**
 * Session Manager - Handles session logic and access control
 * Implements the core session management algorithm
 */

import {
    getTodayKey,
    getDailyUsage,
    getLimitsForDomain,
    getCurrentSessions,
    updateCurrentSession,
    clearCurrentSession,
    getOverrideCount,
    startDomainSession,
    endDomainSession,
    formatTime
} from './storage.js';

/**
 * Parse time string (HH:MM) to minutes from midnight
 */
function parseTimeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Get current time as minutes from midnight
 */
function getCurrentTimeMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

/**
 * Check if current time is within a blocked time range
 */
function isInBlockedTimeRange(currentMinutes, blockedRanges) {
    if (!blockedRanges || blockedRanges.length === 0) {
        return false;
    }

    for (const range of blockedRanges) {
        const startMinutes = parseTimeToMinutes(range.start);
        const endMinutes = parseTimeToMinutes(range.end);

        // Handle overnight ranges (e.g., 22:00 to 10:00)
        if (startMinutes > endMinutes) {
            // Range spans midnight
            if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
                return true;
            }
        } else {
            // Normal range within same day
            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Get next allowed time after blocked range
 */
function getNextAllowedTimeFromRange(currentMinutes, blockedRanges) {
    if (!blockedRanges || blockedRanges.length === 0) {
        return null;
    }

    for (const range of blockedRanges) {
        const startMinutes = parseTimeToMinutes(range.start);
        const endMinutes = parseTimeToMinutes(range.end);

        if (startMinutes > endMinutes) {
            // Overnight range
            if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
                // Next allowed is at end time today (if before midnight) or tomorrow
                const now = new Date();
                const nextAllowed = new Date(now);

                if (currentMinutes >= startMinutes) {
                    // After start, so end is tomorrow
                    nextAllowed.setDate(nextAllowed.getDate() + 1);
                }

                nextAllowed.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
                return nextAllowed.getTime();
            }
        } else {
            if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
                const now = new Date();
                const nextAllowed = new Date(now);
                nextAllowed.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
                return nextAllowed.getTime();
            }
        }
    }

    return null;
}

/**
 * Get tomorrow at midnight
 */
function getTomorrowMidnight() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
}

/**
 * Main access check function
 * Determines if a domain can be accessed and why/why not
 */
export async function canAccessWebsite(domain) {
    const currentTime = Date.now();
    const currentMinutes = getCurrentTimeMinutes();

    // Get limits for this domain
    const limits = await getLimitsForDomain(domain);

    // No limits set - access allowed
    if (!limits) {
        return {
            allowed: true,
            hasLimits: false
        };
    }

    // Get today's usage
    const todayUsage = await getDailyUsage();
    const domainUsage = todayUsage[domain] || { totalTime: 0, sessions: [] };

    // Calculate effective total time (accounting for offset)
    const todayKey = getTodayKey();
    let effectiveTotalTime = domainUsage.totalTime;

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/e3ab4947-5180-4656-9d58-22115132ae54',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sessionManager.js:canAccessWebsite',message:'Access check start',data:{domain,totalTime:domainUsage.totalTime,dailyLimit:limits.dailyTotal,usageOffset:limits.usageOffset,todayKey},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion

    if (limits.usageOffset && limits.usageOffset.date === todayKey) {
        effectiveTotalTime = Math.max(0, domainUsage.totalTime - limits.usageOffset.duration);
    }

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/e3ab4947-5180-4656-9d58-22115132ae54',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sessionManager.js:canAccessWebsite',message:'Effective time calculated',data:{domain,effectiveTotalTime,dailyLimit:limits.dailyTotal,willBlock:limits.dailyTotal && effectiveTotalTime >= limits.dailyTotal},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion

    // Get current session info
    const currentSessions = await getCurrentSessions();
    const currentSession = currentSessions[domain];

    // Check 1: Time-based blocking
    if (isInBlockedTimeRange(currentMinutes, limits.blockedTimeRanges)) {
        return {
            allowed: false,
            hasLimits: true,
            reason: 'blocked_time_range',
            reasonText: 'Access blocked during this time period',
            nextAvailable: getNextAllowedTimeFromRange(currentMinutes, limits.blockedTimeRanges),
            limits,
            usage: domainUsage
        };
    }

    // Check 2: Daily total limit
    if (limits.dailyTotal && effectiveTotalTime >= limits.dailyTotal) {
        return {
            allowed: false,
            hasLimits: true,
            reason: 'daily_limit_reached',
            reasonText: 'Daily time limit reached',
            nextAvailable: getTomorrowMidnight(),
            limits,
            usage: domainUsage
        };
    }

    // Check 3: Session count limit
    const completedSessions = domainUsage.sessions.filter(s => s.endTime).length;
    const totalSessionsUsed = completedSessions + (currentSession ? 1 : 0);
    if (limits.sessionCount && totalSessionsUsed > limits.sessionCount) {
        // This handles the case where user is in a session that exceeds the limit
        return {
            allowed: false,
            hasLimits: true,
            reason: 'session_count_exceeded',
            reasonText: `All ${limits.sessionCount} sessions used today`,
            nextAvailable: getTomorrowMidnight(),
            sessionsUsed: totalSessionsUsed,
            sessionsTotal: limits.sessionCount,
            limits,
            usage: domainUsage
        };
    }
    if (limits.sessionCount && completedSessions >= limits.sessionCount && !currentSession) {
        // All sessions completed, cannot start a new one
        return {
            allowed: false,
            hasLimits: true,
            reason: 'session_count_exceeded',
            reasonText: `All ${limits.sessionCount} sessions used today`,
            nextAvailable: getTomorrowMidnight(),
            sessionsUsed: completedSessions,
            sessionsTotal: limits.sessionCount,
            limits,
            usage: domainUsage
        };
    }

    // Check 4: Current session limit
    if (currentSession && limits.perSessionLimit) {
        // Get actual accumulated session duration from storage (not calculated from startTime)
        // This avoids counting idle time as session time
        let sessionDuration = 0;
        if (domainUsage.sessions && domainUsage.sessions.length > 0) {
            const lastSession = domainUsage.sessions[domainUsage.sessions.length - 1];
            if (lastSession && !lastSession.endTime) {
                sessionDuration = lastSession.duration || 0;
            }
        }
        
        if (sessionDuration >= limits.perSessionLimit) {
            const nextAvailable = currentTime +
                (limits.minBreakInterval ? limits.minBreakInterval * 1000 : 0);
            return {
                allowed: false,
                hasLimits: true,
                reason: 'session_limit_reached',
                reasonText: 'Session time limit reached',
                nextAvailable,
                breakRequired: limits.minBreakInterval,
                limits,
                usage: domainUsage
            };
        }
    }

    // Check 5: Break interval between sessions
    if (limits.minBreakInterval && !currentSession) {
        const lastSession = domainUsage.sessions
            .filter(s => s.endTime)
            .sort((a, b) => b.endTime - a.endTime)[0];

        if (lastSession) {
            const timeSinceLastSession = Math.floor((currentTime - lastSession.endTime) / 1000);
            if (timeSinceLastSession < limits.minBreakInterval) {
                const nextAvailable = lastSession.endTime + (limits.minBreakInterval * 1000);
                return {
                    allowed: false,
                    hasLimits: true,
                    reason: 'break_interval_required',
                    reasonText: 'Break time required between sessions',
                    nextAvailable,
                    breakRemaining: limits.minBreakInterval - timeSinceLastSession,
                    limits,
                    usage: domainUsage
                };
            }
        }
    }

    // Access allowed - calculate remaining time
    let sessionTimeRemaining = null;
    let dailyTimeRemaining = null;
    let sessionsRemaining = null;

    if (limits.perSessionLimit && currentSession) {
        // Get actual accumulated session duration from storage
        let sessionDuration = 0;
        if (domainUsage.sessions && domainUsage.sessions.length > 0) {
            const lastSession = domainUsage.sessions[domainUsage.sessions.length - 1];
            if (lastSession && !lastSession.endTime) {
                sessionDuration = lastSession.duration || 0;
            }
        }
        sessionTimeRemaining = limits.perSessionLimit - sessionDuration;
    } else if (limits.perSessionLimit) {
        sessionTimeRemaining = limits.perSessionLimit;
    }

    if (limits.dailyTotal) {
        dailyTimeRemaining = limits.dailyTotal - effectiveTotalTime;
    }

    if (limits.sessionCount) {
        sessionsRemaining = limits.sessionCount - completedSessions - (currentSession ? 1 : 0);
    }

    return {
        allowed: true,
        hasLimits: true,
        sessionTimeRemaining,
        dailyTimeRemaining,
        sessionsRemaining,
        currentSession,
        isWarning: sessionTimeRemaining !== null && sessionTimeRemaining <= 300, // 5 min warning
        limits,
        usage: domainUsage
    };
}

/**
 * Start a new session for a domain
 */
export async function startSession(domain) {
    const currentTime = Date.now();

    // Record in daily usage
    await startDomainSession(domain, currentTime);

    // Update current session tracker
    const todayUsage = await getDailyUsage();
    const sessions = todayUsage[domain]?.sessions || [];

    await updateCurrentSession(domain, {
        sessionIndex: sessions.length - 1,
        startTime: currentTime,
        lastBreakEnd: currentTime
    });

    return {
        startTime: currentTime,
        sessionIndex: sessions.length - 1
    };
}

/**
 * End current session for a domain
 */
export async function endSession(domain) {
    const session = await endDomainSession(domain);
    await clearCurrentSession(domain);
    return session;
}

/**
 * Get session status for popup display
 */
export async function getSessionStatus(domain) {
    const accessCheck = await canAccessWebsite(domain);
    const limits = accessCheck.limits;
    const usage = accessCheck.usage || { totalTime: 0, sessions: [] };

    if (!limits) {
        return {
            hasLimits: false,
            allowed: true,  // Fix: explicitly set allowed to true when no limits
            totalTimeToday: usage.totalTime,
            totalTimeTodayFormatted: formatTime(usage.totalTime)
        };
    }

    const currentSessions = await getCurrentSessions();
    const currentSession = currentSessions[domain];

    // Get actual accumulated session duration from storage (not calculated from startTime)
    // This avoids counting idle time as session time
    let currentSessionDuration = 0;
    if (currentSession && usage.sessions.length > 0) {
        const lastSession = usage.sessions[usage.sessions.length - 1];
        if (lastSession && !lastSession.endTime) {
            currentSessionDuration = lastSession.duration || 0;
        }
    }

    const completedSessions = usage.sessions.filter(s => s.endTime).length;

    return {
        hasLimits: true,
        allowed: accessCheck.allowed,
        reason: accessCheck.reason,
        reasonText: accessCheck.reasonText,
        nextAvailable: accessCheck.nextAvailable,

        // Current session info
        inSession: !!currentSession,
        currentSessionDuration,
        currentSessionDurationFormatted: formatTime(currentSessionDuration),
        sessionTimeRemaining: accessCheck.sessionTimeRemaining,
        sessionTimeRemainingFormatted: accessCheck.sessionTimeRemaining
            ? formatTime(accessCheck.sessionTimeRemaining)
            : null,

        // Daily info
        totalTimeToday: usage.totalTime,
        totalTimeTodayFormatted: formatTime(usage.totalTime),
        dailyTimeRemaining: accessCheck.dailyTimeRemaining,
        dailyTimeRemainingFormatted: accessCheck.dailyTimeRemaining
            ? formatTime(accessCheck.dailyTimeRemaining)
            : null,

        // Session count
        sessionsUsed: completedSessions + (currentSession ? 1 : 0),
        sessionsTotal: limits.sessionCount,
        sessionsRemaining: accessCheck.sessionsRemaining,

        // Status indicators
        isWarning: accessCheck.isWarning,
        status: getStatusColor(accessCheck)
    };
}

/**
 * Get status color based on access check
 */
function getStatusColor(accessCheck) {
    if (!accessCheck.allowed) {
        if (accessCheck.reason === 'blocked_time_range') {
            return 'gray';
        }
        return 'red';
    }

    if (accessCheck.isWarning) {
        return 'yellow';
    }

    return 'green';
}

/**
 * Check if emergency override is available
 */
export async function canUseEmergencyOverride(domain) {
    const limits = await getLimitsForDomain(domain);

    if (!limits || !limits.enforcement?.emergencyOverride) {
        return { available: false, reason: 'Override not enabled' };
    }

    const overrideCount = await getOverrideCount(domain);
    const maxOverrides = limits.enforcement.maxOverridesPerDay || 2;

    if (overrideCount >= maxOverrides) {
        return {
            available: false,
            reason: `Maximum overrides used (${overrideCount}/${maxOverrides})`
        };
    }

    return {
        available: true,
        remaining: maxOverrides - overrideCount
    };
}

export { isInBlockedTimeRange, parseTimeToMinutes, getCurrentTimeMinutes };
