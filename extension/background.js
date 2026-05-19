// MV2 background script (persistent) for Ticket Extractor

async function runOnActiveTab(options = {}) {
  const runtimeOptions = {
    copyFormat: options.copyFormat || 'json',
    anonymize: Boolean(options.anonymize),
    downloadJson: Boolean(options.downloadJson)
  };

  console.log('[BG] Starting extraction with options:', runtimeOptions);
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id) {
    console.error('[BG] No active tab found');
    throw new Error('No active tab');
  }
  console.log('[BG] Tab found:', tab.id, tab.url);

  try {
    console.log('[BG] Injecting script...');
    const extractCode = extractAndCopy.toString();
    console.log('[BG] Extract function length:', extractCode.length);

    // Use message passing to get the result since executeScript doesn't properly await Promises in MV2
    return new Promise((resolve) => {
      // Set up one-time listener for the result
      const listener = (msg) => {
        if (msg && msg.type === 'EXTRACTION_RESULT') {
          browser.runtime.onMessage.removeListener(listener);
          console.log('[BG] Received result via message:', msg.result);

          if (msg.result && msg.result.ok) {
            (async () => {
              let downloadedJson = false;
              if (runtimeOptions.downloadJson && msg.result.json) {
                try {
                  const filename = msg.result.filename || `chat-${Date.now()}.json`;
                  const jsonPayload = JSON.stringify(msg.result.json, null, 2);
                  const blobUrl = URL.createObjectURL(new Blob([jsonPayload], { type: 'application/json' }));
                  await browser.downloads.download({ url: blobUrl, filename, saveAs: false });
                  downloadedJson = true;
                  console.log('[BG] JSON downloaded:', filename);
                  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
                } catch (downloadError) {
                  console.error('[BG] Failed to download JSON:', downloadError);
                }
              }

              const messageParts = [];
              if (msg.result.copied) {
                messageParts.push(`Copied ${runtimeOptions.copyFormat === 'json' ? 'JSON' : 'text'} to clipboard`);
              } else {
                messageParts.push('Failed to copy to clipboard');
              }
              if (downloadedJson) {
                messageParts.push('JSON downloaded');
              } else if (runtimeOptions.downloadJson) {
                messageParts.push('JSON download failed');
              }

              resolve({
                ...msg.result,
                downloadedJson,
                message: msg.result.message || messageParts.filter(Boolean).join('. ')
              });
            })();
          } else {
            resolve(msg.result || { ok: false, error: 'No result returned' });
          }
        }
      };

      browser.runtime.onMessage.addListener(listener);

      // Inject script that sends message back
      browser.tabs.executeScript(tab.id, {
        code: `
          (async function() {
            console.log('[INJECTED] Script starting...');
            try {
              ${extractCode}
              
              const injectedOptions = ${JSON.stringify(runtimeOptions)};
              console.log('[INJECTED] Calling extractAndCopy with options:', injectedOptions);
              const result = await extractAndCopy(injectedOptions);
              console.log('[INJECTED] ExtractAndCopy returned:', result);
              
              // Send result back via message
              browser.runtime.sendMessage({
                type: 'EXTRACTION_RESULT',
                result: result
              });
            } catch (e) {
              console.error('[INJECTED] Extraction error:', e);
              browser.runtime.sendMessage({
                type: 'EXTRACTION_RESULT',
                result: { 
                  ok: false, 
                  error: e?.message || String(e), 
                  stack: e?.stack,
                  name: e?.name
                }
              });
            }
          })();
        `
      }).catch((e) => {
        browser.runtime.onMessage.removeListener(listener);
        console.error('[BG] Failed to inject script:', e);
        resolve({ ok: false, error: e?.message || String(e) });
      });
    });
  } catch (e) {
    console.error('[BG] Background script error:', e);
    console.error('[BG] Error stack:', e?.stack);
    console.error('[BG] Error name:', e?.name);
    return { ok: false, error: e?.message || String(e), stack: e?.stack, name: e?.name };
  }
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'RUN_EXTRACTION') {
    return runOnActiveTab(msg.options || {});
  }
});

// Function executed in the page context
async function extractAndCopy(options = {}) {
  const copyFormat = (options.copyFormat === 'text' ? 'text' : 'json');
  const anonymize = Boolean(options.anonymize);
  const downloadJson = Boolean(options.downloadJson);

  console.log('[EXTRACT] Starting extraction with options:', { copyFormat, anonymize, downloadJson });

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  function stripEmails(value) {
    if (!value || typeof value !== 'string') return value;
    return value
      .replace(emailRegex, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  // Extract conversation messages from Kleinanzeigen page
  const items = document.querySelectorAll('.MessageListItem-outbound, .MessageListItem-inbound');
  const messages = [];

  items.forEach(item => {
    const isOutbound = item.classList.contains('MessageListItem-outbound');
    const sender = isOutbound ? 'ME' : 'VENDOR';
    const textEl = item.querySelector('.Message--Text');
    const dateEl = item.querySelector('.MessageListItem-Date');

    if (textEl) {
      const contentText = textEl.textContent.trim();
      const date = dateEl ? dateEl.textContent.trim() : '';
      messages.push({
        sender,
        date,
        contentText
      });
    }
  });

  console.log('[EXTRACT] Extracted', messages.length, 'messages');

  // Build plain text transcript
  const transcript = messages.map(m => {
    const content = anonymize ? stripEmails(m.contentText) : m.contentText;
    const header = m.date ? `${m.sender} (${m.date}):` : `${m.sender}:`;
    return `${header}\n${content}`;
  }).join('\n\n');

  // Build JSON payload
  const conversationId = new URLSearchParams(window.location.search).get('conversationId') || '';
  const rawTitle = document.querySelector('.ConversationHeader a')?.textContent?.trim() || '';
  const adUrl = document.querySelector('.ConversationHeader a')?.getAttribute('href') || '';
  const title = anonymize ? stripEmails(rawTitle) : rawTitle;

  const jsonMessages = messages.map(m => {
    const contentText = anonymize ? stripEmails(m.contentText) : m.contentText;
    return {
      sender: m.sender,
      date: m.date,
      contentText: contentText.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim()
    };
  });

  const jsonPayload = {
    conversationId,
    adTitle: title,
    adUrl: adUrl ? (adUrl.startsWith('http') ? adUrl : new URL(adUrl, location.origin).href) : '',
    url: location.href,
    exportedAt: new Date().toISOString(),
    messages: jsonMessages
  };

  // Copy to clipboard
  function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (err) {
      document.body.removeChild(textarea);
      return false;
    }
  }

  const copySource = copyFormat === 'json' ? JSON.stringify(jsonPayload, null, 2) : transcript;
  console.log('[EXTRACT] Copying to clipboard as', copyFormat);
  const copied = copyToClipboard(copySource);
  console.log('[EXTRACT] Clipboard copy result:', copied);

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `chat-${conversationId || 'unknown'}-${ts}.json`;

  const result = {
    ok: true,
    transcript,
    json: (copyFormat === 'json' || downloadJson) ? jsonPayload : undefined,
    filename,
    copied: copied,
    copiedFormat: copyFormat,
    anonymized: anonymize
  };

  console.log('[EXTRACT] Returning result:', {
    ok: result.ok,
    messageCount: messages.length,
    copied: result.copied,
    copiedFormat: copyFormat,
    anonymized: anonymize
  });

  return result;
}

