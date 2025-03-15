// Use the shared API_BASE_URL from config.js
// const API_BASE_URL = window.config.API_BASE_URL;  // Remove this line

// Global variables
let allListings = [];
let filteredListings = [];
let searchConfig = [];

// Add filter state persistence
let filterState = {
  ramMore: false,
  screenSmall: false,
  screenHighres: false,
  fullInfo: false,
  search: ''
};

// Function to save filter state to localStorage
function saveFilterState() {
  localStorage.setItem('filterState', JSON.stringify(filterState));
}

// Function to load filter state from localStorage
function loadFilterState() {
  const savedState = localStorage.getItem('filterState');
  if (savedState) {
    filterState = JSON.parse(savedState);
    
    // Apply saved filters to UI
    document.getElementById('filter-ram-more').checked = filterState.ramMore;
    document.getElementById('filter-screen-small').checked = filterState.screenSmall;
    document.getElementById('filter-screen-highres').checked = filterState.screenHighres;
    document.getElementById('filter-full-info').checked = filterState.fullInfo;
    
    // Search filter will be set after search config is loaded
  }
}

// Authentication UI setup
function setupAuthUI() {
  const authContainer = document.getElementById('auth-status-container');
  
  // Login button click handler
  document.getElementById('login-button').addEventListener('click', async () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('login-error');
    
    errorElement.classList.add('d-none');
    
    if (!username || !password) {
      errorElement.textContent = 'Username and password are required';
      errorElement.classList.remove('d-none');
      return;
    }
    
    const result = await window.auth.login(username, password);
    
    if (result.success) {
      // Close modal and reset form
      const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
      loginModal.hide();
      document.getElementById('login-form').reset();
    } else {
      // Show error
      errorElement.textContent = result.error || 'Login failed';
      errorElement.classList.remove('d-none');
    }
  });
  
  // Admin settings save button
  document.getElementById('save-settings-button').addEventListener('click', async () => {
    const publicAccess = document.getElementById('public-access-toggle').checked;
    const errorElement = document.getElementById('admin-settings-error');
    const successElement = document.getElementById('admin-settings-success');
    
    errorElement.classList.add('d-none');
    successElement.classList.add('d-none');
    
    const result = await window.auth.updatePublicAccess(publicAccess);
    
    if (result.success) {
      successElement.textContent = 'Settings saved successfully';
      successElement.classList.remove('d-none');
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        successElement.classList.add('d-none');
      }, 3000);
    } else {
      errorElement.textContent = result.error || 'Failed to save settings';
      errorElement.classList.remove('d-none');
    }
  });
  
  // Listen for auth state changes
  window.auth.addAuthStateListener((isAuthenticated, user, isPublicAccessEnabled) => {
    // Update UI based on auth state
    updateAuthUI(isAuthenticated, user, isPublicAccessEnabled);
    
    // Update protected features
    updateProtectedFeatures(isAuthenticated, user, isPublicAccessEnabled);
  });
}

// Update the auth UI based on authentication state
function updateAuthUI(isAuthenticated, user, isPublicAccessEnabled) {
  const authContainer = document.getElementById('auth-status-container');
  
  if (isAuthenticated && user) {
    // User is logged in
    const userInitial = user.username.charAt(0).toUpperCase();
    const isAdmin = user.role === 'admin';
    
    authContainer.innerHTML = `
      <div class="auth-status">
        <div class="user-info">
          <div class="user-avatar">${userInitial}</div>
          <div>
            <div>${user.username} ${isAdmin ? '<span class="admin-badge">Admin</span>' : ''}</div>
          </div>
        </div>
        <div class="auth-buttons">
          ${isAdmin ? '<button class="btn btn-sm btn-outline-secondary" id="admin-settings-btn">Settings</button>' : ''}
          <button class="btn btn-sm btn-outline-danger" id="logout-btn">Logout</button>
        </div>
      </div>
    `;
    
    // Add event listener for logout button
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await window.auth.logout();
    });
    
    // Add event listener for admin settings button if present
    const adminSettingsBtn = document.getElementById('admin-settings-btn');
    if (adminSettingsBtn) {
      adminSettingsBtn.addEventListener('click', () => {
        // Set the current public access state in the toggle
        document.getElementById('public-access-toggle').checked = isPublicAccessEnabled;
        
        // Show the admin settings modal
        const adminSettingsModal = new bootstrap.Modal(document.getElementById('adminSettingsModal'));
        adminSettingsModal.show();
      });
    }
  } else {
    // User is not logged in
    authContainer.innerHTML = `
      <div class="auth-status">
        <div class="auth-buttons">
          <button class="btn btn-sm btn-primary" id="login-btn">Login</button>
        </div>
      </div>
    `;
    
    // Add event listener for login button
    document.getElementById('login-btn').addEventListener('click', () => {
      const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
      loginModal.show();
    });
  }
  
  // Always ensure listings are visible - remove any authentication warnings
  const listingsContainer = document.getElementById('listings-container');
  if (listingsContainer) {
    if (listingsContainer.querySelector('.alert-warning')) {
      // Remove the warning if it exists
      listingsContainer.innerHTML = `
        <div class="col-12 text-center">
          <div class="spinner-border" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <p>Loading listings...</p>
        </div>
      `;
      // Fetch listings again
      fetchListings();
    }
  }
}

// Update protected features based on authentication state
function updateProtectedFeatures(isAuthenticated, user, isPublicAccessEnabled) {
  const isAdmin = user && user.role === 'admin';
  const canAccess = isPublicAccessEnabled || isAuthenticated;
  const canModify = isAdmin;
  
  // Configure tab
  const configureTab = document.getElementById('configure-tab');
  configureTab.classList.toggle('protected-tab', !canAccess);
  
  // Vendor Contact tab
  const vendorContactTab = document.getElementById('vendor-contact-tab');
  vendorContactTab.classList.toggle('protected-tab', !canAccess);
  
  // Add click handlers for tabs
  configureTab.onclick = function(event) {
    if (!canAccess) {
      event.preventDefault();
      showLoginPrompt();
      return false;
    }
  };
  
  vendorContactTab.onclick = function(event) {
    if (!canAccess) {
      event.preventDefault();
      showLoginPrompt();
      return false;
    }
  };
  
  // Protect modification controls in Configure tab
  const configureContent = document.getElementById('configure-content');
  if (configureContent) {
    const editButtons = configureContent.querySelectorAll('.btn-edit, .btn-delete, .btn-add, .btn-save, .btn-scrape');
    editButtons.forEach(button => {
      if (!canModify) {
        button.setAttribute('disabled', 'disabled');
        button.setAttribute('title', 'Admin privileges required');
        button.classList.add('cursor-not-allowed');
      } else {
        button.removeAttribute('disabled');
        button.removeAttribute('title');
        button.classList.remove('cursor-not-allowed');
      }
    });
  }
  
  // Protect modification controls in Vendor Contact tab
  const vendorContactContent = document.getElementById('vendor-contact-content');
  if (vendorContactContent) {
    const editButtons = vendorContactContent.querySelectorAll('.btn-edit, .btn-save, .btn-regenerate');
    editButtons.forEach(button => {
      if (!canModify) {
        button.setAttribute('disabled', 'disabled');
        button.setAttribute('title', 'Admin privileges required');
        button.classList.add('cursor-not-allowed');
      } else {
        button.removeAttribute('disabled');
        button.removeAttribute('title');
        button.classList.remove('cursor-not-allowed');
      }
    });
    
    // Disable text areas
    const textAreas = vendorContactContent.querySelectorAll('textarea');
    textAreas.forEach(textarea => {
      if (!canModify) {
        textarea.setAttribute('readonly', 'readonly');
        textarea.classList.add('cursor-not-allowed');
      } else {
        textarea.removeAttribute('readonly');
        textarea.classList.remove('cursor-not-allowed');
      }
    });
  }
}

// Show login prompt
function showLoginPrompt() {
  const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
  loginModal.show();
}

// Function to fetch listings
async function fetchListings() {
  showLoading('listings-container');
  try {
    // Remove credentials to ensure we always get listings without authentication
    const response = await fetch(`${window.config.API_BASE_URL}/listings`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const listings = await response.json();
    allListings = listings;
    filteredListings = [...allListings];
    
    // Apply saved filters
    applyFilters();
  } catch (error) {
    console.error('Error fetching listings:', error);
    document.getElementById('listings-container').innerHTML = `
      <div class="col-12 alert alert-danger">
        Failed to load listings. Please try again later.
      </div>
    `;
  }
}

// Function to fetch search configuration
async function fetchSearchConfig() {
  showLoading('search-urls-container');
  try {
    // Remove credentials to ensure we always get search config without authentication
    const response = await fetch(`${window.config.API_BASE_URL}/search-config`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    searchConfig = await response.json();
    
    // Populate search filter dropdown
    const searchFilter = document.getElementById('filter-search');
    searchFilter.innerHTML = '<option value="">All Searches</option>';
    
    searchConfig.forEach(search => {
      const option = document.createElement('option');
      option.value = search.id;
      option.textContent = search.name;
      searchFilter.appendChild(option);
    });
    
    // Set the saved search filter if it exists
    if (filterState.search) {
      searchFilter.value = filterState.search;
    }
    
    displaySearchConfig();
  } catch (error) {
    console.error('Error fetching search configuration:', error);
    document.getElementById('search-urls-container').innerHTML = `
      <div class="alert alert-danger">
        Failed to load search configuration. Please try again later.
      </div>
    `;
  }
}

// Function to display listings with animation
function displayListings(listings) {
  const container = document.getElementById('listings-container');
  
  if (!listings || listings.length === 0) {
    container.innerHTML = `
      <div class="col-12 alert alert-info">
        No listings found. Try running the scraper to collect some listings.
      </div>
    `;
    return;
  }
  
  // Clear the container first
  container.innerHTML = '';
  
  // Create and append each listing card with staggered animation
  listings.forEach((listing, index) => {
    const ramBadgeClass = getBadgeClass(listing.RAM_more);
    const screenSmallBadgeClass = getBadgeClass(listing.screen_small);
    const screenHighresBadgeClass = getBadgeClass(listing.screen_highres);
    const fullInfoBadgeClass = getBadgeClass(listing.full_info_obtained);
    
    const card = document.createElement('div');
    card.className = 'col-md-6 col-lg-4';
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    
    card.innerHTML = `
      <div class="listing-card">
        <div class="listing-title">${listing.title}</div>
        <div class="listing-price">${listing.price}</div>
        <div class="listing-date">${new Date(listing.date || Date.now()).toLocaleDateString()}</div>
        <div class="listing-location">${listing.location || 'Unknown location'}</div>
        
        ${listing.search_name ? `<div class="listing-search-name badge bg-secondary mb-2">${listing.search_name}</div>` : ''}
        
        <div class="badges mb-2 mt-2">
          <span class="badge ${ramBadgeClass}">RAM ≥ 32GB: ${formatBadgeValue(listing.RAM_more)}</span>
          <span class="badge ${screenSmallBadgeClass}">Small Screen: ${formatBadgeValue(listing.screen_small)}</span>
          <span class="badge ${screenHighresBadgeClass}">High Res: ${formatBadgeValue(listing.screen_highres)}</span>
          <span class="badge ${fullInfoBadgeClass}">Full Info: ${formatBadgeValue(listing.full_info_obtained)}</span>
        </div>
        
        <div class="listing-description">${listing.short_description || listing.description?.substring(0, 150) + '...' || 'No description'}</div>
        <div class="listing-link">
          <a href="${listing.url}" target="_blank" class="btn btn-sm btn-outline-primary">View Listing</a>
        </div>
      </div>
    `;
    
    container.appendChild(card);
    
    // Staggered animation for each card
    setTimeout(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 50 * index);
  });
}

// Function to format badge values
function formatBadgeValue(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Unknown';
}

// Function to get badge class based on value
function getBadgeClass(value) {
  if (value === true) return 'true-badge';
  if (value === false) return 'false-badge';
  return 'unknown-badge';
}

// Function to update listings count
function updateListingsCount() {
  const listingsCount = document.getElementById('listings-count');
  listingsCount.textContent = `Showing ${filteredListings.length} of ${allListings.length} listings`;
}

// Function to parse price
function parsePrice(priceString) {
  if (!priceString) return 0;
  // Extract numbers from the price string (e.g., "€ 1.200" -> 1200)
  const match = priceString.match(/[\d.,]+/);
  if (!match) return 0;
  
  // Replace comma with dot for decimal and remove thousands separators
  return parseFloat(match[0].replace(/\./g, '').replace(',', '.'));
}

// Function to apply filters
function applyFilters() {
  const filterRamMore = document.getElementById('filter-ram-more').checked;
  const filterScreenSmall = document.getElementById('filter-screen-small').checked;
  const filterScreenHighres = document.getElementById('filter-screen-highres').checked;
  const filterFullInfo = document.getElementById('filter-full-info').checked;
  const filterSearch = document.getElementById('filter-search').value;
  
  // Update filter state
  filterState = {
    ramMore: filterRamMore,
    screenSmall: filterScreenSmall,
    screenHighres: filterScreenHighres,
    fullInfo: filterFullInfo,
    search: filterSearch
  };
  
  // Save filter state to localStorage
  saveFilterState();
  
  filteredListings = allListings.filter(listing => {
    let include = true;
    
    if (filterRamMore) {
      include = include && listing.RAM_more === true;
    }
    
    if (filterScreenSmall) {
      include = include && listing.screen_small === true;
    }
    
    if (filterScreenHighres) {
      include = include && listing.screen_highres === true;
    }
    
    if (filterFullInfo) {
      include = include && listing.full_info_obtained === true;
    }
    
    if (filterSearch) {
      include = include && listing.search_id === filterSearch;
    }
    
    return include;
  });
  
  updateListingsCount();
  displayListings(filteredListings);
}

// Function to fetch server status
async function fetchServerStatus() {
  try {
    // Remove credentials to ensure we always get server status without authentication
    const response = await fetch(`${window.config.API_BASE_URL}/status`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const status = await response.json();
    updateStatusDisplay(status);
    return status;
  } catch (error) {
    console.error('Error fetching server status:', error);
    document.getElementById('server-status').innerHTML = `
      <div class="alert alert-danger">
        Failed to get server status. Server may be down.
      </div>
    `;
    return null;
  }
}

// Function to update status display
function updateStatusDisplay(status) {
  const statusLight = document.getElementById('status-light');
  const statusText = document.getElementById('status-text');
  const serverDetails = document.getElementById('server-details');
  
  if (statusLight && statusText) {
    statusLight.className = 'status-indicator status-online';
    statusText.textContent = 'Online';
    
    if (serverDetails) {
      serverDetails.innerHTML = `
        <div class="small">
          <div>Uptime: ${Math.floor(status.uptime / 60 / 60)} hours ${Math.floor(status.uptime / 60) % 60} minutes</div>
          <div>Memory: ${status.memory.rss} / ${status.memory.vms}</div>
          <div>Scraping in progress: ${status.scraping_in_progress ? 'Yes' : 'No'}</div>
          <div>Headless mode: ${status.headless_mode ? 'Yes' : 'No'}</div>
        </div>
      `;
    }
  }
}

// Function to fetch schedule
async function fetchSchedule() {
  try {
    // Remove credentials to ensure we always get schedule without authentication
    const response = await fetch(`${window.config.API_BASE_URL}/schedule`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const schedule = await response.json();
    
    document.getElementById('schedule-interval').value = schedule.interval || 60;
    document.getElementById('schedule-enabled').checked = schedule.enabled !== false;
  } catch (error) {
    console.error('Error fetching schedule:', error);
  }
}

// Function to save schedule
async function saveSchedule() {
  try {
    const interval = parseInt(document.getElementById('schedule-interval').value) || 60;
    const enabled = document.getElementById('schedule-enabled').checked;
    
    const response = await fetch(`${window.config.API_BASE_URL}/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ interval, enabled }),
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    showStatus('Schedule saved successfully!', 'success');
  } catch (error) {
    console.error('Error saving schedule:', error);
    showStatus('Failed to save schedule. Please try again.', 'danger');
  }
}

// Function to display search configuration
function displaySearchConfig() {
  const container = document.getElementById('search-urls-container');
  
  if (!searchConfig || searchConfig.length === 0) {
    container.innerHTML = '<div class="alert alert-info">No search configurations found.</div>';
    return;
  }
  
  let html = '';
  
  searchConfig.forEach((search, index) => {
    html += `
      <div class="search-url-item" data-index="${index}" data-id="${search.id}">
        <div class="row">
          <div class="col-md-4">
            <label class="form-label">Name</label>
            <input type="text" class="form-control search-name" value="${search.name || ''}">
          </div>
          <div class="col-md-6">
            <label class="form-label">URL</label>
            <input type="text" class="form-control search-url" value="${search.url || ''}">
          </div>
          <div class="col-md-1">
            <label class="form-label">Enabled</label>
            <div class="form-check mt-2">
              <input class="form-check-input search-enabled" type="checkbox" ${search.enabled !== false ? 'checked' : ''}>
            </div>
          </div>
          <div class="col-md-1">
            <label class="form-label">&nbsp;</label>
            <button class="btn btn-sm btn-danger remove-search d-block">Remove</button>
          </div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Add event listeners for remove buttons
  document.querySelectorAll('.remove-search').forEach(button => {
    button.addEventListener('click', function() {
      const item = this.closest('.search-url-item');
      item.remove();
    });
  });
}

// Function to add a new search
function addSearch() {
  const newUrl = document.getElementById('new-url').value.trim();
  
  if (!newUrl) {
    showStatus('Please enter a URL', 'warning');
    return;
  }
  
  // Extract a name from the URL
  let name = 'New Search';
  if (newUrl.includes('rtx4060') || newUrl.includes('rtx-4060')) {
    name = 'RTX 4060';
  } else if (newUrl.includes('rtx4070') || newUrl.includes('rtx-4070')) {
    name = 'RTX 4070';
  }
  
  const container = document.getElementById('search-urls-container');
  const index = document.querySelectorAll('.search-url-item').length;
  
  const searchItem = document.createElement('div');
  searchItem.className = 'search-url-item';
  searchItem.dataset.index = index;
  searchItem.dataset.id = ''; // New items don't have an ID yet
  
  searchItem.innerHTML = `
    <div class="row">
      <div class="col-md-4">
        <label class="form-label">Name</label>
        <input type="text" class="form-control search-name" value="${name}">
      </div>
      <div class="col-md-6">
        <label class="form-label">URL</label>
        <input type="text" class="form-control search-url" value="${newUrl}">
      </div>
      <div class="col-md-1">
        <label class="form-label">Enabled</label>
        <div class="form-check mt-2">
          <input class="form-check-input search-enabled" type="checkbox" checked>
        </div>
      </div>
      <div class="col-md-1">
        <label class="form-label">&nbsp;</label>
        <button class="btn btn-sm btn-danger remove-search d-block">Remove</button>
      </div>
    </div>
  `;
  
  container.appendChild(searchItem);
  
  // Add event listener for the remove button
  searchItem.querySelector('.remove-search').addEventListener('click', function() {
    searchItem.remove();
  });
  
  // Clear the input
  document.getElementById('new-url').value = '';
}

// Function to save search configuration
async function saveSearchConfig() {
  try {
    const searchItems = document.querySelectorAll('.search-url-item');
    const config = Array.from(searchItems).map(item => {
      return {
        id: item.dataset.id || undefined, // If it's a new item, let the server generate an ID
        name: item.querySelector('.search-name').value,
        url: item.querySelector('.search-url').value,
        enabled: item.querySelector('.search-enabled').checked
      };
    });
    
    const response = await fetch(`${window.config.API_BASE_URL}/search-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    showStatus('Search configuration saved successfully!', 'success');
    
    // Refresh the search configuration
    searchConfig = result.config || [];
    displaySearchConfig();
    
    // Also refresh the search filter dropdown
    const searchFilter = document.getElementById('filter-search');
    searchFilter.innerHTML = '<option value="">All Searches</option>';
    
    searchConfig.forEach(search => {
      const option = document.createElement('option');
      option.value = search.id;
      option.textContent = search.name;
      searchFilter.appendChild(option);
    });
  } catch (error) {
    console.error('Error saving search configuration:', error);
    showStatus('Failed to save search configuration. Please try again.', 'danger');
  }
}

// Function to start scraping
async function startScraping() {
  try {
    const mode = document.getElementById('scrape-mode').value;
    const maxListings = parseInt(document.getElementById('max-listings').value) || 50;
    
    // Get enabled search IDs
    const searchIds = searchConfig
      .filter(search => search.enabled)
      .map(search => search.id);
    
    if (mode !== 'process' && (!searchIds || searchIds.length === 0)) {
      showStatus('Please add at least one enabled search', 'warning');
      return;
    }
    
    // Confirm with the user
    if (!confirm(`Start scraping in ${mode} mode${searchIds.length > 0 ? ` with ${searchIds.length} searches` : ''}?`)) {
      return;
    }
    
    showStatus('Starting scraping process...', 'info');
    
    const response = await fetch(`${window.config.API_BASE_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode,
        search_ids: searchIds,
        maxListings
      }),
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    showStatus(`Scraping process started! Process ID: ${result.thread_id}`, 'success');
  } catch (error) {
    console.error('Error starting scraping:', error);
    showStatus('Failed to start scraping. Please try again.', 'danger');
  }
}

// Function to show status messages with improved animation
function showStatus(message, type) {
  const scraperStatus = document.getElementById('scraper-status');
  
  // First fade out
  scraperStatus.style.opacity = '0';
  scraperStatus.style.transform = 'translateY(-10px)';
  
  setTimeout(() => {
    // Update content
    scraperStatus.className = `alert alert-${type} mt-3`;
    scraperStatus.textContent = message;
    scraperStatus.classList.remove('d-none');
    
    // Then fade in
    scraperStatus.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    scraperStatus.style.opacity = '1';
    scraperStatus.style.transform = 'translateY(0)';
    
    // Hide the status message after 5 seconds
    setTimeout(() => {
      scraperStatus.style.opacity = '0';
      scraperStatus.style.transform = 'translateY(-10px)';
      
      setTimeout(() => {
        scraperStatus.classList.add('d-none');
      }, 300);
    }, 5000);
  }, 300);
}

// Add a function to show loading animations
function showLoading(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = `
      <div class="text-center p-4">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-2">Loading...</p>
      </div>
    `;
  }
}

// Function to show alert
function showAlert(containerId, type, message) {
  const container = document.getElementById(containerId);
  if (container) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} mt-3`;
    alertDiv.textContent = message;
    
    // Clear previous alerts
    const previousAlerts = container.querySelectorAll('.alert');
    previousAlerts.forEach(alert => alert.remove());
    
    container.prepend(alertDiv);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      alertDiv.style.opacity = '0';
      alertDiv.style.transition = 'opacity 0.5s ease';
      
      setTimeout(() => {
        alertDiv.remove();
      }, 500);
    }, 5000);
  }
}

// Document ready function
document.addEventListener('DOMContentLoaded', function() {
  // Initialize authentication UI
  setupAuthUI();
  
  // Load saved filter state
  loadFilterState();
  
  // Fetch initial data
  fetchListings();
  fetchSearchConfig();
  
  // Set up event listeners
  setupEventListeners();
  
  // Check server status
  checkServerStatus();
  
  // Fetch schedule
  fetchSchedule();
});

// Set up event listeners
function setupEventListeners() {
  // Set up event listeners for sorting
  document.getElementById('sort-price-asc').addEventListener('click', function() {
    filteredListings.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    displayListings(filteredListings);
  });
  
  document.getElementById('sort-price-desc').addEventListener('click', function() {
    filteredListings.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    displayListings(filteredListings);
  });
  
  document.getElementById('sort-date-desc').addEventListener('click', function() {
    filteredListings.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    displayListings(filteredListings);
  });
  
  document.getElementById('reset-sort').addEventListener('click', function() {
    filteredListings = [...allListings];
    applyFilters();
  });
  
  // Set up event listeners for filtering
  document.getElementById('filter-ram-more').addEventListener('change', applyFilters);
  document.getElementById('filter-screen-small').addEventListener('change', applyFilters);
  document.getElementById('filter-screen-highres').addEventListener('change', applyFilters);
  document.getElementById('filter-full-info').addEventListener('change', applyFilters);
  document.getElementById('filter-search').addEventListener('change', applyFilters);
  
  // Set up event listeners for configuration
  document.getElementById('save-schedule').addEventListener('click', saveSchedule);
  document.getElementById('add-url').addEventListener('click', addSearch);
  document.getElementById('save-urls').addEventListener('click', saveSearchConfig);
  document.getElementById('start-scraping').addEventListener('click', startScraping);
  
  // Set up periodic status check
  setInterval(fetchServerStatus, 30000); // Check status every 30 seconds
}

// Check server status
function checkServerStatus() {
  fetchServerStatus().then(() => {
    // No need to handle the result, as the status is already displayed
  });
}