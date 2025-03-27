// Housekeeping Module - Handles listing housekeeping and admin functionality

// Global variables
let housekeepingConfig = {
  scheduled_enabled: false,
  interval_hours: 24
};

// Function to fetch housekeeping configuration
async function fetchHousekeepingConfig() {
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/housekeeping/config`, {
      credentials: 'include'
    });
    
    if (response.status === 401) {
      // Unauthorized - show login message
      const container = document.getElementById('housekeeping-config-container');
      if (container) {
        container.innerHTML = `
          <div class="alert alert-warning">
            <h4 class="alert-heading">Authentication Required</h4>
            <p>You need to be logged in to manage housekeeping settings.</p>
            <button class="btn btn-primary" id="housekeeping-login-btn">Login</button>
          </div>
        `;
        
        document.getElementById('housekeeping-login-btn').addEventListener('click', () => {
          if (typeof window.showLoginPrompt === 'function') {
            window.showLoginPrompt();
          } else if (typeof showLoginPrompt === 'function') {
            showLoginPrompt();
          }
        });
      }
      return;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const config = await response.json();
    housekeepingConfig = config;
    
    // Update UI with the configuration
    updateHousekeepingConfigUI();
  } catch (error) {
    console.error('Error fetching housekeeping config:', error);
    const container = document.getElementById('housekeeping-config-container');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-danger">
          <h4 class="alert-heading">Error</h4>
          <p>Failed to load housekeeping configuration. Please try again later.</p>
          <p><small>Error: ${error.message}</small></p>
        </div>
      `;
    }
  }
}

// Function to update housekeeping configuration UI
function updateHousekeepingConfigUI() {
  const container = document.getElementById('housekeeping-config-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="card mb-4">
      <div class="card-header">
        <h5>Scheduled Housekeeping Configuration</h5>
      </div>
      <div class="card-body">
        <div class="form-check form-switch mb-3">
          <input class="form-check-input" type="checkbox" id="scheduled-housekeeping-enabled" 
            ${housekeepingConfig.scheduled_enabled ? 'checked' : ''}>
          <label class="form-check-label" for="scheduled-housekeeping-enabled">
            Enable Scheduled Housekeeping
          </label>
        </div>
        
        <div class="mb-3">
          <label for="housekeeping-interval" class="form-label">Check Interval (hours)</label>
          <input type="number" class="form-control" id="housekeeping-interval" 
            value="${housekeepingConfig.interval_hours}" min="1" max="168">
          <div class="form-text">Listings will be checked for availability at this interval.</div>
        </div>
        
        <button id="save-housekeeping-config" class="btn btn-primary">Save Configuration</button>
      </div>
    </div>
    
    <div class="card">
      <div class="card-header">
        <h5>Manual Housekeeping</h5>
      </div>
      <div class="card-body">
        <button id="run-housekeeping" class="btn btn-warning">
          Run Housekeeping Now
        </button>
        <div class="form-text mt-2">
          This will check all listings for availability. Deleted listings will be marked as such.
        </div>
      </div>
    </div>
  `;
  
  // Add event listeners
  document.getElementById('save-housekeeping-config').addEventListener('click', saveHousekeepingConfig);
  document.getElementById('run-housekeeping').addEventListener('click', runHousekeeping);
}

// Function to save housekeeping configuration
async function saveHousekeepingConfig() {
  const scheduledEnabled = document.getElementById('scheduled-housekeeping-enabled').checked;
  const intervalHours = parseInt(document.getElementById('housekeeping-interval').value);
  
  // Validate input
  if (isNaN(intervalHours) || intervalHours < 1 || intervalHours > 168) {
    showToast('Please enter a valid interval between 1 and 168 hours.', 'error');
    return;
  }
  
  // Show loading
  const saveButton = document.getElementById('save-housekeeping-config');
  const originalText = saveButton.textContent;
  saveButton.textContent = 'Saving...';
  saveButton.disabled = true;
  
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/housekeeping/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        scheduled_enabled: scheduledEnabled,
        interval_hours: intervalHours
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Update the stored config
    housekeepingConfig = {
      scheduled_enabled: scheduledEnabled,
      interval_hours: intervalHours
    };
    
    showToast('Housekeeping configuration saved successfully.', 'success');
  } catch (error) {
    console.error('Error saving housekeeping config:', error);
    showToast('Failed to save housekeeping configuration.', 'error');
  } finally {
    // Restore button
    saveButton.textContent = originalText;
    saveButton.disabled = false;
  }
}

// Function to run housekeeping manually
async function runHousekeeping() {
  if (!confirm('Are you sure you want to run housekeeping now? This may take some time depending on the number of listings.')) {
    return;
  }
  
  // Show loading
  const runButton = document.getElementById('run-housekeeping');
  const originalText = runButton.textContent;
  runButton.textContent = 'Running...';
  runButton.disabled = true;
  
  // Show progress in the UI
  const progressContainer = document.createElement('div');
  progressContainer.className = 'mt-3';
  progressContainer.innerHTML = `
    <div class="progress">
      <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" 
        style="width: 100%" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100"></div>
    </div>
    <div class="text-center mt-1">
      <small>Checking listings availability. This may take a while...</small>
    </div>
  `;
  
  runButton.parentNode.appendChild(progressContainer);
  
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/housekeeping/run`, {
      method: 'POST',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Create a status report
    progressContainer.innerHTML = `
      <div class="alert alert-success mt-3">
        <h6>Housekeeping Completed</h6>
        <p>
          Total listings checked: ${result.total_listings}<br>
          Newly marked as deleted: ${result.newly_deleted}<br>
          Already marked as deleted: ${result.already_deleted}<br>
          Available listings: ${result.available_listings}<br>
          Time taken: ${result.time_taken.toFixed(2)} seconds
        </p>
      </div>
    `;
    
    // If we're on the listings tab, refresh the listings
    if (document.getElementById('listings-container')) {
      // Assuming fetchListings is available globally
      if (typeof window.fetchListings === 'function') {
        window.fetchListings();
      }
    }
    
    showToast('Housekeeping completed successfully.', 'success');
  } catch (error) {
    console.error('Error running housekeeping:', error);
    progressContainer.innerHTML = `
      <div class="alert alert-danger mt-3">
        Failed to run housekeeping. Error: ${error.message}
      </div>
    `;
    showToast('Failed to run housekeeping.', 'error');
  } finally {
    // Restore button
    runButton.textContent = originalText;
    runButton.disabled = false;
  }
}

// Function to check a single listing availability
async function checkListingAvailability(listingId) {
  if (!confirm('Are you sure you want to check this listing now?')) {
    return;
  }
  
  // Find the button that was clicked
  const checkButton = document.querySelector(`button[data-listing-id="${listingId}"]`);
  if (!checkButton) return;
  
  // Show loading state
  const originalText = checkButton.textContent;
  checkButton.textContent = 'Checking...';
  checkButton.disabled = true;
  
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/listing/${listingId}/check`, {
      method: 'POST',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Update the status element
    const statusElement = document.getElementById(`listing-status-${listingId}`);
    if (statusElement) {
      if (result.is_deleted) {
        statusElement.innerHTML = `
          <div class="alert alert-danger">
            <strong>Listing is DELETED</strong>
            <p>The listing has been marked as deleted.</p>
            <a href="${result.url}" target="_blank" class="btn btn-sm btn-outline-secondary mt-2">
              View Listing Page
            </a>
          </div>
        `;
      } else {
        statusElement.innerHTML = `
          <div class="alert alert-success">
            <strong>Listing is AVAILABLE</strong>
            <p>The listing is still available on the website.</p>
            <a href="${result.url}" target="_blank" class="btn btn-sm btn-outline-success mt-2">
              View Listing
            </a>
          </div>
        `;
      }
    }
    
    // Apply dark mode to the new alert if needed
    if (document.body.classList.contains('dark-mode') && typeof window.applyDarkModeToHousekeeping === 'function') {
      window.applyDarkModeToHousekeeping();
    }
    
    // Show toast notification
    showToast(`Listing check completed. Status: ${result.is_deleted ? 'DELETED' : 'AVAILABLE'}`, 
      result.is_deleted ? 'warning' : 'success');
    
  } catch (error) {
    console.error('Error checking listing:', error);
    
    // Update the status element with error
    const statusElement = document.getElementById(`listing-status-${listingId}`);
    if (statusElement) {
      statusElement.innerHTML = `
        <div class="alert alert-danger">
          <strong>Error</strong>
          <p>Failed to check listing. Error: ${error.message}</p>
          <p class="mt-2">
            <strong>Troubleshooting:</strong>
            <ul>
              <li>Ensure the web driver is configured correctly</li>
              <li>Check API server logs for details</li>
              <li>The website might be experiencing issues</li>
            </ul>
          </p>
        </div>
      `;
    }
    
    showToast('Failed to check listing availability.', 'error');
  } finally {
    // Restore button
    checkButton.textContent = originalText;
    checkButton.disabled = false;
  }
}

// Function to setup housekeeping UI
function setupHousekeepingUI() {
  const container = document.getElementById('housekeeping-container');
  if (!container) return;
  
  // Fetch the configuration when the tab is selected
  fetchHousekeepingConfig();
  
  // Add event listener to any check buttons that might exist
  document.querySelectorAll('button[data-listing-id]').forEach(button => {
    button.addEventListener('click', () => {
      const listingId = button.getAttribute('data-listing-id');
      checkListingAvailability(listingId);
    });
  });
}

// Function to initialize housekeeping module
function initHousekeepingModule() {
  setupHousekeepingUI();
}

// Export functions for use in other modules
export {
  fetchHousekeepingConfig,
  runHousekeeping,
  checkListingAvailability,
  setupHousekeepingUI,
  initHousekeepingModule
}; 