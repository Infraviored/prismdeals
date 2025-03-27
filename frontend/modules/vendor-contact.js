// Vendor Contact Module - Handles vendor contact functionality

// DOM Elements
let promptTemplateTextarea;
let additionalQuestionInput;
let maxTokensInput;
let savePromptBtn;
let resetPromptBtn;
let regenerateMessagesBtn;
let filterMissingInfoSelect;
let messageTemplatesContainer;

// Initialize the vendor contact module
function initVendorContactModule() {
  // Find DOM elements
  promptTemplateTextarea = document.getElementById('prompt-template');
  additionalQuestionInput = document.getElementById('additional-question');
  maxTokensInput = document.getElementById('max-tokens');
  savePromptBtn = document.getElementById('save-prompt');
  resetPromptBtn = document.getElementById('reset-prompt');
  regenerateMessagesBtn = document.getElementById('regenerate-messages');
  filterMissingInfoSelect = document.getElementById('filter-missing-info');
  messageTemplatesContainer = document.getElementById('message-templates-container');
  
  // Set up event listeners
  if (savePromptBtn) {
    savePromptBtn.addEventListener('click', savePromptTemplateHandler);
  }
  
  if (resetPromptBtn) {
    resetPromptBtn.addEventListener('click', resetPromptTemplate);
  }
  
  if (regenerateMessagesBtn) {
    regenerateMessagesBtn.addEventListener('click', regenerateMessages);
  }
  
  if (filterMissingInfoSelect) {
    filterMissingInfoSelect.addEventListener('change', filterMessageTemplates);
  }
  
  // Add event listener for tab activation to refresh data
  const vendorContactTab = document.getElementById('vendor-contact-tab');
  if (vendorContactTab) {
    vendorContactTab.addEventListener('shown.bs.tab', () => {
      // Only fetch data if user is authenticated or public access is enabled
      if (window.auth && (window.auth.isAuthenticated() || window.auth.isPublicAccessEnabled())) {
        fetchPromptTemplate();
        fetchMessageTemplates();
      }
    });
  }
  
  // Initial data fetch - only if we're on the vendor contact tab AND authenticated
  const vendorContactContent = document.getElementById('vendor-contact-content');
  const isVendorContactVisible = vendorContactContent && !vendorContactContent.classList.contains('d-none');
  
  // Only fetch if authenticated or public access is enabled
  if (isVendorContactVisible && window.auth && (window.auth.isAuthenticated() || window.auth.isPublicAccessEnabled())) {
    fetchPromptTemplate();
    fetchMessageTemplates();
  }
}

// Add credentials to all fetch requests
function fetchWithAuth(url, options = {}) {
  return fetch(url, {
    ...options,
    credentials: 'include'
  });
}

// Function to fetch the prompt template
async function fetchPromptTemplate() {
  try {
    // Check auth status first to avoid unnecessary API calls
    if (window.auth && !window.auth.isAuthenticated() && !window.auth.isPublicAccessEnabled()) {
      // Not authenticated and no public access - don't even try to fetch
      return;
    }
    
    const response = await fetchWithAuth(`${window.config.API_BASE_URL}/prompt`);
    
    if (response.status === 401 || response.status === 403) {
      // Unauthorized - handle silently for initial page load
      return;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (promptTemplateTextarea) {
      promptTemplateTextarea.value = data.prompt_template || '';
    }
    
    if (additionalQuestionInput) {
      additionalQuestionInput.value = data.additional_question || '';
    }
    
    if (maxTokensInput) {
      maxTokensInput.value = data.max_tokens || 300;
    }
  } catch (error) {
    console.error('Error fetching prompt template:', error);
    // Only show error toast if we're on the vendor contact tab (user explicitly navigated there)
    const vendorContactContent = document.getElementById('vendor-contact-content');
    const isVendorContactVisible = vendorContactContent && 
                                  window.getComputedStyle(vendorContactContent).display !== 'none';
    
    if (isVendorContactVisible && typeof window.showToast === 'function') {
      window.showToast('Failed to load prompt template. Please try again later.', 'danger');
    }
  }
}

// Function to save prompt template handler
async function savePromptTemplateHandler() {
  const template = promptTemplateTextarea.value.trim();
  const additionalQuestion = additionalQuestionInput.value.trim();
  const maxTokens = parseInt(maxTokensInput.value, 10);
  
  if (!template) {
    if (typeof window.showToast === 'function') {
      window.showToast('Prompt template cannot be empty.', 'warning');
    }
    return;
  }
  
  const success = await savePromptTemplate({
    prompt_template: template,
    additional_question: additionalQuestion,
    max_tokens: maxTokens
  });
  
  if (success) {
    if (typeof window.showToast === 'function') {
      window.showToast('Prompt template saved successfully.', 'success');
    }
  } else {
    if (typeof window.showToast === 'function') {
      window.showToast('Failed to save prompt template.', 'danger');
    }
  }
}

// Function to save prompt template
async function savePromptTemplate(templateData) {
  try {
    const response = await fetchWithAuth(`${window.config.API_BASE_URL}/prompt`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(templateData)
    });
    
    if (response.status === 401 || response.status === 403) {
      // Unauthorized or forbidden
      if (typeof window.showToast === 'function') {
        window.showToast('You do not have permission to save the prompt template.', 'danger');
      }
      return false;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result.status === 'success';
  } catch (error) {
    console.error('Error saving prompt template:', error);
    return false;
  }
}

// Function to reset prompt template
async function resetPromptTemplate() {
  try {
    const response = await fetchWithAuth(`${window.config.API_BASE_URL}/prompt/reset`, {
      method: 'POST'
    });
    
    if (response.status === 401 || response.status === 403) {
      // Unauthorized or forbidden
      if (typeof window.showToast === 'function') {
        window.showToast('You do not have permission to reset the prompt template.', 'danger');
      }
      return;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'success') {
      promptTemplateTextarea.value = data.prompt_template || '';
      additionalQuestionInput.value = data.additional_question || '';
      maxTokensInput.value = data.max_tokens || 300;
      
      if (typeof window.showToast === 'function') {
        window.showToast('Prompt template reset to default.', 'success');
      }
    } else {
      if (typeof window.showToast === 'function') {
        window.showToast('Failed to reset prompt template.', 'danger');
      }
    }
  } catch (error) {
    console.error('Error resetting prompt template:', error);
    if (typeof window.showToast === 'function') {
      window.showToast('Failed to reset prompt template.', 'danger');
    }
  }
}

// Function to regenerate all messages
async function regenerateMessages() {
  try {
    // Disable the button to prevent multiple clicks
    if (regenerateMessagesBtn) {
      regenerateMessagesBtn.disabled = true;
      regenerateMessagesBtn.textContent = 'Processing...';
    }
    
    const response = await fetchWithAuth(`${window.config.API_BASE_URL}/messages/regenerate`, {
      method: 'POST'
    });
    
    if (response.status === 401 || response.status === 403) {
      // Unauthorized or forbidden
      if (typeof window.showToast === 'function') {
        window.showToast('You do not have permission to regenerate messages.', 'danger');
      }
      return;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.status === 'success') {
      if (typeof window.showToast === 'function') {
        window.showToast('Messages regenerated successfully!', 'success');
      }
      // Refresh the message templates
      fetchMessageTemplates();
    } else {
      if (typeof window.showToast === 'function') {
        window.showToast('Failed to regenerate messages.', 'danger');
      }
    }
  } catch (error) {
    console.error('Error regenerating messages:', error);
    if (typeof window.showToast === 'function') {
      window.showToast('Failed to regenerate messages: ' + error.message, 'danger');
    }
  } finally {
    // Re-enable the button
    if (regenerateMessagesBtn) {
      regenerateMessagesBtn.disabled = false;
      regenerateMessagesBtn.textContent = 'Regenerate Messages';
    }
  }
}

// Function to fetch message templates
async function fetchMessageTemplates() {
  try {
    // Check auth status first to avoid unnecessary API calls
    if (window.auth && !window.auth.isAuthenticated() && !window.auth.isPublicAccessEnabled()) {
      // Not authenticated and no public access - don't even try to fetch
      return;
    }
    
    if (!messageTemplatesContainer) return;
    
    // Show loading indicator
    messageTemplatesContainer.innerHTML = `
      <div class="text-center">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p>Loading message templates...</p>
      </div>
    `;
    
    const response = await fetchWithAuth(`${window.config.API_BASE_URL}/messages`);
    
    if (response.status === 401 || response.status === 403) {
      // Unauthorized - handle silently for initial page load
      const vendorContactContent = document.getElementById('vendor-contact-content');
      const isVendorContactVisible = vendorContactContent && 
                                    window.getComputedStyle(vendorContactContent).display !== 'none';
      
      if (isVendorContactVisible) {
        // Only show login button if the tab is actually visible/active
        const statusElement = document.getElementById('vendor-contact-status');
        if (statusElement) {
          statusElement.className = 'alert alert-warning';
          statusElement.innerHTML = '<i class="bi bi-shield-lock me-2"></i> Login required to view vendor contact templates';
        }
        
        messageTemplatesContainer.innerHTML = `
          <div class="card shadow-sm mb-4">
            <div class="card-body text-center py-5">
              <div class="mb-4">
                <i class="bi bi-shield-lock" style="font-size: 3rem; color: var(--bs-primary);"></i>
              </div>
              <h4 class="mb-3">Authentication Required</h4>
              <p class="mb-4">Please log in to view the vendor contact templates.</p>
              <button class="btn btn-primary px-4" id="vendor-login-btn">
                <i class="bi bi-box-arrow-in-right me-2"></i>Login
              </button>
            </div>
          </div>
        `;
        
        document.getElementById('vendor-login-btn').addEventListener('click', () => {
          if (typeof window.showLoginPrompt === 'function') {
            window.showLoginPrompt();
          }
        });
      } else {
        // Just clear the container if tab isn't visible
        messageTemplatesContainer.innerHTML = '';
      }
      return;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const messagesObj = await response.json();
    displayMessageTemplates(messagesObj);
  } catch (error) {
    console.error('Error fetching message templates:', error);
    
    messageTemplatesContainer.innerHTML = `
      <div class="alert alert-danger">
        Failed to load message templates. Please try again later.
        <p><small>${error.message}</small></p>
      </div>
    `;
  }
}

// Function to display message templates
function displayMessageTemplates(messagesObj) {
  if (!messageTemplatesContainer || !messagesObj) {
    messageTemplatesContainer.innerHTML = '<div class="alert alert-danger">No message data available</div>';
    return;
  }
  
  // Get the filter value
  const filterValue = filterMissingInfoSelect ? filterMissingInfoSelect.value : '';
  
  // Convert messages object to array for easier processing
  const messagesArray = Object.entries(messagesObj).map(([key, data]) => {
    return { key, ...data };
  });
  
  // Filter messages based on selected filter
  let filteredMessages = messagesArray;
  if (filterValue) {
    filteredMessages = messagesArray.filter(msg => {
      if (filterValue === 'RAM_more') return msg.missing_info?.includes('RAM_more');
      if (filterValue === 'screen_small') return msg.missing_info?.includes('screen_small');
      if (filterValue === 'screen_highres') return msg.missing_info?.includes('screen_highres');
      if (filterValue === 'multiple') return msg.missing_info?.length > 1;
      return true;
    });
  }
  
  // If no messages match the filter
  if (filteredMessages.length === 0) {
    messageTemplatesContainer.innerHTML = `
      <div class="alert alert-info">
        No message templates match the selected filter.
      </div>
    `;
    return;
  }
  
  // Build HTML for the templates
  const templatesHTML = filteredMessages.map(msg => {
    // Create badges for missing info
    const missingInfo = [];
    if (msg.missing_info?.includes('RAM_more')) {
      missingInfo.push('<span class="badge bg-warning">RAM Size</span>');
    }
    if (msg.missing_info?.includes('screen_small')) {
      missingInfo.push('<span class="badge bg-warning">Screen Size</span>');
    }
    if (msg.missing_info?.includes('screen_highres')) {
      missingInfo.push('<span class="badge bg-warning">Screen Resolution</span>');
    }
    
    return `
      <div class="card mb-3 message-template" data-key="${msg.key}">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h5 class="mb-0">Template: ${missingInfo.length > 0 ? missingInfo.join(' ') : '<span class="badge bg-success">Complete</span>'}</h5>
          <div>
            <button class="btn btn-sm btn-outline-primary edit-message-btn" data-key="${msg.key}">
              Edit
            </button>
          </div>
        </div>
        <div class="card-body">
          <pre class="message-text" id="message-text-${msg.key}">${msg.message}</pre>
          <div class="message-editor d-none mt-3" id="message-editor-${msg.key}">
            <textarea class="form-control message-textarea" id="message-textarea-${msg.key}" rows="8">${msg.message}</textarea>
            <div class="mt-2">
              <button class="btn btn-sm btn-success save-message-btn" data-key="${msg.key}">Save</button>
              <button class="btn btn-sm btn-secondary cancel-edit-btn" data-key="${msg.key}">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  messageTemplatesContainer.innerHTML = templatesHTML;
  
  // Add event listeners
  document.querySelectorAll('.edit-message-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      document.getElementById(`message-text-${key}`).classList.add('d-none');
      document.getElementById(`message-editor-${key}`).classList.remove('d-none');
    });
  });
  
  document.querySelectorAll('.save-message-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-key');
      const newMessage = document.getElementById(`message-textarea-${key}`).value.trim();
      
      if (newMessage) {
        await updateMessageTemplate(key, newMessage);
      }
    });
  });
  
  document.querySelectorAll('.cancel-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      document.getElementById(`message-text-${key}`).classList.remove('d-none');
      document.getElementById(`message-editor-${key}`).classList.add('d-none');
    });
  });
}

// Function to update a message template
async function updateMessageTemplate(key, newMessage) {
  try {
    const response = await fetchWithAuth(`${window.config.API_BASE_URL}/messages/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: newMessage })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.status === 'success') {
      // Update the displayed message
      const messageText = document.getElementById(`message-text-${key}`);
      if (messageText) {
        messageText.textContent = newMessage;
        messageText.classList.remove('d-none');
      }
      
      // Hide the editor
      const messageEditor = document.getElementById(`message-editor-${key}`);
      if (messageEditor) {
        messageEditor.classList.add('d-none');
      }
      
      if (typeof window.showToast === 'function') {
        window.showToast('Message template updated successfully.', 'success');
      }
    } else {
      if (typeof window.showToast === 'function') {
        window.showToast('Failed to update message template.', 'danger');
      }
    }
  } catch (error) {
    console.error('Error updating message template:', error);
    if (typeof window.showToast === 'function') {
      window.showToast('Error updating message template: ' + error.message, 'danger');
    }
  }
}

// Function to filter message templates
function filterMessageTemplates() {
  // Just reload templates - the filter will be applied during display
  fetchMessageTemplates();
}

// Export the necessary functions
export {
  initVendorContactModule,
  fetchPromptTemplate,
  fetchMessageTemplates,
  savePromptTemplate,
  resetPromptTemplate,
  regenerateMessages
}; 