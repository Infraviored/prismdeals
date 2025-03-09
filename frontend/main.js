// API base URL - change this to your domain when deployed with Nginx
const API_BASE_URL = '/api';

// Global variables
let allListings = [];
let filteredListings = [];
let searchConfig = [];

// Function to fetch listings
async function fetchListings() {
  try {
    const response = await fetch(`${API_BASE_URL}/listings`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const listings = await response.json();
    allListings = listings;
    filteredListings = [...allListings];
    updateListingsCount();
    displayListings(filteredListings);
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
  try {
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
    
    // Also update the search URLs display
    displaySearchConfig();
  } catch (error) {
    console.error('Error fetching search configuration:', error);
  }
}

// Function to display listings
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
  
  let html = '';
  
  listings.forEach(listing => {
    const ramBadgeClass = getBadgeClass(listing.RAM_more);
    const screenSmallBadgeClass = getBadgeClass(listing.screen_small);
    const screenHighresBadgeClass = getBadgeClass(listing.screen_highres);
    const fullInfoBadgeClass = getBadgeClass(listing.full_info_obtained);
    
    html += `
      <div class="col-md-6 col-lg-4">
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
      </div>
    `;
  });
  
  container.innerHTML = html;
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
  displayListings(filteredListings);
}

// Function to fetch server status
async function fetchServerStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/status`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const status = await response.json();
    
    const statusLight = document.getElementById('status-light');
    const statusText = document.getElementById('status-text');
    const serverDetails = document.getElementById('server-details');
    
    statusLight.className = 'status-indicator status-online';
    statusText.textContent = 'Online';
    
    serverDetails.innerHTML = `
      <div class="small">
        <div>Uptime: ${Math.floor(status.uptime / 60 / 60)} hours ${Math.floor(status.uptime / 60) % 60} minutes</div>
        <div>Memory: ${status.memory.rss} / ${status.memory.vms}</div>
        <div>Scraping in progress: ${status.scraping_in_progress ? 'Yes' : 'No'}</div>
        <div>Headless mode: ${status.headless_mode ? 'Yes' : 'No'}</div>
      </div>
    `;
  } catch (error) {
    console.error('Error fetching server status:', error);
    const statusLight = document.getElementById('status-light');
    const statusText = document.getElementById('status-text');
    
    statusLight.className = 'status-indicator status-offline';
    statusText.textContent = 'Offline';
    document.getElementById('server-details').innerHTML = '';
  }
}

// Function to fetch schedule
async function fetchSchedule() {
  try {
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

// Function to show status messages
function showStatus(message, type) {
  const scraperStatus = document.getElementById('scraper-status');
  scraperStatus.className = `alert alert-${type} mt-3`;
  scraperStatus.textContent = message;
  scraperStatus.classList.remove('d-none');
  
  // Hide the status message after 5 seconds
  setTimeout(() => {
    scraperStatus.classList.add('d-none');
  }, 5000);
}

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
  // Fetch initial data
  fetchSearchConfig();
  fetchListings();
  fetchServerStatus();
  fetchSchedule();
  
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
});