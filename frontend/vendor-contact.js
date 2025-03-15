// Vendor Contact functionality

// Use the shared API_BASE_URL from config.js
// const API_BASE_URL = window.config.API_BASE_URL;  // Remove this line

// DOM Elements
const promptTemplateTextarea = document.getElementById('prompt-template');
const additionalQuestionInput = document.getElementById('additional-question');
const maxTokensInput = document.getElementById('max-tokens');
const savePromptBtn = document.getElementById('save-prompt');
const resetPromptBtn = document.getElementById('reset-prompt');
const regenerateMessagesBtn = document.getElementById('regenerate-messages');
const filterMissingInfoSelect = document.getElementById('filter-missing-info');
const messageTemplatesContainer = document.getElementById('message-templates-container');

// Initialize the vendor contact tab
document.addEventListener('DOMContentLoaded', () => {
  // Load the prompt template
  fetchPromptTemplate();
  
  // Load message templates
  fetchMessageTemplates();
  
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
  document.getElementById('vendor-contact-tab').addEventListener('shown.bs.tab', () => {
    fetchPromptTemplate();
    fetchMessageTemplates();
  });
});

// Add credentials to all fetch requests
function fetchWithAuth(url, options = {}) {
  return fetch(url, {
    ...options,
    credentials: 'include'
  });
}

// Function to load messages
async function loadMessages() {
  try {
    const response = await fetchWithAuth(`${window.config.API_BASE_URL}/messages`);
    
    if (response.status === 401) {
      // Unauthorized - handle gracefully
      document.getElementById('vendor-contact-content').innerHTML = `
        <div class="alert alert-warning">
          <p>Authentication required to view vendor contact templates.</p>
          <button class="btn btn-primary" id="vendor-login-btn">Login</button>
        </div>
      `;
      
      document.getElementById('vendor-login-btn').addEventListener('click', () => {
        const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
        loginModal.show();
      });
      return;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const messages = await response.json();
    displayMessages(messages);
  } catch (error) {
    console.error('Error loading messages:', error);
    document.getElementById('vendor-contact-content').innerHTML = `
      <div class="alert alert-danger">
        Failed to load vendor contact templates. Please try again later.
      </div>
    `;
  }
}

// Function to save a message
async function saveMessage(key, message) {
  try {
    const response = await fetchWithAuth(`${window.config.API_BASE_URL}/messages/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message })
    });
    
    if (response.status === 401 || response.status === 403) {
      // Unauthorized or forbidden
      showAlert('message-alert', 'danger', 'You do not have permission to save this message.');
      return false;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result.status === 'success';
  } catch (error) {
    console.error('Error saving message:', error);
    return false;
  }
}

// Function to fetch the prompt template
async function fetchPromptTemplate() {
  try {
    const response = await fetchWithAuth(`${window.config.API_BASE_URL}/prompt`);
    
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
    showAlert('Failed to load prompt template. Please try again later.', 'danger');
  }
}

// Function to save prompt template handler
async function savePromptTemplateHandler() {
  const template = promptTemplateTextarea.value.trim();
  const additionalQuestion = additionalQuestionInput.value.trim();
  const maxTokens = parseInt(maxTokensInput.value, 10);
  
  if (!template) {
    showAlert('Prompt template cannot be empty.', 'warning');
    return;
  }
  
  const success = await savePromptTemplate({
    prompt_template: template,
    additional_question: additionalQuestion,
    max_tokens: maxTokens
  });
  
  if (success) {
    showAlert('Prompt template saved successfully.', 'success');
  } else {
    showAlert('Failed to save prompt template.', 'danger');
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
      showAlert('You do not have permission to save the prompt template.', 'danger');
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
      showAlert('You do not have permission to reset the prompt template.', 'danger');
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
      
      showAlert('Prompt template reset to default.', 'success');
    } else {
      showAlert('Failed to reset prompt template.', 'danger');
    }
  } catch (error) {
    console.error('Error resetting prompt template:', error);
    showAlert('Failed to reset prompt template.', 'danger');
  }
}

// Function to regenerate all messages
async function regenerateMessages() {
  try {
    const response = await fetchWithAuth(`${window.config.API_BASE_URL}/messages/regenerate`, {
      method: 'POST'
    });
    
    if (response.status === 401 || response.status === 403) {
      // Unauthorized or forbidden
      showAlert('You do not have permission to regenerate messages.', 'danger');
      return;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.status === 'success') {
      showAlert('Messages are being regenerated. This may take a moment.', 'info');
      
      // Poll for completion
      pollRegenerationStatus();
    } else {
      showAlert('Failed to start message regeneration.', 'danger');
    }
  } catch (error) {
    console.error('Error regenerating messages:', error);
    showAlert('Failed to regenerate messages.', 'danger');
  }
}

// Function to poll regeneration status
async function pollRegenerationStatus() {
  try {
    const response = await fetchWithAuth(`${window.config.API_BASE_URL}/messages/regenerate/status`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const status = await response.json();
    
    if (status.completed) {
      showAlert('Messages have been regenerated successfully.', 'success');
      fetchMessageTemplates(); // Refresh the templates
    } else {
      // Continue polling
      setTimeout(pollRegenerationStatus, 2000);
    }
  } catch (error) {
    console.error('Error checking regeneration status:', error);
    showAlert('Failed to check regeneration status.', 'danger');
  }
}

// Fetch message templates from the API
async function fetchMessageTemplates() {
  try {
    const filterValue = filterMissingInfoSelect ? filterMissingInfoSelect.value : '';
    
    const response = await fetchWithAuth(`${window.config.API_BASE_URL}/messages`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const messages = await response.json();
    
    // Filter messages if needed
    const filteredMessages = filterValue ? filterMessages(messages, filterValue) : messages;
    
    // Display the messages
    displayMessageTemplates(filteredMessages);
  } catch (error) {
    console.error('Error fetching message templates:', error);
    messageTemplatesContainer.innerHTML = `
      <div class="alert alert-danger">
        Failed to load message templates. Please try again later.
      </div>
    `;
  }
}

// Display message templates in the UI
function displayMessageTemplates(messages) {
  // Clear the container
  messageTemplatesContainer.innerHTML = '';
  
  // Get the filter value
  const filterValue = filterMissingInfoSelect.value;
  
  // Filter messages based on selection
  const filteredMessages = filterMessages(messages, filterValue);
  
  // Check if there are any messages after filtering
  if (Object.keys(filteredMessages).length === 0) {
    messageTemplatesContainer.innerHTML = '<div class="alert alert-info">No message templates match the selected filter.</div>';
    return;
  }
  
  // Create a card for each message template
  for (const key in filteredMessages) {
    const messageData = filteredMessages[key];
    const missingInfo = messageData.missing_info.join(', ');
    
    const messageCard = document.createElement('div');
    messageCard.className = 'card mb-3';
    
    messageCard.innerHTML = `
      <div class="card-header d-flex justify-content-between align-items-center">
        <h5 class="mb-0">Missing: ${missingInfo}</h5>
        <button class="btn btn-sm btn-outline-primary edit-message-btn" data-key="${key}">Edit</button>
      </div>
      <div class="card-body">
        <div class="message-display" id="message-display-${key}">
          <pre class="message-text">${messageData.message}</pre>
        </div>
        <div class="message-edit d-none" id="message-edit-${key}">
          <textarea class="form-control mb-2" id="message-textarea-${key}" rows="5">${messageData.message}</textarea>
          <button class="btn btn-sm btn-primary save-message-btn" data-key="${key}">Save</button>
          <button class="btn btn-sm btn-outline-secondary cancel-edit-btn" data-key="${key}">Cancel</button>
        </div>
      </div>
    `;
    
    messageTemplatesContainer.appendChild(messageCard);
  }
  
  // Add event listeners for edit buttons
  document.querySelectorAll('.edit-message-btn').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.getAttribute('data-key');
      document.getElementById(`message-display-${key}`).classList.add('d-none');
      document.getElementById(`message-edit-${key}`).classList.remove('d-none');
    });
  });
  
  // Add event listeners for save buttons
  document.querySelectorAll('.save-message-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const key = button.getAttribute('data-key');
      const newMessage = document.getElementById(`message-textarea-${key}`).value;
      await updateMessageTemplate(key, newMessage);
    });
  });
  
  // Add event listeners for cancel buttons
  document.querySelectorAll('.cancel-edit-btn').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.getAttribute('data-key');
      document.getElementById(`message-display-${key}`).classList.remove('d-none');
      document.getElementById(`message-edit-${key}`).classList.add('d-none');
    });
  });
}

// Filter messages based on selection
function filterMessages(messages, filterValue) {
  if (!filterValue) {
    return messages; // Return all messages if no filter
  }
  
  const filteredMessages = {};
  
  for (const key in messages) {
    const messageData = messages[key];
    
    if (filterValue === 'multiple' && messageData.missing_info.length > 1) {
      filteredMessages[key] = messageData;
    } else if (filterValue !== 'multiple' && messageData.missing_info.includes(filterValue)) {
      filteredMessages[key] = messageData;
    }
  }
  
  return filteredMessages;
}

// Update a message template
async function updateMessageTemplate(key, newMessage) {
  try {
    const response = await fetchWithAuth(`${window.config.API_BASE_URL}/messages/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: newMessage })
    });
    
    if (response.ok) {
      // Update the UI
      const messageDisplay = document.getElementById(`message-display-${key}`);
      messageDisplay.querySelector('.message-text').textContent = newMessage;
      messageDisplay.classList.remove('d-none');
      document.getElementById(`message-edit-${key}`).classList.add('d-none');
      
      showAlert('Message template updated successfully', 'success');
    } else {
      console.error('Error updating message template:', response.status);
      showAlert(`Error updating message template (${response.status}). Please check if the API server is running.`, 'danger');
    }
  } catch (error) {
    console.error('Error updating message template:', error);
    showAlert('Error updating message template: ' + error.message, 'danger');
  }
}

// Filter message templates based on selection
function filterMessageTemplates() {
  fetchMessageTemplates(); // Re-fetch and display with the new filter
}

// Show an alert message
function showAlert(message, type = 'info') {
  // Create alert element
  const alertEl = document.createElement('div');
  alertEl.className = `alert alert-${type} alert-dismissible fade show`;
  alertEl.role = 'alert';
  alertEl.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  
  // Find a good place to show the alert
  const container = document.querySelector('.vendor-contact-panel');
  container.insertBefore(alertEl, container.firstChild);
  
  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    alertEl.classList.remove('show');
    setTimeout(() => alertEl.remove(), 150);
  }, 5000);
} 