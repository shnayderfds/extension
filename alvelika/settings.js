const providerSelect = document.getElementById('provider-select');
const apiKeyInput = document.getElementById('api-key');
const customUrlSection = document.getElementById('custom-endpoint-section');
const customUrlInput = document.getElementById('custom-url');
const modelIdInput = document.getElementById('model-id');
const saveBtn = document.getElementById('save-button');
const statusMsg = document.getElementById('status-message');
const translateLangSelect = document.getElementById('translate-lang');

// Load saved settings
chrome.storage.local.get(['provider', 'apiKey', 'customUrl', 'modelId', 'translateLang'], (result) => {
  if (result.provider) providerSelect.value = result.provider;
  if (result.apiKey) apiKeyInput.value = result.apiKey;
  if (result.customUrl) customUrlInput.value = result.customUrl;
  if (result.modelId) modelIdInput.value = result.modelId;
  if (result.translateLang) translateLangSelect.value = result.translateLang;
  
  toggleCustomUrl(providerSelect.value);
});

providerSelect.addEventListener('change', (e) => {
  toggleCustomUrl(e.target.value);
});

function toggleCustomUrl(val) {
  if (val === 'custom') {
    customUrlSection.classList.remove('hidden');
  } else {
    customUrlSection.classList.add('hidden');
  }
}

saveBtn.addEventListener('click', () => {
  const config = {
    provider: providerSelect.value,
    apiKey: apiKeyInput.value,
    customUrl: customUrlInput.value,
    modelId: modelIdInput.value,
    translateLang: translateLangSelect.value
  };

  chrome.storage.local.set(config, () => {
    statusMsg.textContent = 'Settings saved!';
    setTimeout(() => {
      statusMsg.textContent = '';
    }, 2000);
  });
});
