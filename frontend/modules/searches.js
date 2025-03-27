// Searches Module - Handles search configurations and scraping functionality

// Global variables
let allSearches = [];
let scrapeStatus = {
  inProgress: false,
  progress: 0,
  message: ''
};

// Function to fetch search configurations
async function fetchSearches() {
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/search-config`, {
      credentials: 'include'
    });
    
    if (response.status === 401) {
      // Unauthorized - show login message
      const container = document.getElementById('searches-container');
      if (container) {
        container.innerHTML = `
          <div class="alert alert-warning">
            <h4 class="alert-heading">Authentication Required</h4>
            <p>You need to be logged in to view search configurations.</p>
            <button class="btn btn-primary" id="searches-login-btn">Login</button>
          </div>
        `;
        
        document.getElementById('searches-login-btn').addEventListener('click', () => {
          if (typeof window.showLoginPrompt === 'function') {
            window.showLoginPrompt();
          } else if (typeof showLoginPrompt === 'function') {
            showLoginPrompt();
          }
        });
      }
      return [];
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const searches = await response.json();
    allSearches = searches;
    
    // Populate search dropdown in listings tab
    populateSearchDropdown();
    
    return searches;
  } catch (error) {
    console.error('Error fetching searches:', error);
    return [];
  }
}

// Function to populate search dropdown in listings filter
function populateSearchDropdown() {
  const dropdown = document.getElementById('filter-search');
  if (!dropdown) return;
  
  // Clear existing options
  dropdown.innerHTML = '<option value="">All Searches</option>';
  
  // Add options for each search
  allSearches.forEach(search => {
    const option = document.createElement('option');
    option.value = search.id;
    option.textContent = search.name;
    dropdown.appendChild(option);
  });
  
  // Apply saved search filter if it exists
  const savedState = localStorage.getItem('filterState');
  if (savedState) {
    const filterState = JSON.parse(savedState);
    if (filterState.search) {
      dropdown.value = filterState.search;
    }
  }
}

// Function to display search configurations
function displaySearches(searches) {
  const container = document.getElementById('searches-container');
  if (!container) return;
  
  if (!searches || searches.length === 0) {
    container.innerHTML = `
      <div class="alert alert-info">
        No search configurations found. Add a new search configuration below.
      </div>
    `;
    return;
  }
  
  // Create a card for each search configuration
  let searchesHTML = '';
  searches.forEach(search => {
    searchesHTML += `
      <div class="col-md-6 mb-4">
        <div class="card search-card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <h5 class="search-name mb-0">${search.name}</h5>
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-danger delete-search" data-search-id="${search.id}">
                <i class="bi bi-trash"></i>
              </button>
              <button class="btn btn-sm btn-outline-primary edit-search" data-search-id="${search.id}">
                <i class="bi bi-pencil"></i>
              </button>
            </div>
          </div>
          <div class="card-body">
            <p><strong>URL:</strong> <a href="${search.url}" target="_blank">${search.url}</a></p>
            <p><strong>Min price:</strong> ${search.min_price || 'Not set'}</p>
            <p><strong>Max price:</strong> ${search.max_price || 'Not set'}</p>
            <div class="d-grid">
              <button class="btn btn-primary run-search" data-search-id="${search.id}">
                Run Scraper for This Search
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = `<div class="row">${searchesHTML}</div>`;
  
  // Add event listeners
  document.querySelectorAll('.delete-search').forEach(button => {
    button.addEventListener('click', function() {
      const searchId = this.getAttribute('data-search-id');
      if (confirm('Are you sure you want to delete this search configuration?')) {
        deleteSearch(searchId);
      }
    });
  });
  
  document.querySelectorAll('.edit-search').forEach(button => {
    button.addEventListener('click', function() {
      const searchId = this.getAttribute('data-search-id');
      editSearch(searchId);
    });
  });
  
  document.querySelectorAll('.run-search').forEach(button => {
    button.addEventListener('click', function() {
      const searchId = this.getAttribute('data-search-id');
      runScraper(searchId);
    });
  });
}

// Function to handle form submission for adding/editing a search
async function handleSearchFormSubmit(event) {
  event.preventDefault();
  
  const form = event.target;
  const searchId = form.getAttribute('data-search-id');
  const isEditing = !!searchId;
  
  const formData = new FormData(form);
  const searchData = {
    name: formData.get('search-name'),
    url: formData.get('search-url'),
    min_price: formData.get('min-price') || null,
    max_price: formData.get('max-price') || null
  };
  
  // Validate data
  if (!searchData.name || !searchData.url) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }
  
  if (!searchData.url.startsWith('https://www.kleinanzeigen.de/')) {
    showToast('Please enter a valid Kleinanzeigen URL.', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/${isEditing ? 'search-config' : 'search-config/add'}${isEditing ? '/' + searchId : ''}`, {
      method: isEditing ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(searchData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Hide the modal
    const searchModal = bootstrap.Modal.getInstance(document.getElementById('search-modal'));
    searchModal.hide();
    
    // Refresh searches
    const searches = await fetchSearches();
    displaySearches(searches);
    
    showToast(`Search configuration ${isEditing ? 'updated' : 'added'} successfully.`, 'success');
  } catch (error) {
    console.error('Error saving search:', error);
    showToast(`Failed to ${isEditing ? 'update' : 'add'} search configuration.`, 'error');
  }
}

// Function to delete a search configuration
async function deleteSearch(searchId) {
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/search-config/${searchId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Refresh searches
    const searches = await fetchSearches();
    displaySearches(searches);
    
    showToast('Search configuration deleted successfully.', 'success');
  } catch (error) {
    console.error('Error deleting search:', error);
    showToast('Failed to delete search configuration.', 'error');
  }
}

// Function to edit a search configuration
function editSearch(searchId) {
  const search = allSearches.find(search => search.id === searchId);
  if (!search) {
    showToast('Search configuration not found.', 'error');
    return;
  }
  
  showSearchModal(search);
}

// Function to show search modal
function showSearchModal(search = null) {
  const isEditing = !!search;
  
  // Create modal if it doesn't exist
  let modalEl = document.getElementById('search-modal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'search-modal';
    modalEl.className = 'modal fade';
    modalEl.setAttribute('tabindex', '-1');
    modalEl.setAttribute('aria-labelledby', 'searchModalLabel');
    modalEl.setAttribute('aria-hidden', 'true');
    
    modalEl.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="searchModalLabel">${isEditing ? 'Edit' : 'Add'} Search Configuration</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <form id="search-form" ${isEditing ? `data-search-id="${search.id}"` : ''}>
              <div class="mb-3">
                <label for="search-name" class="form-label">Name</label>
                <input type="text" class="form-control" id="search-name" name="search-name" required
                  value="${isEditing ? search.name : ''}">
              </div>
              <div class="mb-3">
                <label for="search-url" class="form-label">Search URL</label>
                <input type="url" class="form-control" id="search-url" name="search-url" required
                  value="${isEditing ? search.url : ''}">
                <div class="form-text">Enter a Kleinanzeigen search URL</div>
              </div>
              <div class="row">
                <div class="col-md-6">
                  <div class="mb-3">
                    <label for="min-price" class="form-label">Min Price (€)</label>
                    <input type="number" class="form-control" id="min-price" name="min-price"
                      value="${isEditing && search.min_price ? search.min_price : ''}">
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="mb-3">
                    <label for="max-price" class="form-label">Max Price (€)</label>
                    <input type="number" class="form-control" id="max-price" name="max-price"
                      value="${isEditing && search.max_price ? search.max_price : ''}">
                  </div>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" id="search-submit">Save</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modalEl);
    
    // Apply dark mode if active
    if (document.body.classList.contains('dark-mode')) {
      const modalContent = modalEl.querySelector('.modal-content');
      if (modalContent) {
        modalContent.classList.add('bg-dark', 'text-light');
        const closeBtn = modalEl.querySelector('.btn-close');
        if (closeBtn) closeBtn.classList.add('btn-close-white');
      }
    }
  } else {
    // Update existing modal for editing
    modalEl.querySelector('#searchModalLabel').textContent = `${isEditing ? 'Edit' : 'Add'} Search Configuration`;
    
    const form = modalEl.querySelector('#search-form');
    form.setAttribute('data-search-id', isEditing ? search.id : '');
    form.querySelector('#search-name').value = isEditing ? search.name : '';
    form.querySelector('#search-url').value = isEditing ? search.url : '';
    form.querySelector('#min-price').value = isEditing && search.min_price ? search.min_price : '';
    form.querySelector('#max-price').value = isEditing && search.max_price ? search.max_price : '';
  }
  
  // Add event listener for form submission
  document.getElementById('search-submit').addEventListener('click', function() {
    document.getElementById('search-form').dispatchEvent(new Event('submit'));
  });
  
  document.getElementById('search-form').addEventListener('submit', handleSearchFormSubmit);
  
  // Show the modal
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

// Function to run the scraper for a specific search
async function runScraper(searchId = null) {
  if (scrapeStatus.inProgress) {
    showToast('A scraper is already running. Please wait until it completes.', 'warning');
    return;
  }
  
  // Show confirmation dialog
  const confirmMessage = searchId
    ? 'Are you sure you want to run the scraper for this search?'
    : 'Are you sure you want to run the scraper for all searches?';
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  // Create or find the status container
  let statusContainer = document.getElementById('scrape-status-container');
  if (!statusContainer) {
    statusContainer = document.createElement('div');
    statusContainer.id = 'scrape-status-container';
    statusContainer.className = 'mt-4';
    
    // If we're on the searches tab, add it there
    const searchesContainer = document.getElementById('searches-container');
    if (searchesContainer) {
      searchesContainer.parentNode.insertBefore(statusContainer, searchesContainer.nextSibling);
    }
  }
  
  // Update status container
  statusContainer.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h5>Scraper Status</h5>
      </div>
      <div class="card-body">
        <div class="progress mb-3">
          <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" 
            style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
        <p id="scrape-status-message">Initializing scraper...</p>
      </div>
    </div>
  `;
  
  // Update status variables
  scrapeStatus.inProgress = true;
  scrapeStatus.progress = 0;
  updateScrapeStatusUI();
  
  // Start the polling for status
  const statusCheckInterval = setInterval(checkScrapeStatus, 2000);
  
  try {
    // Start the scraper
    const response = await fetch(`${window.config.API_BASE_URL}/scrape${searchId ? '/' + searchId : ''}`, {
      method: 'POST',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Show toast with initial status
    showToast(`Scraper started successfully. Scraping ${result.search_count} search(es).`, 'success');
    
  } catch (error) {
    console.error('Error starting scraper:', error);
    scrapeStatus.inProgress = false;
    clearInterval(statusCheckInterval);
    
    statusContainer.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h5>Scraper Error</h5>
        </div>
        <div class="card-body">
          <div class="alert alert-danger">
            Failed to start scraper. Error: ${error.message}
          </div>
        </div>
      </div>
    `;
    
    showToast('Failed to start scraper.', 'error');
  }
}

// Function to check scraper status
async function checkScrapeStatus() {
  if (!scrapeStatus.inProgress) return;
  
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/scrape/status`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const status = await response.json();
    
    // Update our status
    scrapeStatus.progress = status.progress;
    scrapeStatus.message = status.message;
    scrapeStatus.inProgress = status.in_progress;
    
    // Update UI
    updateScrapeStatusUI();
    
    // If completed, show final status
    if (!status.in_progress) {
      // Show completion toast
      showToast(`Scraper completed: ${status.listings_found} listings found.`, 'success');
      
      // If we're on the listings tab, refresh the listings
      if (document.getElementById('listings-container')) {
        // Assuming fetchListings is available globally
        if (typeof window.fetchListings === 'function') {
          window.fetchListings();
        }
      }
    }
  } catch (error) {
    console.error('Error checking scrape status:', error);
  }
}

// Function to update scrape status UI
function updateScrapeStatusUI() {
  const statusContainer = document.getElementById('scrape-status-container');
  if (!statusContainer) return;
  
  // Update progress bar
  const progressBar = statusContainer.querySelector('.progress-bar');
  if (progressBar) {
    progressBar.style.width = `${scrapeStatus.progress}%`;
    progressBar.setAttribute('aria-valuenow', scrapeStatus.progress);
  }
  
  // Update status message
  const statusMessage = document.getElementById('scrape-status-message');
  if (statusMessage) {
    statusMessage.textContent = scrapeStatus.message || 'Scraping in progress...';
  }
  
  // Update card header if scraper is complete
  if (!scrapeStatus.inProgress) {
    const cardHeader = statusContainer.querySelector('.card-header h5');
    if (cardHeader) {
      cardHeader.textContent = 'Scraper Completed';
    }
    
    // Remove the animation from the progress bar
    if (progressBar) {
      progressBar.classList.remove('progress-bar-animated');
    }
  }
}

// Function to set up searches UI and event listeners
function setupSearchesUI() {
  // Fetch and display searches
  fetchSearches().then(searches => {
    displaySearches(searches);
  });
  
  // Add event listener for the "Add Search" button
  const addSearchBtn = document.getElementById('add-search-btn');
  if (addSearchBtn) {
    addSearchBtn.addEventListener('click', () => showSearchModal());
  }
  
  // Add event listener for the "Run All Searches" button
  const runAllSearchesBtn = document.getElementById('run-all-searches-btn');
  if (runAllSearchesBtn) {
    runAllSearchesBtn.addEventListener('click', () => runScraper());
  }
  
  // Check scraper status on page load
  checkScrapeStatus();
}

// Function to initialize searches module
function initSearchesModule() {
  setupSearchesUI();
}

// Export functions for use in other modules
export {
  fetchSearches,
  runScraper,
  allSearches,
  initSearchesModule
}; 