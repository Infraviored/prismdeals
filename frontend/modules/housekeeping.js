// Housekeeping Module - Handles listing housekeeping and admin functionality

// Global variables
let housekeepingConfig = {
  enabled: true,
  hour: 3,
  minute: 0,
  check_deleted: true,
  show_deleted: true,
  last_run: null
};

// Function to fetch housekeeping configuration
async function fetchHousekeepingConfig() {
  try {
    // Always set up a basic UI first
    updateHousekeepingConfigUI();
    
    // Then try to fetch the real config
    const response = await fetch(`${window.config.API_BASE_URL}/housekeeping/settings`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      // For 401 (Unauthorized) or 404 (Not Found), just keep the default disabled UI
      if (response.status === 401 || response.status === 404) {
        console.log('Using default housekeeping configuration for non-admin user');
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Update with the real config
    const config = await response.json();
    housekeepingConfig = config;
    
    // Update UI with the real configuration
    updateHousekeepingConfigUI();
  } catch (error) {
    console.error('Error fetching housekeeping config:', error);
    // Don't show error messages for authentication or endpoint not found issues
    if (!error.message.includes('401') && !error.message.includes('404')) {
      const statusEl = document.getElementById('housekeeping-status');
      if (statusEl) {
        statusEl.innerHTML = `
          <div class="alert alert-danger">
            <h4 class="alert-heading">Error</h4>
            <p>Failed to load housekeeping configuration. Please try again later.</p>
            <p><small>Error: ${error.message}</small></p>
          </div>
        `;
        statusEl.classList.remove('d-none');
      }
    }
  }
}

// Function to update housekeeping configuration UI
function updateHousekeepingConfigUI() {
  const container = document.getElementById('housekeeping-config-container');
  if (!container) return;
  
  // Check authentication state
  const isAdmin = window.auth && window.auth.isAdmin();
  
  // Format last run time if available
  let lastRunText = 'Never';
  if (housekeepingConfig.last_run) {
    const lastRunDate = new Date(housekeepingConfig.last_run * 1000);
    lastRunText = lastRunDate.toLocaleString();
  }
  
  container.innerHTML = `
    <div class="row">
      <div class="col-md-6">
        <div class="card mb-4">
          <div class="card-header">
            <h5>Scheduled Housekeeping Configuration</h5>
            ${!isAdmin ? '<small class="text-muted">Admin privileges required to edit</small>' : ''}
          </div>
          <div class="card-body">
            <div class="form-check form-switch mb-3">
              <input class="form-check-input" type="checkbox" id="housekeeping-enabled" 
                ${housekeepingConfig.enabled ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''}>
              <label class="form-check-label" for="housekeeping-enabled">
                Enable Scheduled Housekeeping
              </label>
            </div>
            
            <div class="row mb-3">
              <div class="col-md-6">
                <label for="housekeeping-hour" class="form-label">Hour (0-23)</label>
                <input type="number" class="form-control" id="housekeeping-hour" 
                  value="${housekeepingConfig.hour}" min="0" max="23" ${!isAdmin ? 'disabled' : ''}>
              </div>
              <div class="col-md-6">
                <label for="housekeeping-minute" class="form-label">Minute (0-59)</label>
                <input type="number" class="form-control" id="housekeeping-minute" 
                  value="${housekeepingConfig.minute}" min="0" max="59" ${!isAdmin ? 'disabled' : ''}>
              </div>
            </div>
            
            <div class="form-check form-switch mb-3">
              <input class="form-check-input" type="checkbox" id="housekeeping-check-deleted" 
                ${housekeepingConfig.check_deleted ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''}>
              <label class="form-check-label" for="housekeeping-check-deleted">
                Check for deleted listings
              </label>
            </div>
            
            <div class="form-check form-switch mb-3">
              <input class="form-check-input" type="checkbox" id="housekeeping-show-deleted" 
                ${housekeepingConfig.show_deleted ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''}>
              <label class="form-check-label" for="housekeeping-show-deleted">
                Show deleted listings by default
              </label>
            </div>
            
            <div id="housekeeping-last-run" class="text-muted mb-3">
              Last run: ${lastRunText}
            </div>
            
            <button id="save-housekeeping-config" class="btn btn-primary" ${!isAdmin ? 'disabled' : ''}>Save Configuration</button>
          </div>
        </div>
      </div>
      
      <div class="col-md-6">
        <div class="card mb-4">
          <div class="card-header">
            <h5>Manual Housekeeping</h5>
          </div>
          <div class="card-body">
            <p>Run housekeeping manually to check for deleted listings.</p>
            
            <button id="run-housekeeping" class="btn btn-warning" ${!isAdmin ? 'disabled' : ''}>
              <i class="bi bi-broom"></i> Run Housekeeping
            </button>
            
            <div class="form-text mt-2">
              This will check all listings for availability. Deleted listings will be marked as such.
            </div>
          </div>
        </div>
        
        <div class="card mb-4">
          <div class="card-header">
            <h5>Test Listing Availability</h5>
          </div>
          <div class="card-body">
            <p>Check if a specific listing is available or has been deleted.</p>
            
            <div class="mb-3">
              <label for="test-listing-url" class="form-label">Listing URL</label>
              <input type="url" class="form-control" id="test-listing-url" 
                     placeholder="https://www.kleinanzeigen.de/s-anzeige/..." ${!isAdmin ? 'disabled' : ''}>
            </div>
            
            <button id="check-listing" class="btn btn-primary" ${!isAdmin ? 'disabled' : ''}>
              <i class="bi bi-search"></i> Check Listing
            </button>
            
            <div id="listing-check-result" class="alert mt-3 d-none">
              <!-- Result will be displayed here -->
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Only add event listeners if the user is an admin
  if (isAdmin) {
    document.getElementById('save-housekeeping-config').addEventListener('click', saveHousekeepingConfig);
    document.getElementById('run-housekeeping').addEventListener('click', runHousekeeping);
    
    // Add listener for the check listing button
    const checkListingButton = document.getElementById('check-listing');
    if (checkListingButton) {
      checkListingButton.addEventListener('click', () => {
        const urlInput = document.getElementById('test-listing-url');
        const url = urlInput ? urlInput.value.trim() : '';
        
        if (!url) {
          showToast('Please enter a valid listing URL', 'error');
          return;
        }
        
        checkSingleListingAvailability(url);
      });
    }
  }
}

// Function to save housekeeping configuration
async function saveHousekeepingConfig() {
  const enabled = document.getElementById('housekeeping-enabled').checked;
  const hour = parseInt(document.getElementById('housekeeping-hour').value);
  const minute = parseInt(document.getElementById('housekeeping-minute').value);
  const checkDeleted = document.getElementById('housekeeping-check-deleted').checked;
  const showDeleted = document.getElementById('housekeeping-show-deleted').checked;
  
  // Validate input
  if (isNaN(hour) || hour < 0 || hour > 23) {
    showToast('Please enter a valid hour between 0 and 23.', 'error');
    return;
  }
  
  if (isNaN(minute) || minute < 0 || minute > 59) {
    showToast('Please enter a valid minute between 0 and 59.', 'error');
    return;
  }
  
  // Show loading
  const saveButton = document.getElementById('save-housekeeping-config');
  const originalText = saveButton.textContent;
  saveButton.textContent = 'Saving...';
  saveButton.disabled = true;
  
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/housekeeping/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        enabled: enabled,
        hour: hour,
        minute: minute,
        check_deleted: checkDeleted,
        show_deleted: showDeleted
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Update the stored config with the response
    housekeepingConfig = await response.json();
    
    // Update the UI with the new config
    updateHousekeepingConfigUI();
    
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
  // Confirm before running housekeeping
  if (!confirm('This will check all listings for availability. It may take some time. Continue?')) {
    return;
  }

  const button = document.getElementById('run-housekeeping');
  if (!button) return;

  // Save original button text and disable button during operation
  const originalText = button.textContent;
  button.textContent = 'Running...';
  button.disabled = true;

  const statusEl = document.getElementById('housekeeping-status');
  if (statusEl) {
    statusEl.innerHTML = `
      <div class="alert alert-info">
        <div class="progress mb-2">
          <div class="progress-bar progress-bar-striped progress-bar-animated" 
            role="progressbar" style="width: 100%"></div>
        </div>
        <small class="text-muted">Checking listings availability...</small>
      </div>
    `;
    statusEl.classList.remove('d-none');
  }

  try {
    const response = await fetch(`${window.config.API_BASE_URL}/housekeeping`, {
      method: 'POST',
      credentials: 'include'
    });

    const result = await response.json();

    if (statusEl) {
      if (response.ok) {
        statusEl.innerHTML = `
          <div class="alert alert-success">
            <strong>Housekeeping completed successfully!</strong>
            <p>Checked listings for availability. Updated status for all listings.</p>
          </div>
        `;
        
        // Update the last run time in the UI
        const lastRunEl = document.getElementById('housekeeping-last-run');
        if (lastRunEl) {
          lastRunEl.textContent = `Last run: ${new Date().toLocaleString()}`;
        }
        
        // Refresh the config to get the updated last_run time
        fetchHousekeepingConfig();
      } else {
        throw new Error(result.message || 'Failed to run housekeeping');
      }
    }
  } catch (error) {
    if (statusEl) {
      statusEl.innerHTML = `
        <div class="alert alert-danger">
          <strong>Error running housekeeping:</strong>
          <p>${error.message}</p>
        </div>
      `;
    }
  } finally {
    // Restore button state
    if (button) {
      button.textContent = originalText;
      button.disabled = false;
    }
  }
}

// Function to check a single listing by URL
async function checkSingleListingAvailability(url) {
  const resultContainer = document.getElementById('listing-check-result');
  if (!resultContainer) return;
  
  // Show loading state
  resultContainer.innerHTML = `
    <div class="spinner-border spinner-border-sm text-primary" role="status">
      <span class="visually-hidden">Loading...</span>
    </div> 
    <span>Checking listing availability...</span>
  `;
  resultContainer.classList.remove('d-none');
  
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/check-listing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ url })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      if (result.is_deleted) {
        resultContainer.innerHTML = `
          <div class="alert alert-danger">
            <strong>Listing is DELETED</strong>
            <p>${result.message || 'The listing has been marked as deleted.'}</p>
            <a href="${url}" target="_blank" class="btn btn-sm btn-outline-secondary mt-2">
              View Listing Page
            </a>
          </div>
        `;
      } else {
        resultContainer.innerHTML = `
          <div class="alert alert-success">
            <strong>Listing is AVAILABLE</strong>
            <p>${result.message || 'The listing is still available on the website.'}</p>
            <a href="${url}" target="_blank" class="btn btn-sm btn-outline-success mt-2">
              View Listing
            </a>
          </div>
        `;
      }
    } else {
      throw new Error(result.message || 'Failed to check listing');
    }
  } catch (error) {
    resultContainer.innerHTML = `
      <div class="alert alert-danger">
        <strong>Error</strong>
        <p>Failed to check listing. Error: ${error.message}</p>
        <div class="mt-2">
          <strong>Troubleshooting:</strong>
          <ul>
            <li>Ensure the URL is valid and complete</li>
            <li>Check API server logs for details</li>
            <li>The website might be experiencing issues</li>
          </ul>
        </div>
      </div>
    `;
  }
}

// Function to check a single listing availability
async function checkListingAvailability(listingId, statusElement) {
  if (!statusElement) return;

  // Show loading state
  statusElement.innerHTML = '<div class="spinner-border spinner-border-sm text-primary" role="status"><span class="visually-hidden">Loading...</span></div> Checking...';

  try {
    const response = await fetch(`${window.config.API_BASE_URL}/listing/${listingId}/check`, {
      method: 'POST',
      credentials: 'include'
    });

    const result = await response.json();

    if (response.ok) {
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
    } else {
      throw new Error(result.message || 'Failed to check listing');
    }
  } catch (error) {
    statusElement.innerHTML = `
      <div class="alert alert-danger">
        <strong>Error</strong>
        <p>Failed to check listing. Error: ${error.message}</p>
      </div>
    `;
  }
}

// Helper function to show toast if available
function showToast(message, type) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  } else {
    console.log(`${type.toUpperCase()}: ${message}`);
    alert(`${message}`);
  }
}

// Function to setup housekeeping UI
function setupHousekeepingUI() {
  // Fetch the configuration when the tab is selected
  fetchHousekeepingConfig();
  
  // Add event listener to any check buttons that might exist
  document.querySelectorAll('button[data-listing-id]').forEach(button => {
    button.addEventListener('click', () => {
      const listingId = button.getAttribute('data-listing-id');
      const statusElement = document.getElementById(`listing-status-${listingId}`);
      checkListingAvailability(listingId, statusElement);
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