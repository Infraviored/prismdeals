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