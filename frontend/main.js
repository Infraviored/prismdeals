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

// Store sort preference
let sortPreference = {
  type: null, // 'price-asc', 'price-desc', 'date-desc'
  active: false
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

// Function to save sort preference to local storage
function saveSortPreference() {
  localStorage.setItem('sortPreference', JSON.stringify(sortPreference));
}

// Function to load sort preference from local storage
function loadSortPreference() {
  const savedPreference = localStorage.getItem('sortPreference');
  if (savedPreference) {
    sortPreference = JSON.parse(savedPreference);
    // Apply the saved sort preference
    if (sortPreference.active && sortPreference.type) {
      applySortPreference();
    }
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
    // Get the show deleted parameter from the checkbox
    const showDeleted = document.getElementById('show-deleted-listings').checked;
    
    // Include the parameter in the URL
    const response = await fetch(`${API_BASE_URL}/listings?show_deleted=${showDeleted}`, {
      credentials: 'include' // Include credentials for authentication
    });
    
    if (response.status === 401) {
      // Unauthorized - show login prompt
      document.getElementById('listings-container').innerHTML = `
        <div class="col-12 alert alert-warning">
          <p>Authentication required to view listings.</p>
          <button class="btn btn-primary" id="listings-login-btn">Login</button>
        </div>
      `;
      
      document.getElementById('listings-login-btn').addEventListener('click', showLoginPrompt);
      return;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const listings = await response.json();
    allListings = listings;
    filteredListings = [...allListings];
    updateListingsCount();
    
    // Apply the saved sort preference
    applySortPreference();
    
    // If no sort preference is active, display the listings as is
    if (!sortPreference.active) {
      displayListings(filteredListings);
    }
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
    const response = await fetch(`${API_BASE_URL}/search-config`);
    
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
    
    // Apply deleted styling if the listing is deleted
    const isDeleted = listing.is_deleted === true;
    const deletedClass = isDeleted ? 'deleted-listing' : '';
    
    // Create deleted badge with deletion date if available
    let deletedBadge = '';
    if (isDeleted) {
      const deletedAt = listing.deleted_at ? new Date(listing.deleted_at * 1000).toLocaleDateString() : 'Unknown date';
      deletedBadge = `<span class="badge bg-danger deleted-badge">Deleted${listing.deleted_at ? ': ' + deletedAt : ''}</span>`;
    }
    
    card.innerHTML = `
      <div class="listing-card ${deletedClass}">
        <div class="listing-title">${listing.title}</div>
        <div class="listing-price">${listing.price}</div>
        <div class="listing-date">${new Date(listing.date || Date.now()).toLocaleDateString()}</div>
        <div class="listing-location">${listing.location || 'Unknown location'}</div>
        
        ${listing.search_name ? `<div class="listing-search-name badge bg-secondary mb-2">${listing.search_name}</div>` : ''}
        ${deletedBadge}
        
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
  
  // Apply the current sort preference to the filtered listings
  if (sortPreference.active && sortPreference.type) {
    applySortPreference();
  } else {
    displayListings(filteredListings);
  }
}

// Function to fetch server status
async function fetchServerStatus() {
  try {
    // Remove credentials to ensure we always get server status without authentication
    const response = await fetch(`${API_BASE_URL}/status`);
    
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
    const response = await fetch(`${API_BASE_URL}/schedule`);
    
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
    
    const response = await fetch(`${API_BASE_URL}/schedule`, {
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
    
    const response = await fetch(`${API_BASE_URL}/search-config`, {
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
    
    const response = await fetch(`${API_BASE_URL}/scrape`, {
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

// Housekeeping functions

// Function to load housekeeping settings
async function loadHousekeepingSettings() {
  try {
    const response = await fetch(`${API_BASE_URL}/housekeeping/settings`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const settings = await response.json();
    
    // Update the form with the loaded settings
    document.getElementById('housekeeping-enabled').checked = settings.enabled !== false;
    document.getElementById('housekeeping-hour').value = settings.hour || 3;
    document.getElementById('housekeeping-minute').value = settings.minute || 0;
    document.getElementById('housekeeping-check-deleted').checked = settings.check_deleted !== false;
    document.getElementById('housekeeping-show-deleted').checked = settings.show_deleted !== false;
    
    // Update the show deleted checkbox in the listings tab as well
    document.getElementById('show-deleted-listings').checked = settings.show_deleted !== false;
    
    // Update last run message
    const lastRunElem = document.getElementById('housekeeping-last-run');
    if (settings.last_run) {
      const lastRunDate = new Date(settings.last_run * 1000);
      lastRunElem.textContent = `Last run: ${lastRunDate.toLocaleString()}`;
    } else {
      lastRunElem.textContent = 'Last run: Never';
    }
    
    return settings;
  } catch (error) {
    console.error('Error loading housekeeping settings:', error);
    showAlert('housekeeping-content', 'danger', 'Failed to load housekeeping settings');
    return null;
  }
}

// Function to save housekeeping settings
async function saveHousekeepingSettings() {
  try {
    const settings = {
      enabled: document.getElementById('housekeeping-enabled').checked,
      hour: parseInt(document.getElementById('housekeeping-hour').value) || 3,
      minute: parseInt(document.getElementById('housekeeping-minute').value) || 0,
      check_deleted: document.getElementById('housekeeping-check-deleted').checked,
      show_deleted: document.getElementById('housekeeping-show-deleted').checked
    };
    
    const response = await fetch(`${API_BASE_URL}/housekeeping/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings),
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Update the show deleted checkbox in the listings tab
    document.getElementById('show-deleted-listings').checked = settings.show_deleted;
    
    showAlert('housekeeping-content', 'success', 'Housekeeping settings saved successfully');
    
    // Refresh listings if show_deleted setting changed
    fetchListings();
    
    return result;
  } catch (error) {
    console.error('Error saving housekeeping settings:', error);
    showAlert('housekeeping-content', 'danger', 'Failed to save housekeeping settings');
    return null;
  }
}

// Function to run housekeeping manually
async function runHousekeeping() {
  try {
    // Disable the button
    const button = document.getElementById('run-housekeeping');
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Running...';
    
    // Show status
    const statusElem = document.getElementById('housekeeping-status');
    statusElem.className = 'alert alert-info mt-3';
    statusElem.textContent = 'Housekeeping is running. This may take a while...';
    statusElem.classList.remove('d-none');
    
    const response = await fetch(`${API_BASE_URL}/housekeeping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Show success
    statusElem.className = 'alert alert-success mt-3';
    statusElem.textContent = 'Housekeeping started successfully. It will run in the background.';
    
    // Re-enable the button
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-broom"></i> Run Housekeeping';
    
    // Refresh housekeeping settings to update last run time
    setTimeout(() => {
      loadHousekeepingSettings();
    }, 1000);
    
    // Set a timer to reload listings after a delay
    setTimeout(() => {
      fetchListings();
    }, 5000);
    
    return result;
  } catch (error) {
    console.error('Error running housekeeping:', error);
    
    // Show error
    const statusElem = document.getElementById('housekeeping-status');
    statusElem.className = 'alert alert-danger mt-3';
    statusElem.textContent = `Error running housekeeping: ${error.message}`;
    statusElem.classList.remove('d-none');
    
    // Re-enable the button
    const button = document.getElementById('run-housekeeping');
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-broom"></i> Run Housekeeping';
    
    return null;
  }
}

// Function to check a single listing
async function checkListingAvailability(url) {
  try {
    // Show loading
    const resultElem = document.getElementById('listing-check-result');
    resultElem.className = 'alert alert-info mt-3';
    resultElem.innerHTML = `
      <div class="spinner-border spinner-border-sm" role="status"></div>
      Checking listing: ${url}
    `;
    resultElem.classList.remove('d-none');
    
    const response = await fetch(`${API_BASE_URL}/check-listing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url }),
      credentials: 'include'
    });
    
    // First handle any HTTP errors
    if (!response.ok) {
      if (response.status === 401) {
        resultElem.className = 'alert alert-warning mt-3';
        resultElem.innerHTML = `
          <strong>Authentication Required</strong>
          <p>You need to log in to check listing availability.</p>
          <button class="btn btn-sm btn-primary" id="check-login-btn">Login</button>
        `;
        document.getElementById('check-login-btn').addEventListener('click', showLoginPrompt);
        return null;
      }
      
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Check for API errors
    if (result.status === 'error') {
      throw new Error(result.message || 'Unknown error from server');
    }
    
    // Show result
    if (result.is_deleted) {
      resultElem.className = 'alert alert-danger mt-3';
      resultElem.innerHTML = `
        <strong>Listing status:</strong> Deleted
        <p>The listing has been deleted from Kleinanzeigen.</p>
        <p>You can still view the cached version in your listings tab.</p>
      `;
    } else {
      resultElem.className = 'alert alert-success mt-3';
      resultElem.innerHTML = `
        <strong>Listing status:</strong> Available
        <p>The listing is still available on Kleinanzeigen.</p>
        <a href="${url}" target="_blank" class="btn btn-sm btn-outline-primary mt-2">View Listing</a>
      `;
    }
    
    return result;
  } catch (error) {
    console.error('Error checking listing:', error);
    
    // Show a more user-friendly error message
    const resultElem = document.getElementById('listing-check-result');
    resultElem.className = 'alert alert-danger mt-3';
    resultElem.innerHTML = `
      <strong>Error checking listing</strong>
      <p>${error.message}</p>
      <div class="small text-muted mt-2">
        <strong>Troubleshooting tips:</strong>
        <ul>
          <li>Make sure the URL is valid</li>
          <li>Check if the website is accessible</li>
          <li>Wait a few minutes and try again</li>
        </ul>
      </div>
    `;
    resultElem.classList.remove('d-none');
    
    return null;
  }
}

// Function to set up housekeeping event listeners
function setupHousekeepingUI() {
  // Load initial housekeeping settings
  loadHousekeepingSettings();
  
  // Save settings button
  document.getElementById('save-housekeeping-settings').addEventListener('click', saveHousekeepingSettings);
  
  // Run housekeeping button
  document.getElementById('run-housekeeping').addEventListener('click', runHousekeeping);
  
  // Check listing button
  document.getElementById('check-listing').addEventListener('click', () => {
    const url = document.getElementById('test-listing-url').value.trim();
    if (url) {
      checkListingAvailability(url);
    } else {
      // Show error
      const resultElem = document.getElementById('listing-check-result');
      resultElem.className = 'alert alert-danger mt-3';
      resultElem.textContent = 'Please enter a valid listing URL';
      resultElem.classList.remove('d-none');
    }
  });
  
  // Show deleted listings checkbox
  document.getElementById('show-deleted-listings').addEventListener('change', () => {
    fetchListings();
  });
  
  // Mirror show deleted setting between tabs
  document.getElementById('housekeeping-show-deleted').addEventListener('change', (e) => {
    document.getElementById('show-deleted-listings').checked = e.target.checked;
  });
}

// Add CSS styles for deleted listings
function addDeletedListingStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .deleted-listing {
      opacity: 0.7;
      background-color: #f8f8f8;
      border-color: #ddd;
    }
    
    .dark-mode .deleted-listing {
      background-color: #2a2a2a;
      border-color: #444;
    }
    
    .deleted-badge {
      position: absolute;
      top: 10px;
      right: 10px;
    }
    
    .sort-button.active {
      background-color: #0d6efd;
      color: white;
    }
  `;
  document.head.appendChild(style);
}

// Document ready function
document.addEventListener('DOMContentLoaded', function() {
  // Initialize authentication UI
  setupAuthUI();
  
  // Add styles for deleted listings
  addDeletedListingStyles();
  
  // Load saved sort preference
  loadSortPreference();
  
  // Fetch initial data
  fetchListings();
  fetchSearchConfig();
  
  // Set up event listeners
  setupEventListeners();
  
  // Set up housekeeping UI
  setupHousekeepingUI();
  
  // Check server status
  checkServerStatus();
});

// Set up event listeners
function setupEventListeners() {
  // Set up event listeners for sorting
  document.getElementById('sort-price-asc').addEventListener('click', function() {
    filteredListings.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    displayListings(filteredListings);
    
    // Update sort preference
    sortPreference = { type: 'price-asc', active: true };
    saveSortPreference();
    
    // Add active class to this button and remove from others
    document.querySelectorAll('.sort-button').forEach(btn => {
      btn.classList.remove('active');
    });
    this.classList.add('active');
  });
  
  document.getElementById('sort-price-desc').addEventListener('click', function() {
    filteredListings.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
    displayListings(filteredListings);
    
    // Update sort preference
    sortPreference = { type: 'price-desc', active: true };
    saveSortPreference();
    
    // Add active class to this button and remove from others
    document.querySelectorAll('.sort-button').forEach(btn => {
      btn.classList.remove('active');
    });
    this.classList.add('active');
  });
  
  document.getElementById('sort-date-desc').addEventListener('click', function() {
    filteredListings.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    displayListings(filteredListings);
    
    // Update sort preference
    sortPreference = { type: 'date-desc', active: true };
    saveSortPreference();
    
    // Add active class to this button and remove from others
    document.querySelectorAll('.sort-button').forEach(btn => {
      btn.classList.remove('active');
    });
    this.classList.add('active');
  });
  
  document.getElementById('reset-sort').addEventListener('click', function() {
    filteredListings = [...allListings];
    applyFilters();
    
    // Reset sort preference
    sortPreference = { type: null, active: false };
    saveSortPreference();
    
    // Remove active class from all buttons
    document.querySelectorAll('.sort-button').forEach(btn => {
      btn.classList.remove('active');
    });
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

// Function to apply the current sort preference
function applySortPreference() {
  if (!sortPreference.active || !sortPreference.type) return;
  
  // Remove active class from all sort buttons
  document.querySelectorAll('.sort-button').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Apply the sort
  switch (sortPreference.type) {
    case 'price-asc':
      filteredListings.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
      document.getElementById('sort-price-asc').classList.add('active');
      break;
    case 'price-desc':
      filteredListings.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
      document.getElementById('sort-price-desc').classList.add('active');
      break;
    case 'date-desc':
      filteredListings.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      document.getElementById('sort-date-desc').classList.add('active');
      break;
  }
  
  // Display the sorted listings
  displayListings(filteredListings);
}