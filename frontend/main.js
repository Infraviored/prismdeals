// API base URL - change this to your domain when deployed with Nginx
const API_BASE_URL = '/api';

// Global variables
let allListings = [];
let filteredListings = [];

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

// Function to fetch search URLs
async function fetchSearchUrls() {
  try {
    const response = await fetch(`${API_BASE_URL}/search-urls`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const urls = await response.json();
    displaySearchUrls(urls);
  } catch (error) {
    console.error('Error fetching search URLs:', error);
  }
}

// Function to display search URLs
function displaySearchUrls(urls) {
  const container = document.getElementById('search-urls-container');
  
  if (!urls || urls.length === 0) {
    container.innerHTML = '<div class="alert alert-info">No search URLs configured.</div>';
    return;
  }
  
  let html = '';
  
  urls.forEach((url, index) => {
    html += `
      <div class="search-url-item" data-index="${index}">
        <div class="row">
          <div class="col-md-8">
            <input type="text" class="form-control url-input" value="${url.url}">
          </div>
          <div class="col-md-2">
            <div class="form-check">
              <input class="form-check-input url-enabled" type="checkbox" ${url.enabled !== false ? 'checked' : ''}>
              <label class="form-check-label">Enabled</label>
            </div>
          </div>
          <div class="col-md-2">
            <button class="btn btn-sm btn-danger remove-url">Remove</button>
          </div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Add event listeners for remove buttons
  document.querySelectorAll('.remove-url').forEach(button => {
    button.addEventListener('click', function() {
      const item = this.closest('.search-url-item');
      item.remove();
    });
  });
}

// Function to save search URLs
async function saveSearchUrls() {
  try {
    const urlItems = document.querySelectorAll('.search-url-item');
    const urls = Array.from(urlItems).map(item => {
      return {
        url: item.querySelector('.url-input').value,
        enabled: item.querySelector('.url-enabled').checked
      };
    });
    
    const response = await fetch(`${API_BASE_URL}/search-urls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(urls),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    showStatus('Search URLs saved successfully!', 'success');
    fetchSearchUrls(); // Refresh the list
  } catch (error) {
    console.error('Error saving search URLs:', error);
    showStatus('Failed to save search URLs. Please try again.', 'danger');
  }
}

// Function to add a new URL
function addSearchUrl() {
  const newUrl = document.getElementById('new-url').value.trim();
  
  if (!newUrl) {
    showStatus('Please enter a URL', 'warning');
    return;
  }
  
  const container = document.getElementById('search-urls-container');
  const index = document.querySelectorAll('.search-url-item').length;
  
  const urlItem = document.createElement('div');
  urlItem.className = 'search-url-item';
  urlItem.dataset.index = index;
  
  urlItem.innerHTML = `
    <div class="row">
      <div class="col-md-8">
        <input type="text" class="form-control url-input" value="${newUrl}">
      </div>
      <div class="col-md-2">
        <div class="form-check">
          <input class="form-check-input url-enabled" type="checkbox" checked>
          <label class="form-check-label">Enabled</label>
        </div>
      </div>
      <div class="col-md-2">
        <button class="btn btn-sm btn-danger remove-url">Remove</button>
      </div>
    </div>
  `;
  
  container.appendChild(urlItem);
  
  // Add event listener for the remove button
  urlItem.querySelector('.remove-url').addEventListener('click', function() {
    urlItem.remove();
  });
  
  // Clear the input
  document.getElementById('new-url').value = '';
}

// Function to start scraping
async function startScraping() {
  try {
    const mode = document.getElementById('scrape-mode').value;
    const maxListings = parseInt(document.getElementById('max-listings').value) || 50;
    
    // Get enabled URLs
    const urlItems = document.querySelectorAll('.search-url-item');
    const urls = Array.from(urlItems)
      .filter(item => item.querySelector('.url-enabled').checked)
      .map(item => item.querySelector('.url-input').value);
    
    if (mode !== 'process' && (!urls || urls.length === 0)) {
      showStatus('Please add at least one enabled search URL', 'warning');
      return;
    }
    
    // Confirm with the user
    if (!confirm(`Start scraping in ${mode} mode${urls.length > 0 ? ` with ${urls.length} URLs` : ''}?`)) {
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
        urls,
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
  fetchListings();
  fetchServerStatus();
  fetchSchedule();
  fetchSearchUrls();
  
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
  
// ... existing code ...
  
  // Set up event listeners for configuration
  document.getElementById('save-schedule').addEventListener('click', saveSchedule);
  document.getElementById('add-url').addEventListener('click', addSearchUrl);
  document.getElementById('save-urls').addEventListener('click', saveSearchUrls);
  document.getElementById('start-scraping').addEventListener('click', startScraping);
  
  // Set up periodic status check
  setInterval(fetchServerStatus, 30000); // Check status every 30 seconds
});