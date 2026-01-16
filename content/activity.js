/**
 * Activity Detector - Detects media playback state
 */

let mediaCheckInterval = null;
let isMediaPlaying = false;

// Check for playing media
let isContextInvalidated = false;

function checkMediaState() {
    if (isContextInvalidated) return;

    const mediaElements = document.querySelectorAll('video, audio');
    let playing = false;

    for (const el of mediaElements) {
        if (!el.paused && !el.ended && el.readyState > 2) {
            playing = true;
            break;
        }
    }

    if (playing !== isMediaPlaying) {
        isMediaPlaying = playing;

        // Notify background
        try {
            if (!chrome.runtime?.id) {
                throw new Error('Extension context invalidated');
            }
            chrome.runtime.sendMessage({
                type: 'ACTIVITY_UPDATE',
                isMediaPlaying: playing
            });
        } catch (e) {
            // Connection might be lost if extension reloaded
            isContextInvalidated = true;
            if (mediaCheckInterval) clearInterval(mediaCheckInterval);

            // Remove event listeners
            ['play', 'pause', 'ended'].forEach(event => {
                document.removeEventListener(event, checkMediaState, true);
            });
            console.log('Screen Time Tracker: Context invalidated, stopping monitoring');
        }
    }
}

// Start checking
function startMonitoring() {
    // Initial check
    checkMediaState();

    // Poll every 2 seconds
    mediaCheckInterval = setInterval(checkMediaState, 2000);

    // Also listen for events
    ['play', 'pause', 'ended'].forEach(event => {
        document.addEventListener(event, checkMediaState, true);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startMonitoring);
} else {
    startMonitoring();
}
