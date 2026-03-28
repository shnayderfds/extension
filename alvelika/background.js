// Allow users to open the side panel by clicking on the action toolbar icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
  console.log("Alvelika installed and ready to assist.");
});

// Handle messages from sidepanel and content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    handleTranslation(request.text, request.targetLang).then(sendResponse);
    return true;
  }
  if (request.action === 'captureScreen') {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 60 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ screenshot: dataUrl });
      }
    });
    return true;
  }
});

async function handleTranslation(text, targetLang) {
  const config = await chrome.storage.local.get(['provider', 'apiKey', 'customUrl', 'modelId']);

  if (!config.provider || (!config.apiKey && config.provider !== 'pollinations')) {
    return { error: 'No AI provider configured.' };
  }

  let baseUrl = '';
  let headers = { 'Content-Type': 'application/json' };

  switch (config.provider) {
    case 'pollinations':
      baseUrl = 'https://gen.pollinations.ai/v1/chat/completions';
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      break;
    case 'cerebras':
      baseUrl = 'https://api.cerebras.ai/v1/chat/completions';
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      break;
    case 'openrouter':
      baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      headers['HTTP-Referer'] = 'https://alvelika.ai';
      headers['X-Title'] = 'Alvelika';
      break;
    case 'mistral':
      baseUrl = 'https://api.mistral.ai/v1/chat/completions';
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      break;
    case 'custom':
      baseUrl = config.customUrl.endsWith('/') ? `${config.customUrl}chat/completions` : `${config.customUrl}/chat/completions`;
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
      break;
  }

  const model = config.modelId || (config.provider === 'pollinations' ? 'openai' : 'gpt-4o-mini');

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: `You are a translator. Translate the given text to ${targetLang}. Reply with ONLY the translation, nothing else. No explanations, no quotes, no extra text.` },
          { role: 'user', content: text }
        ],
        stream: false
      })
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    return { translation: data.choices[0].message.content.trim() };
  } catch (err) {
    return { error: err.message };
  }
}
