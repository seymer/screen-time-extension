/**
 * Settings Script - Handles settings UI, limits management, and data operations
 */

// State
let settings = {};
let limits = {};
let categories = {};
let editingDomain = null;

// DOM Elements
const elements = {
  idleTimeout: document.getElementById('idleTimeout'),
  retentionDays: document.getElementById('retentionDays'),
  defaultEnforcement: document.getElementById('defaultEnforcement'),
  limitsContainer: document.getElementById('limitsContainer'),
  categoriesContainer: document.getElementById('categoriesContainer'),
  newDomain: document.getElementById('newDomain'),
  newCategory: document.getElementById('newCategory'),
  addCategoryBtn: document.getElementById('addCategoryBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile'),
  clearBtn: document.getElementById('clearBtn'),
  addLimitBtn: document.getElementById('addLimitBtn'),
  limitModal: document.getElementById('limitModal'),
  limitForm: document.getElementById('limitForm'),
  modalTitle: document.getElementById('modalTitle'),
  closeModal: document.getElementById('closeModal'),
  cancelModal: document.getElementById('cancelModal'),
  deleteLimitBtn: document.getElementById('deleteLimitBtn'),
  saveLimitBtn: document.getElementById('saveLimitBtn'),
  blockedRanges: document.getElementById('blockedRanges'),
  addRangeBtn: document.getElementById('addRangeBtn')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
});

// Load settings from storage
async function loadSettings() {
  try {
    const data = await chrome.storage.local.get(['settings', 'limits', 'categories']);

    settings = data.settings || {
      idleTimeout: 30,
      retentionDays: 90,
      defaultEnforcement: 'hard'
    };

    limits = data.limits || {};
    categories = data.categories || {};

    // Update UI
    elements.idleTimeout.value = settings.idleTimeout;
    elements.retentionDays.value = settings.retentionDays;
    elements.defaultEnforcement.value = settings.defaultEnforcement;

    renderLimits();
    renderCategories();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Save settings to storage
async function saveSettings() {
  try {
    settings.idleTimeout = parseInt(elements.idleTimeout.value);
    settings.retentionDays = parseInt(elements.retentionDays.value);
    settings.defaultEnforcement = elements.defaultEnforcement.value;

    await chrome.storage.local.set({ settings });

    // Update idle detection
    chrome.idle.setDetectionInterval(settings.idleTimeout);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Settings changes
  elements.idleTimeout.addEventListener('change', saveSettings);
  elements.retentionDays.addEventListener('change', saveSettings);
  elements.defaultEnforcement.addEventListener('change', saveSettings);

  // Limits
  elements.addLimitBtn.addEventListener('click', () => openLimitModal());

  // Categories
  elements.addCategoryBtn.addEventListener('click', addCategory);
  elements.newDomain.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addCategory();
  });

  // Data management
  elements.exportBtn.addEventListener('click', exportData);
  elements.importBtn.addEventListener('click', () => elements.importFile.click());
  elements.importFile.addEventListener('change', importData);
  elements.clearBtn.addEventListener('click', clearData);

  // Modal
  elements.closeModal.addEventListener('click', closeModal);
  elements.cancelModal.addEventListener('click', closeModal);
  elements.deleteLimitBtn.addEventListener('click', deleteLimit);
  elements.addRangeBtn.addEventListener('click', () => addBlockedRange());
  elements.limitForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveLimit();
  });

  // Close modal on backdrop click
  document.querySelector('.modal-backdrop').addEventListener('click', closeModal);

  // Event Delegation for Limits List
  elements.limitsContainer.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-limit-btn');
    if (editBtn) {
      const domain = editBtn.dataset.domain;
      openLimitModal(domain);
    }
  });

  // Event Delegation for Categories List
  elements.categoriesContainer.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.remove-category-btn');
    if (removeBtn) {
      const domain = removeBtn.dataset.domain;
      removeCategory(domain);
    }
  });
}

// Render limits list
function renderLimits() {
  if (Object.keys(limits).length === 0) {
    elements.limitsContainer.innerHTML = `
      <div class="empty-state">
        <p>No website limits configured yet.</p>
        <p style="margin-top: 8px;">Click "Add Limit" to set time limits for websites.</p>
      </div>
    `;
    return;
  }

  elements.limitsContainer.innerHTML = Object.entries(limits).map(([domain, limit]) => `
    <div class="limit-card" data-domain="${domain}">
      <img class="limit-favicon" 
           src="https://www.google.com/s2/favicons?domain=${domain}&sz=64" 
           alt=""
           onerror="this.style.display='none'">
      <div class="limit-info">
        <div class="limit-domain">${domain}</div>
        <div class="limit-details">
          ${limit.dailyTotal ? `
            <span class="limit-detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              ${formatTime(limit.dailyTotal)}/day
            </span>
          ` : ''}
          ${limit.sessionCount ? `
            <span class="limit-detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
              ${limit.sessionCount} sessions
            </span>
          ` : ''}
          ${limit.perSessionLimit ? `
            <span class="limit-detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v10l4.5 4.5"/><circle cx="12" cy="12" r="10"/>
              </svg>
              ${formatTime(limit.perSessionLimit)}/session
            </span>
          ` : ''}
          ${limit.blockedTimeRanges?.length ? `
            <span class="limit-detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
              ${limit.blockedTimeRanges.length} blocked range${limit.blockedTimeRanges.length > 1 ? 's' : ''}
            </span>
          ` : ''}
        </div>
      </div>
      <div class="limit-actions">
        <button class="icon-btn edit-limit-btn" data-domain="${domain}" title="Edit">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

// Render categories list
function renderCategories() {
  if (Object.keys(categories).length === 0) {
    elements.categoriesContainer.innerHTML = '<p class="empty-state" style="padding: 20px;">No custom categories assigned yet.</p>';
    return;
  }

  elements.categoriesContainer.innerHTML = Object.entries(categories).map(([domain, category]) => `
    <div class="category-tag">
      <span class="domain">${domain}</span>
      <span class="category">${category}</span>
      <button class="remove-btn remove-category-btn" data-domain="${domain}" title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `).join('');
}

// Add category
async function addCategory() {
  const domain = elements.newDomain.value.trim().toLowerCase();
  const category = elements.newCategory.value;

  if (!domain) {
    alert('Please enter a domain');
    return;
  }

  // Clean domain
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];

  categories[cleanDomain] = category;
  await chrome.storage.local.set({ categories });

  elements.newDomain.value = '';
  renderCategories();
}

// Remove category
async function removeCategory(domain) {
  delete categories[domain];
  await chrome.storage.local.set({ categories });
  renderCategories();
}

// Make function globally available
// window.removeCategory = removeCategory;

// Open limit modal
function openLimitModal(domain = null) {
  editingDomain = domain;

  elements.modalTitle.textContent = domain ? 'Edit Website Limit' : 'Add Website Limit';
  elements.deleteLimitBtn.classList.toggle('hidden', !domain);

  // Reset form
  elements.limitForm.reset();
  elements.blockedRanges.innerHTML = '';

  const domainInput = document.getElementById('limitDomain');

  if (domain) {
    domainInput.value = domain;
    domainInput.readOnly = true;

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
    domainInput.readOnly = false;
  }

  elements.limitModal.classList.remove('hidden');
}

// Make function globally available
// window.openLimitModal = openLimitModal;

// Close modal
function closeModal() {
  elements.limitModal.classList.add('hidden');
  editingDomain = null;
}

// Add blocked time range
function addBlockedRange(start = '22:00', end = '08:00') {
  const rangeHtml = `
    <div class="blocked-range">
      <input type="time" class="range-start" value="${start}">
      <span>to</span>
      <input type="time" class="range-end" value="${end}">
      <button type="button" class="remove-range-btn" onclick="this.parentElement.remove()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `;
  elements.blockedRanges.insertAdjacentHTML('beforeend', rangeHtml);
}

// Save limit
async function saveLimit() {
  const domain = document.getElementById('limitDomain').value.trim().toLowerCase();

  if (!domain) {
    alert('Please enter a domain');
    return;
  }

  // Clean domain
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];

  const dailyLimit = parseFloat(document.getElementById('dailyLimit').value) || 0;
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

  // Validate at least one limit is set
  if (!dailyLimit && !sessionCount && !perSessionLimit && !blockedTimeRanges.length) {
    alert('Please set at least one limit');
    return;
  }

  limits[cleanDomain] = {
    dailyTotal: dailyLimit ? dailyLimit * 3600 : null,
    sessionCount: sessionCount || null,
    perSessionLimit: perSessionLimit ? perSessionLimit * 60 : null,
    minBreakInterval: breakInterval ? breakInterval * 60 : null,
    blockedTimeRanges,
    enforcement: {
      hardBlock: document.getElementById('hardBlock').checked,
      showWarnings: document.getElementById('showWarnings').checked,
      emergencyOverride: document.getElementById('emergencyOverride').checked,
      maxOverridesPerDay: 2
    }
  };

  await chrome.storage.local.set({ limits });

  closeModal();
  renderLimits();
}

// Delete limit
async function deleteLimit() {
  if (!editingDomain) return;

  if (confirm(`Are you sure you want to remove the limit for ${editingDomain}?`)) {
    delete limits[editingDomain];
    await chrome.storage.local.set({ limits });

    closeModal();
    renderLimits();
  }
}

// Export data
async function exportData() {
  try {
    const data = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screen-time-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export failed:', error);
    alert('Failed to export data');
  }
}

// Import data
async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (confirm('This will replace all existing data. Continue?')) {
      await chrome.storage.local.set(data);
      await loadSettings();
      alert('Data imported successfully');
    }
  } catch (error) {
    console.error('Import failed:', error);
    alert('Failed to import data. Please check the file format.');
  }

  // Reset file input
  event.target.value = '';
}

// Clear all data
async function clearData() {
  if (confirm('This will permanently delete ALL tracking data and settings. This action cannot be undone.\n\nAre you sure you want to continue?')) {
    if (confirm('Are you REALLY sure? All data will be lost forever.')) {
      await chrome.storage.local.clear();

      // Reinitialize with defaults
      await chrome.storage.local.set({
        settings: { idleTimeout: 30, retentionDays: 90, defaultEnforcement: 'hard' },
        limits: {},
        categories: {},
        dailyUsage: {}
      });

      await loadSettings();
      alert('All data has been cleared');
    }
  }
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
