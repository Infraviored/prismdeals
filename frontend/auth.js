// Authentication module for Kleinanzeigen Scraper

// Authentication state
let currentUser = null;
let isPublicAccessEnabled = false;

// Initialize the auth module
const auth = {
  // Check if user is authenticated
  isAuthenticated() {
    return currentUser !== null;
  },
  
  // Get current user
  getCurrentUser() {
    return currentUser;
  },
  
  // Check if public access is enabled
  isPublicAccessEnabled() {
    return isPublicAccessEnabled;
  },
  
  // Login function
  async login(username, password) {
    try {
      const response = await fetch(`${window.config.API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || 'Login failed' };
      }
      
      currentUser = await response.json();
      
      // Notify listeners
      this.notifyAuthStateChanged();
      
      return { success: true, user: currentUser };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error' };
    }
  },
  
  // Logout function
  async logout() {
    try {
      await fetch(`${window.config.API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      
      currentUser = null;
      
      // Notify listeners
      this.notifyAuthStateChanged();
      
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, error: 'Network error' };
    }
  },
  
  // Check authentication status
  async checkAuthStatus() {
    try {
      const response = await fetch(`${window.config.API_BASE_URL}/auth/status`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        currentUser = null;
        return false;
      }
      
      const data = await response.json();
      
      if (data.authenticated) {
        currentUser = data.user;
      } else {
        currentUser = null;
      }
      
      // Also check if public access is enabled
      await this.checkPublicAccess();
      
      // Notify listeners
      this.notifyAuthStateChanged();
      
      return data.authenticated;
    } catch (error) {
      console.error('Auth status check error:', error);
      currentUser = null;
      return false;
    }
  },
  
  // Check if public access is enabled
  async checkPublicAccess() {
    try {
      const response = await fetch(`${window.config.API_BASE_URL}/auth/settings`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const settings = await response.json();
        isPublicAccessEnabled = settings.public_access === true;
      } else {
        isPublicAccessEnabled = false;
      }
    } catch (error) {
      console.error('Public access check error:', error);
      isPublicAccessEnabled = false;
    }
  },
  
  // Update public access setting
  async updatePublicAccess(enabled) {
    try {
      const response = await fetch(`${window.config.API_BASE_URL}/auth/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ public_access: enabled }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || 'Failed to update settings' };
      }
      
      const settings = await response.json();
      isPublicAccessEnabled = settings.public_access === true;
      
      // Notify listeners
      this.notifyAuthStateChanged();
      
      return { success: true };
    } catch (error) {
      console.error('Update public access error:', error);
      return { success: false, error: 'Network error' };
    }
  },
  
  // Auth state change listeners
  listeners: [],
  
  // Add auth state change listener
  addAuthStateListener(callback) {
    this.listeners.push(callback);
    
    // Call immediately with current state
    callback(this.isAuthenticated(), this.getCurrentUser(), this.isPublicAccessEnabled());
  },
  
  // Notify all listeners of auth state change
  notifyAuthStateChanged() {
    for (const listener of this.listeners) {
      listener(this.isAuthenticated(), this.getCurrentUser(), this.isPublicAccessEnabled());
    }
  }
};

// Make auth available globally
window.auth = auth;

// Check auth status when page loads
document.addEventListener('DOMContentLoaded', function() {
  auth.checkAuthStatus();
});

// Function to check if user has admin role
function isAdmin() {
    return auth.isAuthenticated() && auth.getCurrentUser() && auth.getCurrentUser().role === 'admin';
}

// Function to check if user can access protected features
function canAccessProtectedFeatures() {
    return auth.isPublicAccessEnabled() || auth.isAuthenticated();
}

// Function to check if user can modify protected features
function canModifyProtectedFeatures() {
    return isAdmin();
}

// Function to update protected features based on authentication state
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
  
  // Handle admin-only elements
  const adminOnlyElements = document.querySelectorAll('.admin-only');
  adminOnlyElements.forEach(element => {
    if (!canModify) {
      element.setAttribute('disabled', 'disabled');
      element.setAttribute('title', 'Admin privileges required');
      element.classList.add('cursor-not-allowed');
      
      // For input elements
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
        element.setAttribute('readonly', 'readonly');
      }
    } else {
      element.removeAttribute('disabled');
      element.removeAttribute('title');
      element.classList.remove('cursor-not-allowed');
      
      // For input elements
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
        element.removeAttribute('readonly');
      }
    }
  });
  
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
    
    // Disable text areas that are not already handled by admin-only class
    const textAreas = vendorContactContent.querySelectorAll('textarea:not(.admin-only)');
    textAreas.forEach(textarea => {
      if (!canModify && !textarea.hasAttribute('readonly')) {
        textarea.setAttribute('readonly', 'readonly');
        textarea.classList.add('cursor-not-allowed');
      } else if (canModify && textarea.id !== 'prompt-template') {
        textarea.removeAttribute('readonly');
        textarea.classList.remove('cursor-not-allowed');
      }
    });
  }
}

// Function to show login prompt
function showLoginPrompt() {
  const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
  
  // Set up form submission
  const handleLogin = async function() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
      showLoginError('Please enter both username and password');
      return;
    }
    
    try {
      // Use the auth module for login
      const result = await auth.login(username, password);
      
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
  
  // Clear previous errors
  document.getElementById('login-error').classList.add('d-none');
  
  // Reset form
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  
  // Use the modal login button for submission
  const modalLoginButton = document.getElementById('login-button');
  if (modalLoginButton) {
    // Remove existing listeners
    modalLoginButton.replaceWith(modalLoginButton.cloneNode(true));
    
    // Add new listener
    document.getElementById('login-button').addEventListener('click', handleLogin);
  }
  
  // Handle form submission
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    // Remove existing listeners
    loginForm.replaceWith(loginForm.cloneNode(true));
    
    // Add new listener
    document.getElementById('login-form').addEventListener('submit', function(event) {
      event.preventDefault();
      handleLogin();
    });
  }
  
  // Show the modal
  loginModal.show();
}

// Function to show login error
function showLoginError(message) {
  const errorElement = document.getElementById('login-error');
  errorElement.textContent = message;
  errorElement.classList.remove('d-none');
}

// Make the function globally available
window.showLoginPrompt = showLoginPrompt; 