// Vendor Contact functionality

// API URL - should match the one in main.js
const API_URL = '/api';

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
  savePromptBtn.addEventListener('click', savePromptTemplate);
  if (resetPromptBtn) {
    resetPromptBtn.addEventListener('click', resetPromptTemplate);
  }
  regenerateMessagesBtn.addEventListener('click', regenerateMessages);
  filterMissingInfoSelect.addEventListener('change', filterMessageTemplates);
  
  // Add event listener for tab activation to refresh data
  document.getElementById('vendor-contact-tab').addEventListener('shown.bs.tab', () => {
    fetchPromptTemplate();
    fetchMessageTemplates();
  });
});

// Fetch the prompt template from the API
async function fetchPromptTemplate() {
  try {
    // Show loading state
    promptTemplateTextarea.value = 'Loading prompt template...';
    promptTemplateTextarea.disabled = true;
    
    const response = await fetch(`${API_URL}/prompt`);
    if (response.ok) {
      const data = await response.json();
      promptTemplateTextarea.value = data.prompt_template || '';
      
      // If the template is empty, show an error message
      if (!promptTemplateTextarea.value.trim()) {
        showAlert('Warning: Prompt template is empty. Please add a template or reset to default.', 'warning');
      }
    } else {
      console.error('Error fetching prompt template:', response.status);
      showAlert(`Error loading prompt template (${response.status}). Please check if the API server is running.`, 'danger');
    }
  } catch (error) {
    console.error('Error fetching prompt template:', error);
    showAlert('Error loading prompt template: ' + error.message, 'danger');
  } finally {
    // Re-enable the textarea
    promptTemplateTextarea.disabled = false;
  }
}

// Save the prompt template
async function savePromptTemplate() {
  const promptTemplate = promptTemplateTextarea.value;
  
  if (!promptTemplate.trim()) {
    if (!confirm('The prompt template is empty. Do you want to reset to the default template?')) {
      showAlert('Prompt template cannot be empty', 'warning');
      return;
    } else {
      resetPromptTemplate();
      return;
    }
  }
  
  try {
    // Disable the textarea and button during save
    promptTemplateTextarea.disabled = true;
    savePromptBtn.disabled = true;
    
    const response = await fetch(`${API_URL}/prompt`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt_template: promptTemplate })
    });
    
    if (response.ok) {
      showAlert('Prompt template saved successfully', 'success');
    } else {
      console.error('Error saving prompt template:', response.status);
      showAlert(`Error saving prompt template (${response.status}). Please check if the API server is running.`, 'danger');
    }
  } catch (error) {
    console.error('Error saving prompt template:', error);
    showAlert('Error saving prompt template: ' + error.message, 'danger');
  } finally {
    // Re-enable the textarea and button
    promptTemplateTextarea.disabled = false;
    savePromptBtn.disabled = false;
  }
}

// Reset the prompt template to default
async function resetPromptTemplate() {
  if (!confirm('Are you sure you want to reset the prompt template to the default?')) {
    return;
  }
  
  try {
    // Disable the textarea and button during reset
    promptTemplateTextarea.disabled = true;
    resetPromptBtn.disabled = true;
    
    const response = await fetch(`${API_URL}/reset-prompt`, {
      method: 'POST'
    });
    
    if (response.ok) {
      showAlert('Prompt template reset to default', 'success');
      fetchPromptTemplate(); // Reload the template
    } else {
      console.error('Error resetting prompt template:', response.status);
      showAlert(`Error resetting prompt template (${response.status}). Please check if the API server is running.`, 'danger');
    }
  } catch (error) {
    console.error('Error resetting prompt template:', error);
    showAlert('Error resetting prompt template: ' + error.message, 'danger');
  } finally {
    // Re-enable the button (textarea will be re-enabled in fetchPromptTemplate)
    resetPromptBtn.disabled = false;
  }
}

// Regenerate all message templates
async function regenerateMessages() {
  const additionalQuestion = additionalQuestionInput.value.trim();
  const maxTokens = parseInt(maxTokensInput.value) || 300;
  
  // Confirm with the user
  if (!confirm('Are you sure you want to regenerate all message templates? This may take a while.')) {
    return;
  }
  
  // Disable the button during regeneration
  regenerateMessagesBtn.disabled = true;
  regenerateMessagesBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Regenerating...';
  
  try {
    const response = await fetch(`${API_URL}/regenerate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        additional_question: additionalQuestion,
        max_tokens: maxTokens
      })
    });
    
    if (response.ok) {
      showAlert('Messages regenerated successfully', 'success');
      // Refresh the message templates
      fetchMessageTemplates();
    } else {
      console.error('Error regenerating messages:', response.status);
      showAlert(`Error regenerating messages (${response.status}). Please check if the API server is running.`, 'danger');
    }
  } catch (error) {
    console.error('Error regenerating messages:', error);
    showAlert('Error regenerating messages: ' + error.message, 'danger');
  } finally {
    // Re-enable the button
    regenerateMessagesBtn.disabled = false;
    regenerateMessagesBtn.textContent = 'Regenerate All Messages';
  }
}

// Fetch message templates from the API
async function fetchMessageTemplates() {
  try {
    messageTemplatesContainer.innerHTML = `
      <div class="text-center">
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p>Loading message templates...</p>
      </div>
    `;
    
    const response = await fetch(`${API_URL}/messages`);
    if (response.ok) {
      const messages = await response.json();
      
      // Check if messages is empty
      if (Object.keys(messages).length === 0) {
        messageTemplatesContainer.innerHTML = `
          <div class="alert alert-info">
            No message templates found. Click "Regenerate All Messages" to create them.
          </div>
        `;
      } else {
        displayMessageTemplates(messages);
      }
    } else {
      console.error('Error fetching message templates:', response.status);
      messageTemplatesContainer.innerHTML = `
        <div class="alert alert-danger">
          Error loading message templates (${response.status}). Please check if the API server is running.
        </div>
      `;
    }
  } catch (error) {
    console.error('Error fetching message templates:', error);
    messageTemplatesContainer.innerHTML = `
      <div class="alert alert-danger">
        Error loading message templates: ${error.message}
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
    const response = await fetch(`${API_URL}/messages/${key}`, {
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