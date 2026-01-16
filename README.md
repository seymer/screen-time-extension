# Screen Time Tracker - Chrome Extension

A comprehensive Chrome extension for tracking and managing your browsing time with advanced session limits and blocking features.

## Features

- **Time Tracking**: Track active time on each website by domain
- **Session Management**: Segment daily limits into multiple sessions with break intervals
- **Time-Based Blocking**: Block access during specified time ranges
- **Visual Dashboard**: Charts and statistics for usage analysis
- **Custom Limits**: Configure per-site daily limits, session limits, and breaks
- **Categories**: Organize websites into categories (Social Media, Entertainment, etc.)
- **Privacy First**: All data stored locally, no external servers

## Installation

### Load as Unpacked Extension (Development)

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `screen-time-extension` folder
5. The extension icon should appear in your toolbar

## Usage

### Basic Tracking
- The extension automatically tracks time on all websites when enabled
- Click the extension icon to see today's summary and current site status

### Setting Limits
1. Click the extension icon → **Open Dashboard** or **Settings**
2. Navigate to **Limits** section
3. Click **Add Limit** and configure:
   - **Daily Total Limit**: Maximum total time per day
   - **Sessions Per Day**: Number of allowed sessions
   - **Per Session Limit**: Maximum time per session
   - **Break Between Sessions**: Required wait time between sessions
   - **Blocked Time Ranges**: Periods when access is blocked (e.g., 22:00-08:00)

### Example Configuration
For limiting YouTube:
- Daily limit: 3 hours
- Sessions: 3 per day
- Per session: 1 hour
- Break interval: 2 hours
- Blocked time: 22:00 - 10:00 (nighttime)

### Dashboard Features
- **Overview**: Total time, top sites, charts
- **All Sites**: Complete list with category tags
- **Timeline**: Hourly activity and session visualization
- **Limits**: View and manage all configured limits

### Blocking Behavior
- When a limit is reached, a blocking page appears showing:
  - Reason for block
  - Countdown to next available access
  - Daily statistics
  - Emergency override option (if enabled)

## Data Management

- **Export**: Download all data as JSON backup
- **Import**: Restore from backup file
- **Clear**: Delete all tracking data and settings

## Permissions Used

| Permission | Purpose |
|------------|---------|
| `tabs` | Track active tab and domain |
| `storage` | Save usage data locally |
| `alarms` | Schedule limit checks and midnight reset |
| `notifications` | Warn before session ends |
| `idle` | Detect user inactivity |
| `scripting` | Inject blocking page |
| `declarativeNetRequest` | Block restricted domains |

## File Structure

```
screen-time-extension/
├── manifest.json           # Extension configuration
├── background.js           # Service worker
├── utils/
│   ├── storage.js          # Storage operations
│   └── sessionManager.js   # Session logic
├── popup/
│   ├── popup.html/css/js   # Extension popup
├── dashboard/
│   ├── dashboard.html/css/js  # Full dashboard
├── blocked/
│   ├── blocked.html/css/js # Blocking page
├── settings/
│   ├── settings.html/css/js # Settings page
├── icons/                  # Extension icons
└── rules/
    └── blocking_rules.json # Dynamic blocking rules
```

## Testing

### Core Tracking Test
1. Visit any website
2. Wait 10+ seconds
3. Click extension popup
4. Verify time is tracked

### Session Limit Test
1. Set a test limit (e.g., 2-minute session, 1-minute break)
2. Visit the domain
3. Wait for session limit
4. Verify blocking page appears
5. Wait for break interval
6. Verify access restored

### Time-Based Blocking Test
1. Set a blocked time range including current time
2. Verify immediate blocking with correct message

## Privacy

- All data stored locally in Chrome's storage
- No data sent to external servers
- Export/clear functionality available
- Option to exclude specific sites from tracking

## Troubleshooting

**Extension not tracking?**
- Check if tracking is enabled (toggle in popup)
- Verify the site isn't in the excluded list

**Blocking not working?**
- Ensure "Hard block" is enabled for the limit
- Check if you're in a blocked time range
- Try reloading the extension

**Data not persisting?**
- Check Chrome storage quota
- Try exporting and reimporting data

## Version

v1.0.0 - Initial Release
