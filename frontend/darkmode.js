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
  
  // Update the theme label text with animation
  const themeLabel = document.querySelector('.theme-label');
  if (themeLabel) {
    themeLabel.style.transition = 'opacity 0.3s ease';
    themeLabel.style.opacity = '0';
    
    setTimeout(() => {
      themeLabel.textContent = isDark ? 'Light Mode' : 'Dark Mode';
      themeLabel.style.opacity = '1';
    }, 300);
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
  applyDarkModeToHousekeeping(isDark);
}

// Function to apply dark mode to housekeeping elements
function applyDarkModeToHousekeeping(isDark) {
  // Enhance housekeeping status elements
  const statusElements = document.querySelectorAll('#housekeeping-status, #listing-check-result');
  statusElements.forEach(element => {
    if (isDark) {
      // If it's an alert-info, change background to be darker
      if (element.classList.contains('alert-info')) {
        element.style.backgroundColor = '#1a3c4d';
        element.style.borderColor = '#164458';
        element.style.color = '#8ebfd3';
      }
      
      // If it's an alert-success, change background to be darker
      if (element.classList.contains('alert-success')) {
        element.style.backgroundColor = '#1e3a1e';
        element.style.borderColor = '#194219';
        element.style.color = '#8bdb8b';
      }
      
      // If it's an alert-danger, change background to be darker
      if (element.classList.contains('alert-danger')) {
        element.style.backgroundColor = '#3e1f21';
        element.style.borderColor = '#472427';
        element.style.color = '#e6a5a7';
      }
    } else {
      // Reset styles
      element.style.backgroundColor = '';
      element.style.borderColor = '';
      element.style.color = '';
    }
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