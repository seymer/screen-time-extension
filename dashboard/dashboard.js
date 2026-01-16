/**
 * Dashboard Script - Handles dashboard UI, charts, and data management
 */

// State
let currentSection = 'overview';
let currentDateRange = 'today';
let usageData = {};
let categories = {};
let limits = {};
let charts = {};

// DOM Elements
const elements = {
    pageTitle: document.getElementById('pageTitle'),
    dateRange: document.getElementById('dateRange'),
    statTotalTime: document.getElementById('statTotalTime'),
    statSitesCount: document.getElementById('statSitesCount'),
    statTopSite: document.getElementById('statTopSite'),
    statSessions: document.getElementById('statSessions'),
    topSitesTable: document.getElementById('topSitesTable'),
    allSitesTable: document.getElementById('allSitesTable'),
    sessionTimeline: document.getElementById('sessionTimeline'),
    limitsTable: document.getElementById('limitsTable'),
    categoryFilter: document.getElementById('categoryFilter'),
    sortBy: document.getElementById('sortBy'),
    limitModal: document.getElementById('limitModal'),
    limitForm: document.getElementById('limitForm'),
    blockedRanges: document.getElementById('blockedRanges')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    init();
});

async function init() {
    setupNavigation();
    setupDateFilter();
    setupModalHandlers();
    await loadData();
    renderCurrentSection();
}

// Navigation
function setupNavigation() {
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            setActiveSection(section);
        });
    });
}

function setActiveSection(section) {
    currentSection = section;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === section);
    });

    // Update sections
    document.querySelectorAll('.section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `${section}Section`);
    });

    // Update title
    const titles = {
        overview: 'Overview',
        sites: 'All Sites',
        timeline: 'Timeline',
        limits: 'Limits'
    };
    elements.pageTitle.textContent = titles[section] || 'Overview';

    renderCurrentSection();
}

// Date Filter
function setupDateFilter() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const range = btn.dataset.range;
            setDateRange(range);
        });
    });
}

function setDateRange(range) {
    currentDateRange = range;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.range === range);
    });

    const rangeLabels = {
        today: 'Today',
        week: 'Past 7 Days',
        month: 'Past 30 Days',
        custom: 'Custom Range'
    };
    elements.dateRange.textContent = rangeLabels[range];

    loadData().then(() => renderCurrentSection());
}

function getDateRange() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    let startDate, endDate;
    endDate = formatDate(today);

    switch (currentDateRange) {
        case 'today':
            startDate = endDate;
            break;
        case 'week':
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 6);
            startDate = formatDate(weekAgo);
            break;
        case 'month':
            const monthAgo = new Date(today);
            monthAgo.setDate(monthAgo.getDate() - 29);
            startDate = formatDate(monthAgo);
            break;
        default:
            startDate = endDate;
    }

    return { startDate, endDate };
}

// Load Data
async function loadData() {
    try {
        const { startDate, endDate } = getDateRange();
        const response = await chrome.runtime.sendMessage({
            type: 'GET_USAGE_DATA',
            startDate,
            endDate
        });

        usageData = response.usage || {};
        categories = response.categories || {};

        // Get limits
        const storage = await chrome.storage.local.get('limits');
        limits = storage.limits || {};
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Render Sections
function renderCurrentSection() {
    switch (currentSection) {
        case 'overview':
            renderOverview();
            break;
        case 'sites':
            renderAllSites();
            break;
        case 'timeline':
            renderTimeline();
            break;
        case 'limits':
            renderLimits();
            break;
    }
}

function renderOverview() {
    const aggregated = aggregateUsageData();

    // Update stats
    elements.statTotalTime.textContent = formatTime(aggregated.totalTime);
    elements.statSitesCount.textContent = aggregated.sites.length;
    elements.statTopSite.textContent = aggregated.sites[0]?.domain || '-';
    elements.statSessions.textContent = aggregated.totalSessions;

    // Render top sites
    renderTopSites(aggregated.sites.slice(0, 5));

    // Render charts
    renderPieChart(aggregated.sites.slice(0, 6));
    renderBarChart();
}

function aggregateUsageData() {
    const siteMap = {};
    let totalTime = 0;
    let totalSessions = 0;

    for (const [date, dayData] of Object.entries(usageData)) {
        for (const [domain, data] of Object.entries(dayData)) {
            if (!siteMap[domain]) {
                siteMap[domain] = {
                    domain,
                    time: 0,
                    sessions: 0,
                    category: categories[domain] || 'Other'
                };
            }
            siteMap[domain].time += data.totalTime || 0;
            siteMap[domain].sessions += data.sessions?.length || 0;
            totalTime += data.totalTime || 0;
            totalSessions += data.sessions?.length || 0;
        }
    }

    const sites = Object.values(siteMap).sort((a, b) => b.time - a.time);

    return { sites, totalTime, totalSessions };
}

function renderTopSites(sites) {
    if (!sites.length) {
        elements.topSitesTable.innerHTML = '<div class="empty-state">No activity recorded</div>';
        return;
    }

    elements.topSitesTable.innerHTML = sites.map(site => `
    <div class="site-row">
      <img class="site-favicon" 
           src="https://www.google.com/s2/favicons?domain=${site.domain}&sz=64" 
           alt=""
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%236366f1%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22/></svg>'">
      <div class="site-info">
        <span class="site-domain">${site.domain}</span>
        <span class="site-sessions">${site.sessions} session${site.sessions !== 1 ? 's' : ''}</span>
      </div>
      <span class="category-badge" data-category="${site.category}">${site.category}</span>
      <span class="site-time">${formatTime(site.time)}</span>
      <div class="site-actions">
        <button class="icon-btn set-limit-btn" data-domain="${site.domain}" title="Set limit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

function renderAllSites() {
    const aggregated = aggregateUsageData();
    let sites = [...aggregated.sites];

    // Filter by category
    const categoryFilter = elements.categoryFilter.value;
    if (categoryFilter !== 'all') {
        sites = sites.filter(s => s.category === categoryFilter);
    }

    // Sort
    const sortBy = elements.sortBy.value;
    switch (sortBy) {
        case 'name':
            sites.sort((a, b) => a.domain.localeCompare(b.domain));
            break;
        case 'sessions':
            sites.sort((a, b) => b.sessions - a.sessions);
            break;
        default:
            sites.sort((a, b) => b.time - a.time);
    }

    if (!sites.length) {
        elements.allSitesTable.innerHTML = '<div class="empty-state">No sites found</div>';
        return;
    }

    elements.allSitesTable.innerHTML = sites.map(site => `
    <div class="site-row">
      <img class="site-favicon" 
           src="https://www.google.com/s2/favicons?domain=${site.domain}&sz=64" 
           alt="">
      <div class="site-info">
        <span class="site-domain">${site.domain}</span>
        <span class="site-sessions">${site.sessions} session${site.sessions !== 1 ? 's' : ''}</span>
      </div>
      <span class="category-badge" data-category="${site.category}">${site.category}</span>
      <span class="site-time">${formatTime(site.time)}</span>
      <div class="site-actions">
        <button class="icon-btn set-limit-btn" data-domain="${site.domain}" title="Set limit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

    // Setup filter listeners
    elements.categoryFilter.onchange = renderAllSites;
    elements.sortBy.onchange = renderAllSites;
}

function renderTimeline() {
    renderHourlyChart();
    renderSessionTimeline();
}

function renderSessionTimeline() {
    const timeline = elements.sessionTimeline;

    // Get last 7 days of data
    const days = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        if (usageData[dateKey]) {
            days.push({ date: dateKey, data: usageData[dateKey] });
        }
    }

    if (!days.length) {
        timeline.innerHTML = '<div class="empty-state">No session data available</div>';
        return;
    }

    timeline.innerHTML = days.map(day => {
        const sessions = [];
        for (const [domain, data] of Object.entries(day.data)) {
            if (data.sessions) {
                for (const session of data.sessions) {
                    if (session.startTime) {
                        sessions.push({
                            domain,
                            ...session,
                            color: getCategoryColor(categories[domain] || 'Other')
                        });
                    }
                }
            }
        }

        return `
      <div class="timeline-day">
        <div class="timeline-date">${formatDate(day.date)}</div>
        <div class="timeline-hours">
          ${Array.from({ length: 24 }, (_, i) => `
            <div class="timeline-hour">
              ${i % 4 === 0 ? `<span class="timeline-hour-label">${i}:00</span>` : ''}
            </div>
          `).join('')}
          ${sessions.map(s => renderTimelineSession(s)).join('')}
        </div>
      </div>
    `;
    }).join('');
}

function renderTimelineSession(session) {
    const startDate = new Date(session.startTime);
    const startHour = startDate.getHours() + startDate.getMinutes() / 60;
    const duration = (session.duration || 0) / 3600; // Convert to hours

    const left = (startHour / 24) * 100;
    const width = Math.max((duration / 24) * 100, 0.5);

    return `
    <div class="timeline-session" 
         style="left: ${left}%; width: ${width}%; background: ${session.color};"
         title="${session.domain}: ${formatTime(session.duration || 0)}">
    </div>
  `;
}

function renderLimits() {
    if (!Object.keys(limits).length) {
        elements.limitsTable.innerHTML = `
      <div class="empty-state">
        <p>No limits configured yet.</p>
        <p style="margin-top: 8px; color: var(--text-muted);">Click "Add Limit" to set time limits for websites.</p>
      </div>
    `;
        return;
    }

    elements.limitsTable.innerHTML = Object.entries(limits).map(([domain, limit]) => `
    <div class="limit-row">
      <img class="site-favicon" 
           src="https://www.google.com/s2/favicons?domain=${domain}&sz=64" 
           alt="">
      <div class="limit-info">
        <span class="site-domain">${domain}</span>
        <div class="limit-details">
          ${limit.dailyTotal ? `
            <span class="limit-detail">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2"/></svg>
              ${formatTime(limit.dailyTotal)}/day
            </span>
          ` : ''}
          ${limit.sessionCount ? `
            <span class="limit-detail">
              <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" stroke-width="2"/></svg>
              ${limit.sessionCount} sessions
            </span>
          ` : ''}
          ${limit.perSessionLimit ? `
            <span class="limit-detail">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 2v10l4.5 4.5" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/></svg>
              ${formatTime(limit.perSessionLimit)}/session
            </span>
          ` : ''}
        </div>
      </div>
      <div class="limit-status">
        <span class="status-dot active"></span>
        <span>Active</span>
      </div>
      <div class="site-actions">
        <button class="icon-btn edit-limit-btn" data-domain="${domain}" title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
        <button class="icon-btn delete-limit-btn" data-domain="${domain}" title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

// Charts
function renderPieChart(sites) {
    const ctx = document.getElementById('pieChart');
    if (!ctx) return;

    if (charts.pie) {
        charts.pie.destroy();
    }

    if (!sites.length) {
        return;
    }

    const colors = sites.map(s => getCategoryColor(s.category));

    charts.pie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sites.map(s => s.domain),
            datasets: [{
                data: sites.map(s => s.time),
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#a0a0c0',
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${formatTime(context.raw)}`
                    }
                }
            }
        }
    });
}

function renderBarChart() {
    const ctx = document.getElementById('barChart');
    if (!ctx) return;

    if (charts.bar) {
        charts.bar.destroy();
    }

    // Get last 7 days
    const labels = [];
    const data = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];

        labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));

        let dayTotal = 0;
        if (usageData[dateKey]) {
            for (const siteData of Object.values(usageData[dateKey])) {
                dayTotal += siteData.totalTime || 0;
            }
        }
        data.push(dayTotal / 3600); // Convert to hours
    }

    charts.bar = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: 'rgba(99, 102, 241, 0.7)',
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.raw.toFixed(1)} hours`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#6b6b90' },
                    title: {
                        display: true,
                        text: 'Hours',
                        color: '#a0a0c0'
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#a0a0c0' }
                }
            }
        }
    });
}

function renderHourlyChart() {
    const ctx = document.getElementById('hourlyChart');
    if (!ctx) return;

    if (charts.hourly) {
        charts.hourly.destroy();
    }

    // Aggregate hourly data
    const hourlyData = Array(24).fill(0);

    for (const dayData of Object.values(usageData)) {
        for (const siteData of Object.values(dayData)) {
            if (siteData.sessions) {
                for (const session of siteData.sessions) {
                    if (session.startTime) {
                        const hour = new Date(session.startTime).getHours();
                        hourlyData[hour] += session.duration || 0;
                    }
                }
            }
        }
    }

    charts.hourly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
            datasets: [{
                data: hourlyData.map(s => s / 60), // Convert to minutes
                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `${Math.round(context.raw)} min`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#6b6b90' },
                    title: {
                        display: true,
                        text: 'Minutes',
                        color: '#a0a0c0'
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#a0a0c0',
                        maxRotation: 0,
                        callback: function (value, index) {
                            return index % 3 === 0 ? this.getLabelForValue(value) : '';
                        }
                    }
                }
            }
        }
    });
}

// Modal Handlers
function setupModalHandlers() {
    document.getElementById('addLimitBtn').addEventListener('click', () => openLimitModal());
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelModal').addEventListener('click', closeModal);
    document.getElementById('addRangeBtn').addEventListener('click', addBlockedRange);

    elements.limitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveLimit();
    });

    // Close on backdrop click
    document.querySelector('.modal-backdrop').addEventListener('click', closeModal);

    // Event Delegation for Tables
    const handleTableClick = (e) => {
        const setLimitBtn = e.target.closest('.set-limit-btn');
        if (setLimitBtn) {
            const domain = setLimitBtn.dataset.domain;
            openLimitModal(domain);
            return;
        }

        const editBtn = e.target.closest('.edit-limit-btn');
        if (editBtn) {
            const domain = editBtn.dataset.domain;
            openLimitModal(domain);
            return;
        }

        const deleteBtn = e.target.closest('.delete-limit-btn');
        if (deleteBtn) {
            const domain = deleteBtn.dataset.domain;
            deleteLimit(domain);
            return;
        }
    };

    elements.topSitesTable.addEventListener('click', handleTableClick);
    elements.allSitesTable.addEventListener('click', handleTableClick);
    elements.limitsTable.addEventListener('click', handleTableClick);
}

function openLimitModal(domain = '') {
    elements.limitModal.classList.remove('hidden');
    document.getElementById('modalTitle').textContent = domain ? 'Edit Limit' : 'Add Limit';

    // Reset form
    elements.limitForm.reset();
    elements.blockedRanges.innerHTML = '';

    // Pre-fill if editing
    if (domain) {
        document.getElementById('limitDomain').value = domain;
        document.getElementById('limitDomain').readOnly = true;

        const limit = limits[domain];
        if (limit) {
            if (limit.dailyTotal) document.getElementById('dailyLimit').value = limit.dailyTotal / 3600;
            if (limit.sessionCount) document.getElementById('sessionCount').value = limit.sessionCount;
            if (limit.perSessionLimit) document.getElementById('perSessionLimit').value = limit.perSessionLimit / 60;
            if (limit.minBreakInterval) document.getElementById('breakInterval').value = limit.minBreakInterval / 60;

            document.getElementById('hardBlock').checked = limit.enforcement?.hardBlock ?? true;
            document.getElementById('showWarnings').checked = limit.enforcement?.showWarnings ?? true;
            document.getElementById('emergencyOverride').checked = limit.enforcement?.emergencyOverride ?? false;

            if (limit.blockedTimeRanges) {
                limit.blockedTimeRanges.forEach(range => {
                    addBlockedRange(range.start, range.end);
                });
            }
        }
    } else {
        document.getElementById('limitDomain').readOnly = false;
    }
}

function closeModal() {
    elements.limitModal.classList.add('hidden');
}

function addBlockedRange(start = '', end = '') {
    const rangeHtml = `
    <div class="blocked-range">
      <input type="time" class="range-start" value="${start || '22:00'}">
      <span>to</span>
      <input type="time" class="range-end" value="${end || '08:00'}">
      <button type="button" class="remove-range-btn" onclick="this.parentElement.remove()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `;
    elements.blockedRanges.insertAdjacentHTML('beforeend', rangeHtml);
}

async function saveLimit() {
    const domain = document.getElementById('limitDomain').value.trim();
    if (!domain) return;

    const dailyLimit = parseInt(document.getElementById('dailyLimit').value) || 0;
    const sessionCount = parseInt(document.getElementById('sessionCount').value) || 0;
    const perSessionLimit = parseInt(document.getElementById('perSessionLimit').value) || 0;
    const breakInterval = parseInt(document.getElementById('breakInterval').value) || 0;

    const blockedTimeRanges = [];
    elements.blockedRanges.querySelectorAll('.blocked-range').forEach(range => {
        const start = range.querySelector('.range-start').value;
        const end = range.querySelector('.range-end').value;
        if (start && end) {
            blockedTimeRanges.push({ start, end });
        }
    });

    const limitConfig = {
        dailyTotal: dailyLimit * 3600 || null,
        sessionCount: sessionCount || null,
        perSessionLimit: perSessionLimit * 60 || null,
        minBreakInterval: breakInterval * 60 || null,
        blockedTimeRanges,
        enforcement: {
            hardBlock: document.getElementById('hardBlock').checked,
            showWarnings: document.getElementById('showWarnings').checked,
            emergencyOverride: document.getElementById('emergencyOverride').checked,
            maxOverridesPerDay: 2
        }
    };

    // Calculate usage offset for "limit starts from now" behavior
    const todayKey = new Date().toISOString().split('T')[0];
    let currentUsage = 0;

    // Check if we have usage data for today
    if (usageData[todayKey] && usageData[todayKey][domain]) {
        currentUsage = usageData[todayKey][domain].totalTime || 0;
    }

    // If there's an existing limit for today, we might want to keep the original offset
    // OR if we are modifying it, maybe we want to reset it?
    // The user request "setting a time limit... timing starts from the moment it is set"
    // implies that we should SNAPSHOT the current usage NOW as the offset.

    if (dailyLimit > 0) {
        limitConfig.usageOffset = {
            date: todayKey,
            duration: currentUsage
        };
    }

    // Save to storage
    limits[domain] = limitConfig;
    await chrome.storage.local.set({ limits });

    // Notify background to re-check limits immediately
    chrome.runtime.sendMessage({ type: 'LIMITS_UPDATED' });

    closeModal();
    renderLimits();
}

async function deleteLimit(domain) {
    if (confirm(`Remove limit for ${domain}?`)) {
        delete limits[domain];
        await chrome.storage.local.set({ limits });

        // Notify background to re-check limits immediately
        chrome.runtime.sendMessage({ type: 'LIMITS_UPDATED' });

        renderLimits();
    }
}

// Make functions globally available
// window.openLimitModal = openLimitModal;
// window.deleteLimit = deleteLimit;

// Utility Functions
function formatTime(seconds) {
    if (!seconds || seconds < 0) return '0m';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
}

function getCategoryColor(category) {
    const colors = {
        'Social Media': '#E91E63',
        'Entertainment': '#9C27B0',
        'Work/Productivity': '#4CAF50',
        'News': '#2196F3',
        'Shopping': '#FF9800',
        'Other': '#607D8B'
    };
    return colors[category] || colors['Other'];
}

// Export button handler
document.getElementById('exportBtn')?.addEventListener('click', async () => {
    try {
        const data = await chrome.storage.local.get(null);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `screen-time-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Export failed:', error);
    }
});
