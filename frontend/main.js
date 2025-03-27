// Main JavaScript for KleinanzeigenScraper Frontend
import * as Modules from './modules/index.js';

/**
 * Application Structure:
 * - app.js: Main application and tab management
 * - auth.js: Authentication (loaded via script tag)
 * - config.js: Configuration (loaded via script tag)
 * - utils.js, listings.js, searches.js, housekeeping.js, etc.
 */

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  // Initialize the application
  Modules.App.initApp();
});

