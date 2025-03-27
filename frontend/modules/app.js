// Main App Module - Initializes the application and manages tab navigation

// Import utility functions
import * as Utils from './utils.js';

// Import feature modules
import * as Listings from './listings.js';
import * as Searches from './searches.js';
import * as Housekeeping from './housekeeping.js';
import * as Settings from './settings.js';

// Global variables
let currentTab = 'listings'; // Default tab

// Function to initialize the application
function initApp() {
  // Check if auth.js is loaded
  if (!window.auth) {
    console.error('Auth module not loaded! Make sure auth.js is included before main.js');
  }
  
  // Make certain utilities available globally, but don't override existing functions
  if (!window.showToast) window.showToast = Utils.showToast;
  if (!window.showLoading) window.showLoading = Utils.showLoading;
  if (!window.showLoginPrompt) window.showLoginPrompt = Utils.showLoginPrompt;
  if (!window.formatDateTime) window.formatDateTime = Utils.formatDateTime;
  if (!window.formatDuration) window.formatDuration = Utils.formatDuration;
  
  // Make certain module functions available globally
  window.fetchListings = Listings.fetchListings;
  window.runScraper = Searches.runScraper;
  
  // Set up auth state change listener
  if (window.auth && typeof window.auth.addAuthStateListener === 'function') {
    window.auth.addAuthStateListener(handleAuthStateChange);
  }
  
  // Initialize modules
  Settings.initSettingsModule(); // Load settings first
  Listings.initListingsModule();
  Searches.initSearchesModule();
  Housekeeping.initHousekeepingModule();
  
  // Set up tab navigation
  setupTabNavigation();
  
  // Set up login/logout buttons
  setupAuthButtons();
}

// Function to handle auth state changes
function handleAuthStateChange(isAuthenticated, user, isPublicAccess) {
  // Update UI based on login status
  updateAuthUI(isAuthenticated);
  
  // Refresh current tab content if needed
  loadTabContent(currentTab);
}

// Function to update UI based on auth state
function updateAuthUI(isAuthenticated) {
  const loginButtonNav = document.getElementById('login-button-nav');
  const loginButton = document.getElementById('login-button');
  const logoutButton = document.getElementById('logout-button');
  
  if (isAuthenticated) {
    if (loginButtonNav) loginButtonNav.classList.add('d-none');
    if (loginButton) loginButton.classList.add('d-none');
    if (logoutButton) logoutButton.classList.remove('d-none');
    
    // Show username if available
    if (window.auth && typeof window.auth.getCurrentUser === 'function') {
      const user = window.auth.getCurrentUser();
      const authStatusContainer = document.getElementById('auth-status-container');
      if (authStatusContainer && user) {
        authStatusContainer.innerHTML = `
          <div class="text-success mb-2">
            <strong>Logged in as:</strong> ${user.username} 
            ${user.role === 'admin' ? '<span class="badge bg-danger">Admin</span>' : ''}
          </div>
        `;
      }
    }
  } else {
    if (loginButtonNav) loginButtonNav.classList.remove('d-none');
    if (loginButton) loginButton.classList.remove('d-none');
    if (logoutButton) logoutButton.classList.add('d-none');
    
    // Clear user info
    const authStatusContainer = document.getElementById('auth-status-container');
    if (authStatusContainer) {
      authStatusContainer.innerHTML = '';
    }
    
    // Show login notice for protected tabs
    const protectedTabs = ['listings', 'searches', 'housekeeping'];
    if (protectedTabs.includes(currentTab)) {
      showLoginNotice(currentTab);
    }
  }
}

// Function to set up authentication buttons
function setupAuthButtons() {
  // Setup login buttons
  const loginButtonNav = document.getElementById('login-button-nav');
  if (loginButtonNav) {
    loginButtonNav.addEventListener('click', () => {
      if (typeof window.showLoginPrompt === 'function') {
        window.showLoginPrompt();
      } else if (typeof Utils.showLoginPrompt === 'function') {
        Utils.showLoginPrompt();
      }
    });
  }
  
  // Setup modal login button (if it exists)
  const loginButton = document.getElementById('login-button');
  if (loginButton) {
    loginButton.addEventListener('click', () => {
      if (typeof window.showLoginPrompt === 'function') {
        window.showLoginPrompt();
      } else if (typeof Utils.showLoginPrompt === 'function') {
        Utils.showLoginPrompt();
      }
    });
  }
  
  // Setup logout button
  const logoutButton = document.getElementById('logout-button');
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }
  
  // Initial UI update based on current auth state
  updateAuthState();
}

// Function to check and update auth state
async function updateAuthState() {
  let isAuthenticated = false;
  
  // Check authentication using auth.js if available
  if (window.auth && typeof window.auth.isAuthenticated === 'function') {
    isAuthenticated = window.auth.isAuthenticated();
    // If auth says not authenticated, try to check status (in case session exists but auth state is stale)
    if (!isAuthenticated && typeof window.auth.checkAuthStatus === 'function') {
      isAuthenticated = await window.auth.checkAuthStatus();
    }
  } else {
    // Fallback to our own check
    isAuthenticated = await Utils.checkLoggedIn();
  }
  
  // Update UI
  updateAuthUI(isAuthenticated);
}

// Function to set up tab navigation
function setupTabNavigation() {
  // Get all tab buttons
  const tabButtons = document.querySelectorAll('[data-bs-toggle="tab"]');
  
  // Add event listeners to tab buttons
  tabButtons.forEach(button => {
    button.addEventListener('shown.bs.tab', event => {
      // Get the target tab ID - check both href and data-bs-target attributes
      let tabId;
      const href = event.target.getAttribute('href');
      const target = event.target.getAttribute('data-bs-target');
      
      if (href) {
        tabId = href.substring(1);
      } else if (target) {
        tabId = target.substring(1);
      } else {
        console.error('Tab button has neither href nor data-bs-target attribute:', event.target);
        return;
      }
      
      currentTab = tabId;
      
      // Load tab-specific content
      loadTabContent(tabId);
    });
  });
  
  // Load the default tab content
  loadTabContent(currentTab);
}

// Function to load tab-specific content
function loadTabContent(tabId) {
  // Check authentication first
  let isAuthenticated = false;
  let isPublicAccess = false;
  
  if (window.auth) {
    isAuthenticated = window.auth.isAuthenticated();
    isPublicAccess = window.auth.isPublicAccessEnabled();
  } else {
    // Fallback, but this is asynchronous so not ideal
    Utils.checkLoggedIn().then(authenticated => {
      isAuthenticated = authenticated;
      Utils.isPublicAccessEnabled().then(publicAccess => {
        isPublicAccess = publicAccess;
        loadTabContentWithAuth(tabId, isAuthenticated, isPublicAccess);
      });
    });
    return;
  }
  
  loadTabContentWithAuth(tabId, isAuthenticated, isPublicAccess);
}

// Function to load tab content based on authentication state
function loadTabContentWithAuth(tabId, isAuthenticated, isPublicAccess) {
  const canAccess = isAuthenticated || isPublicAccess;
  
  // Protected tabs require authentication or public access
  const protectedTabs = ['listings', 'searches', 'housekeeping'];
  if (protectedTabs.includes(tabId) && !canAccess) {
    showLoginNotice(tabId);
    return;
  }
  
  // Load tab-specific content
  switch (tabId) {
    case 'listings':
      Listings.fetchListings();
      break;
    case 'searches':
      // Content is loaded in the module initialization
      break;
    case 'housekeeping':
      // Refresh housekeeping configs when tab is selected
      if (document.getElementById('housekeeping-config-container')) {
        Housekeeping.fetchHousekeepingConfig();
      }
      break;
    default:
      console.log(`Tab ${tabId} has no special loading logic`);
  }
}

// Function to show login notice
function showLoginNotice(tabId) {
  const container = document.getElementById(`${tabId}-container`);
  if (!container) return;
  
  container.innerHTML = `
    <div class="alert alert-warning">
      <h4 class="alert-heading">Login Required</h4>
      <p>You need to be logged in to view this content.</p>
      <button class="btn btn-primary" id="${tabId}-login-btn">Login</button>
    </div>
  `;
  
  document.getElementById(`${tabId}-login-btn`).addEventListener('click', () => {
    if (typeof window.showLoginPrompt === 'function') {
      window.showLoginPrompt();
    } else if (typeof Utils.showLoginPrompt === 'function') {
      Utils.showLoginPrompt();
    }
  });
}

// Function to handle logout
async function handleLogout() {
  if (window.auth && typeof window.auth.logout === 'function') {
    // Use auth.js logout
    try {
      const result = await window.auth.logout();
      if (result.success) {
        Utils.showToast('Successfully logged out', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        Utils.showToast('Failed to logout: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('Logout error:', error);
      Utils.showToast('Failed to logout', 'error');
    }
  } else {
    // Fallback to our own implementation
    try {
      const response = await fetch(`${window.config.API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Logout failed');
      }
      
      // Show success message
      Utils.showToast('Successfully logged out', 'success');
      
      // Refresh the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Logout error:', error);
      Utils.showToast('Failed to logout', 'error');
    }
  }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// Export main app functions
export {
  initApp,
  loadTabContent,
  updateAuthState
}; 