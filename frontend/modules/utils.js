// Utilities Module - Common utility functions used across the application

// No global API_BASE_URL declaration, use window.config.API_BASE_URL directly

// Function to show loading state in a container
function showLoading(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = `
    <div class="d-flex justify-content-center align-items-center w-100 py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <span class="ms-3">Loading...</span>
    </div>
  `;
}

// Toast notification system
const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
toastContainer.style.zIndex = '1050';
document.body.appendChild(toastContainer);

// Function to show toast notification
function showToast(message, type = 'info', duration = 3000) {
  const toastId = 'toast-' + Math.random().toString(36).substr(2, 9);
  
  // Determine the background class based on type
  let bgClass = 'bg-primary';
  switch (type) {
    case 'success':
      bgClass = 'bg-success';
      break;
    case 'error':
    case 'danger':
      bgClass = 'bg-danger';
      break;
    case 'warning':
      bgClass = 'bg-warning text-dark';
      break;
    case 'info':
    default:
      bgClass = 'bg-info text-dark';
      break;
  }
  
  // Create toast element
  const toastEl = document.createElement('div');
  toastEl.id = toastId;
  toastEl.className = `toast ${bgClass} text-white`;
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');
  
  toastEl.innerHTML = `
    <div class="toast-header ${bgClass} text-white">
      <strong class="me-auto">${type.charAt(0).toUpperCase() + type.slice(1)}</strong>
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
    <div class="toast-body">
      ${message}
    </div>
  `;
  
  // Apply dark mode if active
  if (document.body.classList.contains('dark-mode')) {
    toastEl.classList.add('dark-mode-toast');
  }
  
  toastContainer.appendChild(toastEl);
  
  // Initialize and show the toast
  const toast = new bootstrap.Toast(toastEl, {
    delay: duration,
    autohide: true
  });
  
  toast.show();
  
  // Remove the toast element after it's hidden
  toastEl.addEventListener('hidden.bs.toast', function () {
    toastEl.remove();
  });
  
  return toastId;
}

// Function to show login prompt - use the one from auth.js if available
function showLoginPrompt() {
  // Check if we're in a recursive call
  if (window._showLoginPromptRecursionGuard) {
    console.warn('Preventing recursive showLoginPrompt call');
    return;
  }
  
  // Set recursion guard
  window._showLoginPromptRecursionGuard = true;
  
  try {
    // If there's already a global showLoginPrompt function and it's not this function
    if (window.showLoginPrompt && window.showLoginPrompt !== showLoginPrompt) {
      window.showLoginPrompt();
      return;
    }
    
    const modalId = 'login-modal';
    let modalEl = document.getElementById(modalId);
    
    // Create modal if it doesn't exist
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = modalId;
      modalEl.className = 'modal fade';
      modalEl.tabIndex = '-1';
      modalEl.setAttribute('aria-labelledby', 'loginModalLabel');
      modalEl.setAttribute('aria-hidden', 'true');
      
      modalEl.innerHTML = `
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="loginModalLabel">Login Required</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <form id="login-form">
                <div class="mb-3">
                  <label for="username" class="form-label">Username</label>
                  <input type="text" class="form-control" id="username" required>
                </div>
                <div class="mb-3">
                  <label for="password" class="form-label">Password</label>
                  <input type="password" class="form-control" id="password" required>
                </div>
                <div id="login-error" class="alert alert-danger d-none"></div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="login-submit">Login</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modalEl);
      
      // Apply dark mode if active
      if (document.body.classList.contains('dark-mode')) {
        const modalContent = modalEl.querySelector('.modal-content');
        if (modalContent) {
          modalContent.classList.add('bg-dark', 'text-light');
          const closeBtn = modalEl.querySelector('.btn-close');
          if (closeBtn) closeBtn.classList.add('btn-close-white');
        }
      }
      
      // Add event listener for login submission
      document.getElementById('login-submit').addEventListener('click', async () => {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        if (!username || !password) {
          document.getElementById('login-error').textContent = 'Please enter username and password';
          document.getElementById('login-error').classList.remove('d-none');
          return;
        }
        
        // Use window.auth for login if available, otherwise use our own implementation
        if (window.auth && typeof window.auth.login === 'function') {
          try {
            const result = await window.auth.login(username, password);
            if (result.success) {
              // Close the modal
              bootstrap.Modal.getInstance(modalEl).hide();
              // Show success message
              showToast('Successfully logged in', 'success');
              // Refresh the current page
              window.location.reload();
            } else {
              document.getElementById('login-error').textContent = result.error || 'Login failed';
              document.getElementById('login-error').classList.remove('d-none');
            }
          } catch (error) {
            console.error('Login error:', error);
            document.getElementById('login-error').textContent = 'An error occurred during login';
            document.getElementById('login-error').classList.remove('d-none');
          }
        } else {
          try {
            const response = await fetch(`${window.config.API_BASE_URL}/auth/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              credentials: 'include',
              body: JSON.stringify({ username, password })
            });
            
            if (!response.ok) {
              throw new Error('Login failed');
            }
            
            // Close the modal
            bootstrap.Modal.getInstance(modalEl).hide();
            
            // Show success message
            showToast('Successfully logged in', 'success');
            
            // Refresh the current page or data
            window.location.reload();
          } catch (error) {
            console.error('Login error:', error);
            document.getElementById('login-error').textContent = 'Invalid username or password';
            document.getElementById('login-error').classList.remove('d-none');
          }
        }
      });
    }
    
    // Show the modal
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  } finally {
    // Clear recursion guard
    window._showLoginPromptRecursionGuard = false;
  }
}

// Function to format date and time
function formatDateTime(timestamp) {
  if (!timestamp) return 'N/A';
  
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

// Function to format a duration in seconds to a human-readable string
function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  
  if (seconds < 60) {
    return `${seconds.toFixed(1)} seconds`;
  } else if (seconds < 3600) {
    return `${(seconds / 60).toFixed(1)} minutes`;
  } else {
    return `${(seconds / 3600).toFixed(1)} hours`;
  }
}

// Function to check if user is logged in
async function checkLoggedIn() {
  // Use window.auth if available
  if (window.auth && typeof window.auth.isAuthenticated === 'function') {
    return window.auth.isAuthenticated();
  }
  
  try {
    const response = await fetch(`${window.config.API_BASE_URL}/auth/status`, {
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.authenticated === true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking login status:', error);
    return false;
  }
}

// Function to check if public access is enabled - use window.auth if available
async function isPublicAccessEnabled() {
  // Use window.auth if available
  if (window.auth && typeof window.auth.isPublicAccessEnabled === 'function') {
    return window.auth.isPublicAccessEnabled();
  }
  
  return false;
}

// Export utility functions
export {
  showLoading,
  showToast,
  showLoginPrompt,
  formatDateTime,
  formatDuration,
  checkLoggedIn,
  isPublicAccessEnabled
}; 