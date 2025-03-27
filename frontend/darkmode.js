// Check for saved theme preference or use user's system preference
const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");

// Toggle dark mode
function toggleDarkMode(enabled) {
    if (enabled === undefined) {
        enabled = !document.body.classList.contains('dark-mode');
    }
    
    if (enabled) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'enabled');
        document.getElementById('darkModeToggle').innerHTML = '<i class="bi bi-sun-fill"></i>';
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('darkMode', 'disabled');
        document.getElementById('darkModeToggle').innerHTML = '<i class="bi bi-moon-fill"></i>';
    }
    
    // Apply dark mode to all components
    applyDarkModeToComponents();
}

// Apply dark mode to all components
function applyDarkModeToComponents() {
    applyDarkModeToHousekeeping();
    applyDarkModeToModals();
    applyDarkModeToPaginationControls();
    applyDarkModeToToasts();
}

function applyDarkModeToHousekeeping() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    
    // Apply dark mode to alerts
    document.querySelectorAll('.alert').forEach(alert => {
        if (isDarkMode) {
            if (alert.classList.contains('alert-success')) {
                alert.style.backgroundColor = '#1b5e20';
                alert.style.color = '#e0e0e0';
                alert.style.borderColor = '#2e7d32';
            } else if (alert.classList.contains('alert-danger')) {
                alert.style.backgroundColor = '#b71c1c';
                alert.style.color = '#e0e0e0';
                alert.style.borderColor = '#c62828';
            } else if (alert.classList.contains('alert-info')) {
                alert.style.backgroundColor = '#01579b';
                alert.style.color = '#e0e0e0';
                alert.style.borderColor = '#0277bd';
            } else if (alert.classList.contains('alert-warning')) {
                alert.style.backgroundColor = '#f57f17';
                alert.style.color = '#212121';
                alert.style.borderColor = '#f9a825';
            }
        } else {
            alert.style.backgroundColor = '';
            alert.style.color = '';
            alert.style.borderColor = '';
        }
    });
    
    // Apply dark mode to progress bars
    document.querySelectorAll('.progress-bar').forEach(progressBar => {
        if (isDarkMode) {
            progressBar.style.backgroundColor = '#90caf9';
        } else {
            progressBar.style.backgroundColor = '';
        }
    });
    
    // Apply dark mode to small text
    document.querySelectorAll('.text-muted').forEach(element => {
        if (isDarkMode) {
            element.style.color = '#a0a0a0';
        } else {
            element.style.color = '';
        }
    });
}

function applyDarkModeToModals() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    
    document.querySelectorAll('.modal-content').forEach(modal => {
        if (isDarkMode) {
            modal.style.backgroundColor = '#2d2d2d';
            modal.style.borderColor = '#444';
        } else {
            modal.style.backgroundColor = '';
            modal.style.borderColor = '';
        }
    });
    
    document.querySelectorAll('.modal-header, .modal-footer').forEach(element => {
        if (isDarkMode) {
            element.style.borderColor = '#444';
        } else {
            element.style.borderColor = '';
        }
    });
}

function applyDarkModeToPaginationControls() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    
    document.querySelectorAll('.pagination .page-link').forEach(pageLink => {
        if (isDarkMode) {
            pageLink.style.backgroundColor = '#2d2d2d';
            pageLink.style.borderColor = '#444';
            pageLink.style.color = '#e0e0e0';
        } else {
            pageLink.style.backgroundColor = '';
            pageLink.style.borderColor = '';
            pageLink.style.color = '';
        }
    });
    
    document.querySelectorAll('.pagination .page-item.active .page-link').forEach(pageLink => {
        if (isDarkMode) {
            pageLink.style.backgroundColor = '#90caf9';
            pageLink.style.borderColor = '#90caf9';
            pageLink.style.color = '#212121';
        } else {
            pageLink.style.backgroundColor = '';
            pageLink.style.borderColor = '';
            pageLink.style.color = '';
        }
    });
}

function applyDarkModeToToasts() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    
    document.querySelectorAll('.toast').forEach(toast => {
        if (isDarkMode) {
            toast.style.backgroundColor = '#2d2d2d';
            toast.style.borderColor = '#444';
            toast.style.color = '#e0e0e0';
        } else {
            toast.style.backgroundColor = '';
            toast.style.borderColor = '';
            toast.style.color = '';
        }
    });
    
    document.querySelectorAll('.toast-header').forEach(header => {
        if (isDarkMode) {
            header.style.backgroundColor = '#333';
            header.style.borderColor = '#444';
            header.style.color = '#e0e0e0';
        } else {
            header.style.backgroundColor = '';
            header.style.borderColor = '';
            header.style.color = '';
        }
    });
}

// Check for dark mode preference
window.addEventListener('DOMContentLoaded', () => {
    const darkMode = localStorage.getItem('darkMode');
    const prefersDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (darkMode === 'enabled' || (darkMode === null && prefersDarkMode)) {
        toggleDarkMode(true);
    }
    
    // Set up toggle button
    document.getElementById('darkModeToggle').addEventListener('click', () => {
        toggleDarkMode();
    });
    
    // Listen for system preference changes
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (localStorage.getItem('darkMode') === null) {
                toggleDarkMode(e.matches);
            }
        });
    }
});

// Make functions available globally
window.toggleDarkMode = toggleDarkMode;
window.applyDarkModeToHousekeeping = applyDarkModeToHousekeeping;
window.applyDarkModeToComponents = applyDarkModeToComponents; 