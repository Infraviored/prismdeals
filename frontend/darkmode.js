// Check for saved theme preference or use user's system preference
const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");

// Function to toggle dark mode with animation
function toggleDarkMode(isDark) {
  // Add a smooth transition effect
  document.documentElement.style.transition = 'background-color 0.5s ease';
  
  // Toggle the dark-mode class
  document.body.classList.toggle('dark-mode', isDark);
  
  // Save the preference
  localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
  
  // Update the checkbox state
  document.getElementById('checkbox').checked = isDark;
  
  // Update icon visibility with animation
  const lightIcon = document.querySelector('.theme-icon-light');
  const darkIcon = document.querySelector('.theme-icon-dark');
  
  if (lightIcon && darkIcon) {
    lightIcon.style.transition = 'opacity 0.3s ease';
    darkIcon.style.transition = 'opacity 0.3s ease';
    
    lightIcon.style.opacity = isDark ? '0.7' : '1';
    darkIcon.style.opacity = isDark ? '1' : '0.7';
  }
  
  // Ensure admin-only elements have proper styling in dark mode
  const adminOnlyElements = document.querySelectorAll('.admin-only');
  adminOnlyElements.forEach(element => {
    if (element.hasAttribute('disabled')) {
      element.style.transition = 'opacity 0.3s ease';
      element.style.opacity = isDark ? '0.5' : '0.6';
    }
  });
  
  // Enhance cards in dark mode
  const cards = document.querySelectorAll('.card');
  cards.forEach(card => {
    if (isDark) {
      card.classList.add('dark-card');
    } else {
      card.classList.remove('dark-card');
    }
  });
  
  // Enhance buttons in dark mode
  const buttons = document.querySelectorAll('.btn-outline-primary, .btn-outline-secondary, .btn-outline-danger, .btn-outline-warning, .btn-outline-info, .btn-outline-success');
  buttons.forEach(button => {
    button.classList.toggle('dark-button', isDark);
  });
  
  // Enhance form controls in dark mode
  const formControls = document.querySelectorAll('.form-control, .form-select');
  formControls.forEach(control => {
    control.classList.toggle('dark-form-control', isDark);
  });
  
  // Apply dark mode to housekeeping-specific elements
  applyDarkModeToHousekeeping();
}

// Function to apply dark mode to housekeeping status elements
function applyDarkModeToHousekeeping() {
  // Determine if dark mode is active
  const isDarkMode = document.body.classList.contains('dark-mode');

  // Find all alert elements in the housekeeping section
  document.querySelectorAll('[id^="listing-status-"]').forEach(statusElement => {
    if (!statusElement) return;
    
    statusElement.querySelectorAll('.alert').forEach(alertEl => {
      // For success alerts (available listings)
      if (alertEl.classList.contains('alert-success')) {
        if (isDarkMode) {
          alertEl.style.backgroundColor = '#1e4620';
          alertEl.style.color = '#ffffff';
          alertEl.style.borderColor = '#2a623b';
        } else {
          alertEl.style.backgroundColor = '';
          alertEl.style.color = '';
          alertEl.style.borderColor = '';
        }
      }
      
      // For danger alerts (deleted listings or errors)
      if (alertEl.classList.contains('alert-danger')) {
        if (isDarkMode) {
          alertEl.style.backgroundColor = '#471c24';
          alertEl.style.color = '#ffffff';
          alertEl.style.borderColor = '#572a30';
        } else {
          alertEl.style.backgroundColor = '';
          alertEl.style.color = '';
          alertEl.style.borderColor = '';
        }
      }
      
      // For info alerts
      if (alertEl.classList.contains('alert-info')) {
        if (isDarkMode) {
          alertEl.style.backgroundColor = '#0f3a4a';
          alertEl.style.color = '#ffffff';
          alertEl.style.borderColor = '#154352';
        } else {
          alertEl.style.backgroundColor = '';
          alertEl.style.color = '';
          alertEl.style.borderColor = '';
        }
      }
      
      // For warning alerts
      if (alertEl.classList.contains('alert-warning')) {
        if (isDarkMode) {
          alertEl.style.backgroundColor = '#4d3c19';
          alertEl.style.color = '#ffffff';
          alertEl.style.borderColor = '#554223';
        } else {
          alertEl.style.backgroundColor = '';
          alertEl.style.color = '';
          alertEl.style.borderColor = '';
        }
      }
    });
  });
}

// Check for saved user preference, if any
const currentTheme = localStorage.getItem('darkMode');
if (currentTheme === 'enabled') {
  toggleDarkMode(true);
} else if (currentTheme === 'disabled') {
  toggleDarkMode(false);
} else {
  // If no saved preference, use system preference
  toggleDarkMode(prefersDarkScheme.matches);
}

// Listen for toggle changes
document.getElementById('checkbox').addEventListener('change', function(e) {
  toggleDarkMode(e.target.checked);
});

// Listen for system preference changes
prefersDarkScheme.addEventListener('change', function(e) {
  if (!localStorage.getItem('darkMode')) {
    toggleDarkMode(e.matches);
  }
});

// Export the toggle function to be called from other scripts
window.toggleDarkMode = toggleDarkMode; 