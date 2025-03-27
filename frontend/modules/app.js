// Main App Module - Initializes the application and manages tab navigation

// Import utility functions
import * as Utils from './utils.js';

// Import feature modules
import * as Listings from './listings.js';
import * as Searches from './searches.js';
import * as Housekeeping from './housekeeping.js';
import * as Settings from './settings.js';
import * as VendorContact from './vendor-contact.js';

// Global variables
let currentTab = 'listings'; // Default tab

// Function to initialize the application
function initApp() {
  // Check if auth.js is loaded
  if (!window.auth) {
    console.error('Auth module not loaded! Make sure auth.js is included before main.js');
    return;
  }
  
  // Make certain utilities available globally, but don't override existing functions
  if (!window.showToast) window.showToast = Utils.showToast;
  if (!window.showLoading) window.showLoading = Utils.showLoading;
  if (!window.formatDateTime) window.formatDateTime = Utils.formatDateTime;
  if (!window.formatDuration) window.formatDuration = Utils.formatDuration;
  
  // Make certain module functions available globally
  window.fetchListings = Listings.fetchListings;
  window.runScraper = Searches.runScraper;
  
  // Expose authentication-related UI functions globally
  window.updateAuthUI = updateAuthUI;
  window.showLoginPrompt = showLoginPrompt;
  window.handleLogout = handleLogout;
  window.authInitialized = authInitialized;
  
  // Set up auth state change listener
  window.auth.addAuthStateListener(handleAuthStateChange);
  
  // Initialize modules
  Settings.initSettingsModule(); // Load settings first
  Listings.initListingsModule();
  Searches.initSearchesModule();
  Housekeeping.initHousekeepingModule();
  VendorContact.initVendorContactModule();
  
  // Set up tab navigation
  setupTabNavigation();
  
  // Set up login/logout buttons
  setupAuthButtons();
}

// Function for auth module to call when it's done initializing
function authInitialized() {
  // If we're not authenticated and on a protected tab, show login notice
  if (!window.auth.isAuthenticated() && !window.auth.isPublicAccessEnabled()) {
    const protectedTabs = ['listings', 'searches', 'housekeeping', 'vendor-contact'];
    if (protectedTabs.includes(currentTab)) {
      showLoginNotice(currentTab + '-content');
    }
  }
  
  // Update protected UI elements based on authentication state
  updateProtectedFeatures(
    window.auth.isAuthenticated(), 
    window.auth.getCurrentUser(), 
    window.auth.isPublicAccessEnabled()
  );
}

// Function to handle auth state changes
function handleAuthStateChange(isAuthenticated, user, isPublicAccess) {
  // Update UI based on login status
  updateAuthUI(isAuthenticated, user);
  
  // Update protected UI elements
  updateProtectedFeatures(isAuthenticated, user, isPublicAccess);
  
  // Refresh the current tab content
  loadTabContent(currentTab);
  
  // If we're authenticated and on the listings tab, make sure to refresh the listings
  if (isAuthenticated && currentTab === 'listings') {
    Listings.fetchListings();
  }
}

// Function to update UI based on auth state
function updateAuthUI(isAuthenticated, user) {
  const loginButton = document.getElementById('login-button');
  const logoutButton = document.getElementById('logout-button');
  const authStatusContainer = document.getElementById('auth-status-container');
  
  if (isAuthenticated && user) {
    // Authenticated state
    if (loginButton) loginButton.classList.add('d-none');
    if (logoutButton) logoutButton.classList.remove('d-none');
    
    if (authStatusContainer) {
      const userInitial = user.username.charAt(0).toUpperCase();
      authStatusContainer.innerHTML = `
        <div class="auth-status">
          <div class="d-flex align-items-center">
            <div class="user-avatar">${userInitial}</div>
            <div class="ms-2">
              <div class="fw-semibold">${user.username} ${user.role === 'admin' ? '<span class="admin-badge">Admin</span>' : ''}</div>
              <div class="small text-muted">Logged in</div>
            </div>
          </div>
          <button class="btn btn-sm btn-outline-danger" id="logout-button-inline">
            <i class="bi bi-box-arrow-right"></i>
          </button>
        </div>
      `;
      
      document.getElementById('logout-button-inline').addEventListener('click', handleLogout);
    }
  } else {
    // Unauthenticated state
    if (loginButton) loginButton.classList.remove('d-none');
    if (logoutButton) logoutButton.classList.add('d-none');
    
    if (authStatusContainer) {
      authStatusContainer.innerHTML = `
        <div class="auth-status">
          <div class="d-flex align-items-center">
            <div class="user-avatar bg-secondary">
              <i class="bi bi-person"></i>
            </div>
            <div class="ms-2">
              <div class="fw-semibold">Guest User</div>
              <div class="small text-muted">Not logged in</div>
            </div>
          </div>
          <button class="btn btn-sm btn-primary" id="login-button-nav">
            <i class="bi bi-box-arrow-in-right"></i>
          </button>
        </div>
      `;
      
      document.getElementById('login-button-nav').addEventListener('click', showLoginPrompt);
    }
  }
}

// Function to update protected elements based on user permissions
function updateProtectedFeatures(isAuthenticated, user, isPublicAccessEnabled) {
  const canAccess = isPublicAccessEnabled || isAuthenticated;
  const canModify = user && user.role === 'admin';
  
  // Configure protective tabs
  const protectedTabs = ['configure-tab', 'vendor-contact-tab', 'housekeeping-tab'];
  protectedTabs.forEach(tabId => {
    const tab = document.getElementById(tabId);
    if (tab) {
      tab.classList.toggle('protected-tab', !canAccess);
      tab.onclick = !canAccess ? (e) => {
        e.preventDefault();
        showLoginPrompt();
        return false;
      } : null;
    }
  });
  
  // Handle admin-only elements
  document.querySelectorAll('.admin-only').forEach(element => {
    if (!canModify) {
      element.setAttribute('disabled', 'disabled');
      element.setAttribute('title', 'Admin privileges required');
      element.classList.add('cursor-not-allowed');
      
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) {
        element.setAttribute('readonly', 'readonly');
      }
    } else {
      element.removeAttribute('disabled');
      element.removeAttribute('title');
      element.classList.remove('cursor-not-allowed');
      
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) {
        element.removeAttribute('readonly');
      }
    }
  });
  
  // Update buttons in specific tabs
  ['configure-content', 'vendor-contact-content'].forEach(tabId => {
    const tab = document.getElementById(tabId);
    if (tab) {
      const buttons = tab.querySelectorAll('.btn-edit, .btn-delete, .btn-add, .btn-save, .btn-scrape, .btn-regenerate');
      buttons.forEach(button => {
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
      
      // Handle textarea elements in vendor-contact
      if (tabId === 'vendor-contact-content') {
        const textAreas = tab.querySelectorAll('textarea:not(.admin-only)');
        textAreas.forEach(textarea => {
          const shouldBeReadOnly = !canModify || textarea.id === 'prompt-template';
          if (shouldBeReadOnly) {
            textarea.setAttribute('readonly', 'readonly');
            textarea.classList.add('cursor-not-allowed');
          } else {
            textarea.removeAttribute('readonly');
            textarea.classList.remove('cursor-not-allowed');
          }
        });
      }
    }
  });
}

// Function to set up authentication buttons
function setupAuthButtons() {
  // Setup login button
  const loginButton = document.getElementById('login-button');
  if (loginButton && !loginButton.hasAttribute('data-event-attached')) {
    loginButton.setAttribute('data-event-attached', 'true');
    loginButton.addEventListener('click', showLoginPrompt);
  }
  
  // Setup logout button
  const logoutButton = document.getElementById('logout-button');
  if (logoutButton && !logoutButton.hasAttribute('data-event-attached')) {
    logoutButton.setAttribute('data-event-attached', 'true');
    logoutButton.addEventListener('click', handleLogout);
  }
}

// Login prompt display
function showLoginPrompt() {
  if (typeof bootstrap === 'undefined') {
    console.error('Bootstrap is not available');
    return;
  }

  const loginModalElement = document.getElementById('loginModal');
  if (!loginModalElement) {
    console.error('Login modal element not found');
    return;
  }

  try {
    const loginModal = new bootstrap.Modal(loginModalElement);
    
    // Clear errors and form
    const errorElement = document.getElementById('login-error');
    if (errorElement) {
      errorElement.classList.add('d-none');
      errorElement.textContent = '';
    }
    
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    
    // Set up login handler
    const handleLogin = async function() {
      const username = usernameInput ? usernameInput.value : '';
      const password = passwordInput ? passwordInput.value : '';
      
      if (!username || !password) {
        showLoginError('Please enter both username and password');
        return;
      }
      
      try {
        const result = await window.auth.login(username, password);
        if (result.success) {
          loginModal.hide();
          window.location.reload();
        } else {
          showLoginError(result.error || 'Login failed');
        }
      } catch (error) {
        console.error('Login error:', error);
        showLoginError('An error occurred during login');
      }
    };
    
    // Attach event handlers
    const setupButton = (id, handler) => {
      const button = document.getElementById(id);
      if (button) {
        if (!button.hasAttribute('data-event-attached')) {
          // If no event handler is attached yet, add it without cloning
          button.setAttribute('data-event-attached', 'true');
          button.addEventListener('click', handler);
        } else {
          // If already has event handler, clone and replace to ensure clean slate
          const newButton = button.cloneNode(true);
          newButton.setAttribute('data-event-attached', 'true');
          button.parentNode.replaceChild(newButton, button);
          document.getElementById(id).addEventListener('click', handler);
        }
      }
    };
    
    setupButton('login-button', handleLogin);
    
    // Handle login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      if (!loginForm.hasAttribute('data-event-attached')) {
        // If no event handler is attached yet, add it directly
        loginForm.setAttribute('data-event-attached', 'true');
        loginForm.addEventListener('submit', (e) => {
          e.preventDefault();
          handleLogin();
        });
      } else {
        // If already has event handler, clone and replace
        const newForm = loginForm.cloneNode(true);
        newForm.setAttribute('data-event-attached', 'true');
        loginForm.parentNode.replaceChild(newForm, loginForm);
        document.getElementById('login-form').addEventListener('submit', (e) => {
          e.preventDefault();
          handleLogin();
        });
      }
    }
    
    loginModal.show();
  } catch (error) {
    console.error('Failed to show login modal:', error);
  }
}

// Display login error
function showLoginError(message) {
  const errorElement = document.getElementById('login-error');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.remove('d-none');
  } else {
    console.error('Login error element not found:', message);
  }
}

// Logout handler
async function handleLogout() {
  try {
    const result = await window.auth.logout();
    if (result.success) {
      if (typeof window.showToast === 'function') {
        window.showToast('Successfully logged out', 'success');
      }
      setTimeout(() => window.location.reload(), 1000);
    } else {
      if (typeof window.showToast === 'function') {
        window.showToast('Failed to logout: ' + (result.error || 'Unknown error'), 'error');
      }
    }
  } catch (error) {
    console.error('Logout error:', error);
    if (typeof window.showToast === 'function') {
      window.showToast('Failed to logout', 'error');
    }
  }
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
      
      // Store current tab without the '-content' suffix for simpler checks
      currentTab = tabId.replace('-content', '');
      
      // Load tab-specific content
      loadTabContent(tabId);
    });
  });
  
  // Load the default tab content
  loadTabContent('listings-content');
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
  const tabName = tabId.replace('-content', '');
  
  // Protected tabs require authentication or public access
  const protectedTabs = ['listings', 'configure', 'vendor-contact'];
  
  // NOTE: housekeeping is protected but we handle it differently - showing disabled UI instead of login notice
  
  if (protectedTabs.includes(tabName) && !canAccess) {
    console.log(`Access denied to ${tabName} tab - showing login notice`);
    showLoginNotice(tabId);
    
    // Also update the listings count element if it exists for listings tab
    if (tabName === 'listings') {
      const listingsCount = document.getElementById('listings-count');
      if (listingsCount) {
        listingsCount.className = 'alert alert-warning';
        listingsCount.innerHTML = `<i class="bi bi-shield-lock me-2"></i> Login required to view listings`;
      }
      
      // Clear loading spinner if present
      const listingsContainer = document.getElementById('listings-container');
      if (listingsContainer) {
        listingsContainer.innerHTML = '';
      }
    }
    
    return;
  }
  
  // Load tab-specific content
  switch (tabId) {
    case 'listings-content':
      Listings.fetchListings();
      break;
    case 'configure-content':
      // Content is loaded in the module initialization
      break;
    case 'vendor-contact-content':
      // Only load vendor contact data if authenticated
      if (canAccess) {
        VendorContact.fetchPromptTemplate();
        VendorContact.fetchMessageTemplates();
      }
      break;
    case 'housekeeping-content':
      // Always refresh housekeeping configs when tab is selected
      // The module will handle showing disabled controls when not authenticated
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
  
  // Get the tab name without '-content' suffix
  const tabName = tabId.replace('-content', '');
  
  // Update status area if it exists for this tab (similar to listings-count)
  const statusElement = document.getElementById(`${tabName}-status`);
  if (statusElement) {
    statusElement.className = 'alert alert-warning'; 
    statusElement.innerHTML = `<i class="bi bi-shield-lock me-2"></i> Login required to view ${tabName}`;
  }
  
  // Clear the container first
  container.innerHTML = '';
  
  // Add a card-style login notice with proper styling
  const loginNoticeDiv = document.createElement('div');
  loginNoticeDiv.className = 'col-12';
  loginNoticeDiv.innerHTML = `
    <div class="card shadow-sm mb-4">
      <div class="card-body text-center py-5">
        <div class="mb-4">
          <i class="bi bi-shield-lock" style="font-size: 3rem; color: var(--bs-primary);"></i>
        </div>
        <h4 class="mb-3">Authentication Required</h4>
        <p class="mb-4">Please log in to view the ${tabName} content.</p>
        <button class="btn btn-primary px-4" id="${tabId}-login-btn">
          <i class="bi bi-box-arrow-in-right me-2"></i>Login
        </button>
      </div>
    </div>
  `;
  container.appendChild(loginNoticeDiv);
  
  document.getElementById(`${tabId}-login-btn`).addEventListener('click', () => {
    if (typeof window.showLoginPrompt === 'function') {
      window.showLoginPrompt();
    }
  });
}

// Function to check and update auth state
async function updateAuthState() {
  let isAuthenticated = false;
  
  // Check authentication using auth.js
  if (window.auth && typeof window.auth.checkAuthStatus === 'function') {
    isAuthenticated = await window.auth.checkAuthStatus();
  }
  
  // Update UI
  updateAuthUI(isAuthenticated, window.auth.getCurrentUser());
  
  return isAuthenticated;
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// Export main app functions
export {
  initApp,
  loadTabContent,
  updateAuthState,
  showLoginPrompt
}; 