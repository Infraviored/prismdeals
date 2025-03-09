// Check for saved theme preference or use user's system preference
const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");

// Function to toggle dark mode
function toggleDarkMode(isDark) {
  document.body.classList.toggle('dark-mode', isDark);
  localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
  document.getElementById('checkbox').checked = isDark;
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