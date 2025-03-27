// Settings Module - Handles user settings and preferences

// Global settings object
let userSettings = {
  darkMode: false,
  filtersExpanded: true,
  pageSize: 20,
  defaultSortOrder: null
};

// Variables for server and schedule configuration
let serverStatus = {
  running: false,
  uptime: 0,
  headlessMode: true,
  memory: {
    rss: '0 MB',
    vms: '0 MB'
  },
  cpuPercent: 0
};

let scheduleConfig = {
  interval: 60,
  enabled: false
};

// Function to load user settings from localStorage
function loadUserSettings() {
  const savedSettings = localStorage.getItem('userSettings');
  if (savedSettings) {
    try {
      const parsedSettings = JSON.parse(savedSettings);
      userSettings = { ...userSettings, ...parsedSettings };
      
      // Apply settings to UI
      applyUserSettings();
    } catch (error) {
      console.error('Error parsing user settings:', error);
    }
  }
}

// Function to save user settings to localStorage
function saveUserSettings() {
  localStorage.setItem('userSettings', JSON.stringify(userSettings));
}

// Function to apply user settings to the UI
function applyUserSettings() {
  // Apply dark mode setting if not already handled by darkmode.js
  if (userSettings.darkMode) {
    if (!document.body.classList.contains('dark-mode')) {
      const darkModeToggle = document.getElementById('darkModeToggle');
      if (darkModeToggle && !darkModeToggle.checked) {
        darkModeToggle.checked = true;
        if (typeof window.toggleDarkMode === 'function') {
          window.toggleDarkMode();
        }
      }
    }
  }
  
  // Apply filters expanded/collapsed state
  const filtersContainer = document.getElementById('filters-container');
  const filtersToggle = document.getElementById('filters-toggle');
  
  if (filtersContainer && filtersToggle) {
    if (userSettings.filtersExpanded) {
      filtersContainer.classList.add('show');
      filtersToggle.setAttribute('aria-expanded', 'true');
      filtersToggle.classList.remove('collapsed');
    } else {
      filtersContainer.classList.remove('show');
      filtersToggle.setAttribute('aria-expanded', 'false');
      filtersToggle.classList.add('collapsed');
    }
  }
  
  // Apply default sort order if specified
  if (userSettings.defaultSortOrder) {
    const sortButton = document.getElementById(`sort-${userSettings.defaultSortOrder}`);
    if (sortButton && !sortButton.classList.contains('active')) {
      sortButton.click();
    }
  }
}

// Function to update a specific setting
function updateSetting(key, value) {
  userSettings[key] = value;
  saveUserSettings();
  
  // Apply the specific setting change
  switch (key) {
    case 'darkMode':
      // Dark mode is handled by darkmode.js
      break;
    case 'filtersExpanded':
      const filtersContainer = document.getElementById('filters-container');
      const filtersToggle = document.getElementById('filters-toggle');
      
      if (filtersContainer && filtersToggle) {
        if (value) {
          filtersContainer.classList.add('show');
          filtersToggle.setAttribute('aria-expanded', 'true');
          filtersToggle.classList.remove('collapsed');
        } else {
          filtersContainer.classList.remove('show');
          filtersToggle.setAttribute('aria-expanded', 'false');
          filtersToggle.classList.add('collapsed');
        }
      }
      break;
    case 'defaultSortOrder':
      const sortButton = document.getElementById(`sort-${value}`);
      if (sortButton) {
        sortButton.click();
      }
      break;
  }
}

// Function to toggle the filters expanded state
function toggleFilters() {
  updateSetting('filtersExpanded', !userSettings.filtersExpanded);
}

// Server status functions

// Function to fetch server status
async function fetchServerStatus() {
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/status`, {
      credentials: 'include'
    });
    
    if (response.status === 401) {
      // Unauthorized
      const statusText = document.getElementById('status-text');
      if (statusText) {
        statusText.textContent = 'Authentication required';
      }
      return;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const status = await response.json();
    serverStatus = status;
    
    // Update UI
    updateServerStatusUI(status);
    
    return status;
  } catch (error) {
    console.error('Error fetching server status:', error);
    
    // Update UI to show error
    const statusText = document.getElementById('status-text');
    const statusLight = document.getElementById('status-light');
    
    if (statusText) {
      statusText.textContent = 'Error: Could not connect to server';
    }
    
    if (statusLight) {
      statusLight.className = 'status-indicator status-red';
    }
  }
}

// Function to update server status UI
function updateServerStatusUI(status) {
  const statusText = document.getElementById('status-text');
  const statusLight = document.getElementById('status-light');
  const serverDetails = document.getElementById('server-details');
  
  if (!statusText || !statusLight || !serverDetails) return;
  
  if (status.status === 'running') {
    statusText.textContent = 'Running';
    statusLight.className = 'status-indicator status-green';
    
    // Format uptime
    const uptime = formatUptime(status.uptime);
    
    // Update details
    serverDetails.innerHTML = `
      <div class="server-info">
        <p><strong>Uptime:</strong> ${uptime}</p>
        <p><strong>Memory:</strong> ${status.memory.rss} (RSS)</p>
        <p><strong>CPU Usage:</strong> ${status.cpu_percent}%</p>
        <p><strong>Headless Mode:</strong> ${status.headless_mode ? 'Enabled' : 'Disabled'}</p>
        <p><strong>Scraping:</strong> ${status.scraping_in_progress ? 'In Progress' : 'Idle'}</p>
      </div>
    `;
  } else {
    statusText.textContent = 'Stopped';
    statusLight.className = 'status-indicator status-red';
    serverDetails.innerHTML = '';
  }
}

// Function to format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  
  let uptimeString = '';
  if (days > 0) uptimeString += `${days}d `;
  if (hours > 0) uptimeString += `${hours}h `;
  uptimeString += `${minutes}m`;
  
  return uptimeString;
}

// Schedule functions

// Function to fetch schedule configuration
async function fetchSchedule() {
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/schedule`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const config = await response.json();
    scheduleConfig = config;
    
    // Update UI
    updateScheduleUI(config);
    
    return config;
  } catch (error) {
    console.error('Error fetching schedule:', error);
  }
}

// Function to update schedule UI
function updateScheduleUI(config) {
  const intervalInput = document.getElementById('schedule-interval');
  const enabledCheckbox = document.getElementById('schedule-enabled');
  
  if (intervalInput) {
    intervalInput.value = config.interval;
  }
  
  if (enabledCheckbox) {
    enabledCheckbox.checked = config.enabled;
  }
}

// Function to save schedule configuration
async function saveSchedule() {
  const intervalInput = document.getElementById('schedule-interval');
  const enabledCheckbox = document.getElementById('schedule-enabled');
  
  if (!intervalInput || !enabledCheckbox) return;
  
  const interval = parseInt(intervalInput.value);
  const enabled = enabledCheckbox.checked;
  
  // Validate interval
  if (isNaN(interval) || interval < 5 || interval > 1440) {
    alert('Please enter a valid interval between 5 and 1440 minutes.');
    return;
  }
  
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        interval: interval,
        enabled: enabled
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      showToast('Schedule updated successfully.', 'success');
    } else {
      showToast('Failed to update schedule.', 'error');
    }
  } catch (error) {
    console.error('Error saving schedule:', error);
    showToast('Failed to update schedule.', 'error');
  }
}

// Function to set up settings UI
function setupSettingsUI() {
  // Set up event listener for filters toggle
  const filtersToggle = document.getElementById('filters-toggle');
  if (filtersToggle) {
    filtersToggle.addEventListener('click', function() {
      updateSetting('filtersExpanded', this.getAttribute('aria-expanded') !== 'true');
    });
  }
  
  // Set up event listener for dark mode toggle
  const darkModeToggle = document.getElementById('darkModeToggle');
  if (darkModeToggle) {
    darkModeToggle.addEventListener('change', function() {
      updateSetting('darkMode', this.checked);
    });
  }
  
  // Set up event listeners for sort buttons
  document.querySelectorAll('.sort-button').forEach(button => {
    button.addEventListener('click', function() {
      const sortType = this.id.replace('sort-', '');
      updateSetting('defaultSortOrder', sortType);
    });
  });
  
  // Set up event listeners for Configure tab elements
  const saveScheduleBtn = document.getElementById('save-schedule');
  if (saveScheduleBtn) {
    saveScheduleBtn.addEventListener('click', saveSchedule);
  }
  
  // Fetch server status and schedule on tab load
  document.getElementById('configure-tab')?.addEventListener('shown.bs.tab', () => {
    // Fetch server status
    fetchServerStatus();
    
    // Fetch schedule
    fetchSchedule();
    
    // Set up refresh interval for server status
    const statusInterval = setInterval(fetchServerStatus, 10000);
    
    // Clear interval when tab is changed
    document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(btn => {
      btn.addEventListener('shown.bs.tab', () => {
        if (btn.id !== 'configure-tab') {
          clearInterval(statusInterval);
        }
      });
    });
  });
}

// Function to initialize settings module
function initSettingsModule() {
  loadUserSettings();
  setupSettingsUI();
}

// Export functions for use in other modules
export {
  loadUserSettings,
  saveUserSettings,
  updateSetting,
  toggleFilters,
  fetchServerStatus,
  fetchSchedule,
  saveSchedule,
  initSettingsModule,
  userSettings
}; 