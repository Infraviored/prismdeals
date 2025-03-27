// Authentication module for Kleinanzeigen Scraper

// Authentication state
let currentUser = null;
let isPublicAccessEnabled = false;

// Core auth module
const auth = {
  isAuthenticated() { return currentUser !== null; },
  getCurrentUser() { return currentUser; },
  isPublicAccessEnabled() { return isPublicAccessEnabled; },
  
  // Login function
  async login(username, password) {
    try {
      const response = await fetch(`${window.config.API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || 'Login failed' };
      }
      
      currentUser = await response.json();
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
      currentUser = data.authenticated ? data.user : null;
      
      await this.checkPublicAccess();
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_access: enabled }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || 'Failed to update settings' };
      }
      
      const settings = await response.json();
      isPublicAccessEnabled = settings.public_access === true;
      this.notifyAuthStateChanged();
      
      return { success: true };
    } catch (error) {
      console.error('Update public access error:', error);
      return { success: false, error: 'Network error' };
    }
  },
  
  // Auth state change management
  listeners: [],
  
  addAuthStateListener(callback) {
    this.listeners.push(callback);
    callback(this.isAuthenticated(), this.getCurrentUser(), this.isPublicAccessEnabled());
  },
  
  notifyAuthStateChanged() {
    for (const listener of this.listeners) {
      listener(this.isAuthenticated(), this.getCurrentUser(), this.isPublicAccessEnabled());
    }
  },
  
  // Helper functions for permission checks
  isAdmin() {
    return this.isAuthenticated() && this.getCurrentUser()?.role === 'admin';
  },
  
  canAccessProtectedFeatures() {
    return this.isPublicAccessEnabled() || this.isAuthenticated();
  },
  
  canModifyProtectedFeatures() {
    return this.isAdmin();
  }
};

// Make auth available globally
window.auth = auth;

// Check auth status when page loads
document.addEventListener('DOMContentLoaded', function() {
  auth.checkAuthStatus().then(() => {
    // Let the app know auth is initialized
    if (typeof window.authInitialized === 'function') {
      window.authInitialized();
    }
  });
});

// No ES module export - this file is loaded as a script 