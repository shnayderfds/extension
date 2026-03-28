// ─── Agent Mode: Element Storage ─────────────────────────
let _alvelikaMarkedElements = [];

// ─── Message Router ──────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageContext') {
    let contextText = '';
    const mainContent = document.querySelector('article') || document.querySelector('main');
    if (mainContent) {
      contextText = mainContent.innerText;
    } else {
      contextText = document.body.innerText;
    }
    contextText = contextText.substring(0, 50000);
    sendResponse({ context: contextText, title: document.title, url: window.location.href });
  }

  if (request.action === 'drawMarkers') {
    const map = drawMarkers();
    sendResponse({ elementMap: map });
  }

  if (request.action === 'removeMarkers') {
    removeMarkers();
    sendResponse({ ok: true });
  }

  if (request.action === 'executeAction') {
    const result = executeAction(request.actionType, request.id, request.textValue);
    sendResponse(result);
  }

  return true;
});

// ─── Agent Mode: Draw Numbered Badges ────────────────────
function drawMarkers() {
  removeMarkers(); // clean previous run
  _alvelikaMarkedElements = [];

  const selectors = 'a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [contenteditable="true"]';
  const elements = document.querySelectorAll(selectors);
  let idCounter = 1;
  const map = [];

  elements.forEach((el) => {
    // Skip hidden/off-screen elements
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    if (rect.right < 0 || rect.left > window.innerWidth) return;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

    const id = idCounter++;

    // Create the badge
    const badge = document.createElement('div');
    badge.className = 'alvelika-agent-badge';
    badge.textContent = id;
    badge.style.cssText = `
      position: absolute;
      z-index: 2147483647;
      left: ${window.scrollX + rect.left}px;
      top: ${window.scrollY + rect.top}px;
      width: 20px;
      height: 20px;
      background: #FFD600;
      color: #000;
      font-size: 11px;
      font-weight: 700;
      font-family: monospace;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      pointer-events: none;
      line-height: 1;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    `;
    document.body.appendChild(badge);

    // Store reference
    _alvelikaMarkedElements.push({ id, element: el, badge });

    // Build description for the AI
    const tag = el.tagName.toLowerCase();
    const entry = { id, type: tag };
    if (el.placeholder) entry.placeholder = el.placeholder.substring(0, 60);
    if (el.textContent && tag !== 'textarea' && tag !== 'input') {
      entry.text = el.textContent.trim().substring(0, 60);
    }
    if (el.value && (tag === 'input' || tag === 'textarea')) {
      entry.value = el.value.substring(0, 60);
    }
    if (el.getAttribute('aria-label')) entry.ariaLabel = el.getAttribute('aria-label').substring(0, 60);
    if (el.href) entry.href = el.href.substring(0, 100);
    if (el.type) entry.inputType = el.type;
    map.push(entry);
  });

  return map;
}

// ─── Agent Mode: Remove All Badges ───────────────────────
function removeMarkers() {
  document.querySelectorAll('.alvelika-agent-badge').forEach(b => b.remove());
}

// ─── Agent Mode: Execute an Action ───────────────────────
function executeAction(actionType, id, textValue) {
  const entry = _alvelikaMarkedElements.find(e => e.id === id);
  if (!entry) return { ok: false, error: `Element #${id} not found` };

  const el = entry.element;

  if (actionType === 'CLICK') {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus();
    el.click();
    return { ok: true, action: `Clicked element #${id}` };
  }

  if (actionType === 'TYPE') {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus();
    // Clear existing value
    el.value = '';
    // Set new value character-by-character style via native setter
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, textValue);
    } else {
      el.value = textValue;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, action: `Typed "${textValue}" into element #${id}` };
  }

  return { ok: false, error: `Unknown action: ${actionType}` };
}

// ─── Inline Translation Feature ──────────────────────────
(function () {
  let bubble = null;
  let tooltip = null;

  // Inject styles once
  const style = document.createElement('style');
  style.textContent = `
    .alvelika-bubble {
      position: absolute;
      z-index: 2147483647;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      cursor: pointer;
      background: #1A1A1A;
      border: 1px solid rgba(138, 43, 226, 0.4);
      box-shadow: 0 2px 12px rgba(138, 43, 226, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      animation: alvelika-pop 0.2s ease;
    }
    .alvelika-bubble:hover {
      transform: scale(1.15);
      box-shadow: 0 4px 20px rgba(138, 43, 226, 0.5);
    }
    .alvelika-bubble img {
      width: 18px;
      height: 18px;
      object-fit: contain;
      pointer-events: none;
    }
    @keyframes alvelika-pop {
      from { transform: scale(0); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .alvelika-tooltip {
      position: absolute;
      z-index: 2147483647;
      max-width: 360px;
      min-width: 180px;
      background: #1A1A1A;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 14px 16px;
      color: #EAEAEA;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
      animation: alvelika-fade 0.25s ease;
      word-wrap: break-word;
    }
    .alvelika-tooltip.loading {
      color: #888;
      font-style: italic;
    }
    .alvelika-tooltip.error {
      color: #ff6b6b;
    }
    @keyframes alvelika-fade {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.documentElement.appendChild(style);

  function removeBubble() {
    if (bubble) { bubble.remove(); bubble = null; }
  }

  function removeTooltip() {
    if (tooltip) { tooltip.remove(); tooltip = null; }
  }

  function cleanup() {
    removeBubble();
    removeTooltip();
  }

  // Get the logo URL from the extension
  const logoUrl = chrome.runtime.getURL('logo.png');

  document.addEventListener('mouseup', (e) => {
    // Ignore clicks on our own elements
    if (e.target.closest('.alvelika-bubble') || e.target.closest('.alvelika-tooltip')) return;

    // Small delay so the selection is finalized
    setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      removeBubble();

      if (!selectedText || selectedText.length < 2 || selectedText.length > 5000) return;

      // Get the very last rect of the selection (= end of highlighted text)
      const range = selection.getRangeAt(0);
      const rects = range.getClientRects();
      const lastRect = rects[rects.length - 1];
      if (!lastRect) return;

      bubble = document.createElement('div');
      bubble.className = 'alvelika-bubble';
      bubble.innerHTML = `<img src="${logoUrl}" alt="Translate">`;

      // Position right after the last character of the selection
      bubble.style.left = (window.scrollX + lastRect.right + 6) + 'px';
      bubble.style.top = (window.scrollY + lastRect.top + (lastRect.height / 2) - 14) + 'px';

      bubble.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      });

      bubble.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const bubbleLeft = parseInt(bubble.style.left);
        const bubbleTop = parseInt(bubble.style.top);
        removeBubble();
        showTranslation(selectedText, bubbleLeft, bubbleTop + 36);
      });

      document.body.appendChild(bubble);
    }, 10);
  });

  // Click anywhere else to dismiss — but not on our elements
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.alvelika-bubble') || e.target.closest('.alvelika-tooltip')) return;
    removeTooltip();
    // Don't remove bubble here — mouseup will handle it after selection changes
  });

  async function showTranslation(text, posX, posY) {
    removeTooltip();

    tooltip = document.createElement('div');
    tooltip.className = 'alvelika-tooltip loading';
    tooltip.textContent = 'Translating…';

    // Position below where the bubble was
    tooltip.style.left = posX + 'px';
    tooltip.style.top = posY + 'px';
    document.body.appendChild(tooltip);

    // Get target language from settings
    const config = await chrome.storage.local.get(['translateLang']);
    const targetLang = config.translateLang || 'en';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'translate',
        text: text,
        targetLang: targetLang
      });

      if (!tooltip) return; // user dismissed

      if (response && response.translation) {
        tooltip.classList.remove('loading');
        tooltip.textContent = response.translation;
      } else {
        tooltip.classList.remove('loading');
        tooltip.classList.add('error');
        tooltip.textContent = response?.error || 'Translation failed.';
      }
    } catch (err) {
      if (!tooltip) return;
      tooltip.classList.remove('loading');
      tooltip.classList.add('error');
      tooltip.textContent = 'Could not connect to AI.';
    }
  }
})();
