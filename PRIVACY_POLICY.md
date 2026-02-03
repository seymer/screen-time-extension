# Privacy Policy for Screen Time Tracker

**Last Updated:** February 3, 2026

## 1. Introduction

Screen Time Tracker ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how our Chrome extension collects, uses, and safeguards your data.

## 2. Data Collection

The extension collects the following data exclusively for its core functionality:
- **Browsing Activity:** The URLs of the websites you visit are monitored locally to track the time spent on them.
- **Time Data:** Duration of visits to specific domains.
- **Settings & Preferences:** Your customized limits, categories, and configuration settings.

## 3. Data Usage

The collected data is used internally by the extension for the following purposes:
- **Time Tracking:** To calculate and display the amount of time spent on different websites.
- **Blocking & Limits:** To enforce the browsing limits you have set (e.g., blocking a site after 30 minutes).
- **Statistics:** To generate charts and summaries of your daily browsing habits.

## 4. Data Storage and Privacy

- **Local Storage:** All data is stored locally on your device using the Chrome Storage API (`chrome.storage.local`).
- **No External Transmission:** We do **not** transmit, sell, share, or upload your browsing data to any external servers, third-party analytics, or cloud storage.
- **Offline Functionality:** The extension operates primarily offline. The only external connection is to Google's Favicon service to retrieve website icons for display purposes.

## 5. Permissions

The extension requests the following permissions for operation:
- **`tabs` & `<all_urls>`:** Required to detect the current website and track time spent on it.
- **`storage`:** Required to save your time data and settings locally.
- **`alarms`:** Required to schedule daily resets and cleanup tasks.
- **`notifications`:** Required to alert you when a time limit is reached.
- **`idle`:** Required to pause tracking when you are away from the computer.
- **`declarativeNetRequest`:** Required to efficiently block access to sites when limits are exceeded.

## 6. Changes to This Policy

We may update this Privacy Policy from time to time. If we make material changes, we will notify you by updating the date at the top of this policy.

## 7. Contact Us

If you have any questions about this Privacy Policy, you can contact us via the Chrome Web Store support page.
