// Main JavaScript for KleinanzeigenScraper Frontend
// This is now a thin wrapper that imports the modular code

// Import all modules through the index file
import * as Modules from './modules/index.js';

// Add a comment to explain the modular structure
/**
 * Modular Code Structure:
 * 
 * The application has been modularized into the following structure:
 * 
 * - app.js: Main application initialization and tab management
 * - utils.js: Common utility functions used across the application
 * - listings.js: Functionality for listing display, filtering, and sorting
 * - searches.js: Search configuration management and scraping
 * - housekeeping.js: Housekeeping settings and listing availability checks
 * - settings.js: User preferences and settings management
 * 
 * All modules are accessible through the modules/index.js file.
 * This main.js file serves as a simple entry point to the modular codebase.
 * 
 * Note: The auth.js and config.js files are still loaded traditionally (non-module)
 * to maintain compatibility with the existing authentication system.
 */

// Console log to indicate main.js has loaded and modules are available
console.log('KleinanzeigenScraper frontend modules loaded');

// Add a debug listener to auth state changes if auth module is loaded
if (window.auth && typeof window.auth.addAuthStateListener === 'function') {
  window.auth.addAuthStateListener((isAuthenticated, user, isPublicAccess) => {
    console.log('[Auth Debug] State changed:', { 
      isAuthenticated, 
      user: user ? { ...user, role: user.role } : null,
      isPublicAccess 
    });
  });
}

// Application is initialized via DOMContentLoaded event in app.js
// We don't need to manually initialize anything here