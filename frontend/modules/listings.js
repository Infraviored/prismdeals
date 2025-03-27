// Listings Module - Handles listing display, filtering, and sorting

// Global variables
let allListings = [];
let filteredListings = [];

// Store sort preference
let sortPreference = {
  type: null, // 'price-asc', 'price-desc', 'date-desc'
  active: false
};

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

// Function to fetch listings
async function fetchListings() {
  showLoading('listings-container');
  try {
    // Get the show deleted parameter from the checkbox
    const showDeleted = document.getElementById('show-deleted-listings').checked;
    
    // Include the parameter in the URL
    const response = await fetch(`${window.config.API_BASE_URL}/listings?show_deleted=${showDeleted}`, {
      credentials: 'include' // Include credentials for authentication
    });
    
    if (response.status === 401) {
      // Unauthorized - show login prompt
      document.getElementById('listings-container').innerHTML = `
        <div class="col-12 alert alert-warning">
          <h4 class="alert-heading">Authentication Required</h4>
          <p>You need to be logged in to view listings.</p>
          <button class="btn btn-primary" id="listings-login-btn">Login</button>
        </div>
      `;
      
      document.getElementById('listings-login-btn').addEventListener('click', () => {
        if (typeof window.showLoginPrompt === 'function') {
          window.showLoginPrompt();
        } else if (typeof showLoginPrompt === 'function') {
          showLoginPrompt();
        }
      });
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
        <h4 class="alert-heading">Error Loading Listings</h4>
        <p>Failed to load listings. Please try again later.</p>
        <p><small>Error: ${error.message}</small></p>
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

// Set up event listeners for listings features
function setupListingsEventListeners() {
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
  
  // Show deleted listings checkbox
  document.getElementById('show-deleted-listings').addEventListener('change', () => {
    fetchListings();
  });
}

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

// Initialize listings module
function initListingsModule() {
  loadFilterState();
  loadSortPreference();
  setupListingsEventListeners();
}

// Export functions for use in other modules
export {
  fetchListings,
  displayListings,
  applyFilters,
  updateListingsCount,
  applySortPreference,
  initListingsModule,
  allListings,
  filteredListings
}; 