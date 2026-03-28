const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const clearButton = document.getElementById('clear-button');
const settingsButton = document.getElementById('settings-button');
const uploadButton = document.getElementById('upload-button');
const imageUpload = document.getElementById('image-upload');
const imagePreviewContainer = document.getElementById('image-preview-container');
const agentModeButton = document.getElementById('agent-mode-button');

let userHasScrolledUp = false;
let selectedImage = null;
let conversationHistory = [];
let agentModeActive = false;
let isAgentRunning = false;
let cancelAgent = false;
let activeAgentThinkingEl = null;

// SVG Icons for the Agent Button
const agentIconNormal = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M18 14c2 1 3 3 3 5v2H3v-2c0-2 1-4 3-5"/><circle cx="12" cy="6" r="1"/></svg>`;
const agentIconStop = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" color="#ff4d4d"><rect x="6" y="6" width="12" height="12"></rect></svg>`;

// Agent Mode toggle / STOP Button
agentModeButton.addEventListener('click', () => {
  if (isAgentRunning) {
    cancelAgent = true;
    if (activeAgentThinkingEl) {
      updateThinkingState(activeAgentThinkingEl, 'Stopping…');
    }
    return;
  }

  agentModeActive = !agentModeActive;
  agentModeButton.classList.toggle('active', agentModeActive);
  chatInput.placeholder = agentModeActive ? 'Agent mode — give me a task…' : 'Ask anything…';
});

// intelligent scroll flag
chatContainer.addEventListener('scroll', () => {
  const distanceFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
  userHasScrolledUp = distanceFromBottom > 60;
});

function scrollToBottom() {
  if (!userHasScrolledUp) {
    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
  }
}

// Auto-expand textarea
chatInput.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
  updateSendButtonColor();
});

function updateSendButtonColor() {
  const hasText = chatInput.value.trim().length > 0;
  const hasImage = !!selectedImage;
  sendButton.style.color = (hasText || hasImage) ? '#EAEAEA' : '#A0A0A0';
}

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

// Clipboard Paste Support for Images
chatInput.addEventListener('paste', (e) => {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (event) => {
        selectedImage = event.target.result;
        showImagePreview(selectedImage);
        updateSendButtonColor();
      };
      reader.readAsDataURL(blob);
    }
  }
});

// Settings button
settingsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Clear Chat logic
clearButton.addEventListener('click', () => {
  chatContainer.innerHTML = '';
  conversationHistory = [];
  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  welcome.innerHTML = `
    <img src="logo.png" alt="" class="welcome-logo">
    <p class="welcome-text">What can I help you with?</p>
  `;
  chatContainer.appendChild(welcome);
});

// Image Upload Logic
uploadButton.addEventListener('click', () => {
  imageUpload.click();
});

imageUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    selectedImage = event.target.result;
    showImagePreview(selectedImage);
    updateSendButtonColor();
  };
  reader.readAsDataURL(file);
});

function showImagePreview(src) {
  imagePreviewContainer.innerHTML = '';
  imagePreviewContainer.classList.remove('hidden');

  const item = document.createElement('div');
  item.className = 'preview-item';
  item.innerHTML = `
    <img src="${src}" alt="Preview">
    <button class="remove-preview">&times;</button>
  `;

  item.querySelector('.remove-preview').addEventListener('click', () => {
    selectedImage = null;
    imagePreviewContainer.innerHTML = '';
    imagePreviewContainer.classList.add('hidden');
    imageUpload.value = '';
    updateSendButtonColor();
  });

  imagePreviewContainer.appendChild(item);
}

sendButton.addEventListener('click', () => handleSend());

async function handleSend() {
  const text = chatInput.value.trim();
  if (!text && !selectedImage) return;

  // Hide welcome if present
  const welcome = chatContainer.querySelector('.welcome');
  if (welcome) welcome.remove();

  const currentImage = selectedImage;
  appendUserMessage(text, currentImage);

  // Clear input and previews
  chatInput.value = '';
  chatInput.style.height = 'auto';
  selectedImage = null;
  imagePreviewContainer.innerHTML = '';
  imagePreviewContainer.classList.add('hidden');
  imageUpload.value = '';
  updateSendButtonColor();

  // If agent mode is active, run the agent loop instead
  if (agentModeActive) {
    await startAgentLoop(text);
    return;
  }

  // Extract page context (ON-DEMAND SCRAPER)
  let pageContext = 'No context available.';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check if it's a restricted Chrome page
    if (tab && tab.id && tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
      pageContext = "The user is on a restricted browser page (like a New Tab). You cannot see this page.";
    }
    // If it's a normal website, aggressively scrape it
    else if (tab && tab.id) {
      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          let text = '';
          const article = document.querySelector('article');
          const main = document.querySelector('main') || document.querySelector('[role="main"]');

          // Smart Cascading Fallback
          if (article) { text = article.innerText; }
          else if (main) { text = main.innerText; }
          else { text = document.body.innerText; }

          return {
            title: document.title,
            text: text.substring(0, 15000)
          };
        }
      });

      if (injectionResults && injectionResults[0] && injectionResults[0].result) {
        const result = injectionResults[0].result;
        pageContext = `[Context of active page: ${result.title}]\n\n${result.text}`;
      }
    }
  } catch (err) {
    console.log('Could not extract context:', err);
    pageContext = "Error extracting context. Assume general conversation.";
  }

  // Capture screenshot of the active tab
  let screenshotUrl = null;
  try {
    const res = await chrome.runtime.sendMessage({ action: 'captureScreen' });
    if (res && res.screenshot) screenshotUrl = res.screenshot;
  } catch (err) {
    console.log('Could not capture screenshot:', err);
  }

  // Show thinking
  const thinkingEl = createThinkingState();
  chatContainer.appendChild(thinkingEl);
  scrollToBottom();

  await processLLMResponse(text, pageContext, thinkingEl, currentImage, screenshotUrl);
}

function appendUserMessage(text, imageUrl) {
  const div = document.createElement('div');
  div.className = 'message user';

  if (text) {
    const p = document.createElement('p');
    p.textContent = text;
    div.appendChild(p);
  }

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.className = 'message-image';
    div.appendChild(img);
  }

  chatContainer.appendChild(div);
  scrollToBottom();
}

function createThinkingState(initialText = 'thinking…') {
  const el = document.createElement('div');
  el.className = 'message ai thinking-state';
  el.textContent = initialText;
  return el;
}

function updateThinkingState(el, text) {
  if (!el) return;

  const cleanText = (text || 'thinking…')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  el.textContent = cleanText || 'thinking…';
  scrollToBottom();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fadeOutAndRemove(el, duration = 400) {
  if (!el || !el.isConnected) return;
  el.classList.add('fading-out');
  await delay(duration);
  if (el.isConnected) el.remove();
}

function extractTag(text, tagName) {
  const match = text.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? match[1].trim() : '';
}

function appendAIMessage(text, { stream = false, className = 'message ai stream-text' } = {}) {
  const div = document.createElement('div');
  div.className = className;
  chatContainer.appendChild(div);
  scrollToBottom();

  if (stream) {
    streamText(text, div);
  } else if (typeof marked !== 'undefined') {
    div.innerHTML = marked.parse(text);
  } else {
    div.textContent = text;
  }

  return div;
}

async function generateAgentFinalAnswer(apiConfig, userGoal, strategistText) {
  try {
    return await callLLM(apiConfig, [
      {
        role: 'system',
        content: `You are writing the final user-facing response after an autonomous browser task is complete.
Write a concise, polished Markdown answer.
Do not mention hidden steps, internal tools, or agent phases.`
      },
      {
        role: 'user',
        content: `User goal: ${userGoal}\n\nCompletion summary:\n${strategistText}`
      }
    ]);
  } catch {
    return `### Done\nI finished the task: **${userGoal}**.`;
  }
}

// ─── Shared: Build API config from saved settings ────────
async function getApiConfig() {
  const config = await new Promise((resolve) => {
    chrome.storage.local.get(['provider', 'apiKey', 'customUrl', 'modelId'], resolve);
  });

  if (!config.provider || (!config.apiKey && config.provider !== 'pollinations')) {
    return null;
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
  return { baseUrl, headers, model };
}

// ─── Shared: Make an LLM API call ────────────────────────
async function callLLM(apiConfig, messages) {
  const response = await fetch(apiConfig.baseUrl, {
    method: 'POST',
    headers: apiConfig.headers,
    body: JSON.stringify({ model: apiConfig.model, messages, stream: false })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API Error: ${response.status}`);
  }
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function processLLMResponse(userMessage, contextData, thinkingEl, imageUrl, screenshotUrl) {
  const apiConfig = await getApiConfig();
  if (!apiConfig) {
    thinkingEl.textContent = 'Error: Please configure AI provider and API key in settings.';
    return;
  }

  // Prepare user content (text and potentially image)
  const userContent = [];
  if (userMessage) {
    userContent.push({ type: 'text', text: userMessage });
  }
  if (imageUrl) {
    userContent.push({
      type: 'image_url',
      image_url: { url: imageUrl }
    });
  }
  if (screenshotUrl) {
    userContent.push({
      type: 'image_url',
      image_url: { url: screenshotUrl, detail: 'low' }
    });
  }

  const systemPrompt = `You are Alvelika, a sophisticated and proactive AI research assistant. 
You are "watching" the screen with the user. You receive both the page's text AND a screenshot of what they currently see.

CURRENT PAGE CONTEXT:
<page_context>
${contextData}
</page_context>

CRITICAL INSTRUCTIONS:
1. You MUST structure your response using these two tags: <thought> and <answer>.
2. Inside <thought>, analyze the user's request and the page context. Decide if you need the page to answer.
3. Inside <answer>, write your final response. 
4. PROVE YOU ARE WATCHING: In your answer, mention a specific detail from the page (like the title, a name, or a fact).
5. BE KIND & ELEGANT: Use Markdown (###, **, -) to make the answer beautiful.

Example:
<thought>The user said hi. I see they are on YouTube watching a video about fuel. I will greet them and mention the video.</thought>
<answer>### Hello! 
I see you're watching a fascinating video about **Fuel** by *Al-Dahih*. How can I help you explore this topic today?</answer>`;

  // Push user message into conversation history
  conversationHistory.push({ role: 'user', content: userContent });

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory
  ];

  try {
    const rawResult = await callLLM(apiConfig, messages);

    let thinkingText = "Analyzing context...";
    let finalAnswer = "";

    const thoughtMatch = rawResult.match(/<thought>([\s\S]*?)<\/thought>/i);
    if (thoughtMatch) {
      thinkingText = thoughtMatch[1].trim();
    }

    const answerMatch = rawResult.match(/<answer>([\s\S]*?)<\/answer>/i);
    if (answerMatch) {
      finalAnswer = answerMatch[1].trim();
    } else {
      finalAnswer = rawResult.replace(/<thought>[\s\S]*?<\/thought>/gi, '').replace(/<\/?answer>/gi, '').trim();
    }

    updateThinkingState(thinkingEl, thinkingText);

    await delay(800);
    await fadeOutAndRemove(thinkingEl, 500);

    const answerDiv = document.createElement('div');
    answerDiv.className = 'message ai stream-text';
    chatContainer.appendChild(answerDiv);

    conversationHistory.push({ role: 'assistant', content: rawResult });

    streamText(finalAnswer, answerDiv);

  } catch (err) {
    thinkingEl.textContent = `Error: ${err.message}`;
    console.error('LLM Request failed:', err);
  }
}

// ═══════════════════════════════════════════════════════════
//  AGENT MODE — Autonomous Web Agent Loop
// ═══════════════════════════════════════════════════════════

// Helper: ensure content script is injected, then send message
async function sendToContentScript(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error('No active tab');

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    await new Promise(r => setTimeout(r, 200));
    return await chrome.tabs.sendMessage(tab.id, message);
  }
}

async function startAgentLoop(userGoal) {
  const apiConfig = await getApiConfig();
  if (!apiConfig) {
    appendAIMessage('Error: Configure your AI provider in Settings first.', {
      className: 'message ai'
    });
    return;
  }

  isAgentRunning = true;
  cancelAgent = false;
  agentModeButton.innerHTML = agentIconStop;

  const thinkingEl = createThinkingState('thinking…');
  activeAgentThinkingEl = thinkingEl;
  chatContainer.appendChild(thinkingEl);
  scrollToBottom();

  let isDone = false;
  let stepCount = 0;
  const MAX_STEPS = 15;
  let consecutiveErrors = 0;
  let finalAnswer = '';
  let lastVisibleThought = 'Reviewing the page…';

  try {
    while (!isDone && stepCount < MAX_STEPS && !cancelAgent) {
      stepCount++;

      let elementMap = [];
      let screenshot = null;

      try {
        const drawResult = await sendToContentScript({ action: 'drawMarkers' });
        elementMap = drawResult?.elementMap || [];

        await delay(250);
        if (cancelAgent) break;

        try {
          const res = await chrome.runtime.sendMessage({ action: 'captureScreen' });
          if (res?.screenshot) screenshot = res.screenshot;
        } catch (e) {
          console.log('Screenshot failed:', e);
        }
      } finally {
        try { await sendToContentScript({ action: 'removeMarkers' }); } catch (e) { }
      }

      if (cancelAgent) break;

      // Strategist only: this is the only visible thinking text
      const strategistPrompt = `You are the Strategist for an autonomous web agent.
The user's goal is: "${userGoal}"

You will receive:
- a screenshot of the current page with numbered markers on interactive elements
- an element map in JSON

Your job is to decide whether the goal is already complete, and if not, what the next move should be.

IMPORTANT FORMAT RULES:
1. Reply with exactly these tags: <thinking>, <status>, <final>.
2. Inside <thinking>, write 1–2 short, polished sentences. This text is shown directly to the user inside a single "thinking..." bubble.
3. Do NOT mention JSON, element ids, executors, hidden steps, tools, or internal phases.
4. Use <status>DONE</status> only if the user's goal is fully achieved.
5. Use <status>CONTINUE</status> if another page action is still needed.
6. If status is DONE, write the final user-facing Markdown response inside <final>. If not done, leave <final></final> empty.

Return exactly this structure:
<thinking>...</thinking>
<status>CONTINUE or DONE</status>
<final>...</final>`;

      const strategistContent = [
        { type: 'text', text: `Element Map: ${JSON.stringify(elementMap)}` }
      ];

      if (screenshot) {
        strategistContent.push({
          type: 'image_url',
          image_url: { url: screenshot, detail: 'low' }
        });
      }

      const strategyText = await callLLM(apiConfig, [
        { role: 'system', content: strategistPrompt },
        { role: 'user', content: strategistContent }
      ]);

      const strategistThinking =
        extractTag(strategyText, 'thinking') ||
        'Reviewing the page and deciding the best next move…';

      lastVisibleThought = strategistThinking;
      updateThinkingState(thinkingEl, strategistThinking);

      const status =
        (extractTag(strategyText, 'status') ||
          (/<status>\s*DONE\s*<\/status>/i.test(strategyText) ? 'DONE' : 'CONTINUE'))
          .trim()
          .toUpperCase();

      if (status === 'DONE') {
        isDone = true;
        finalAnswer = extractTag(strategyText, 'final');

        if (!finalAnswer) {
          finalAnswer = await generateAgentFinalAnswer(apiConfig, userGoal, strategyText);
        }

        break;
      }

      if (cancelAgent) break;

      // Actor remains fully hidden from the UI
      const actorPrompt = `You are the Executor for an autonomous web agent.
User goal: "${userGoal}"

Strategist analysis:
${strategyText}

Interactive element map:
${JSON.stringify(elementMap)}

Return ONLY one raw JSON object. No markdown. No explanation outside JSON.

Schema:
{
  "thinking": "brief private reasoning",
  "action": "CLICK(id) | TYPE(id, 'text') | SCROLL_DOWN"
}

Rules:
- Choose exactly one next action.
- Do NOT return DONE unless absolutely unavoidable.
- Only use an id that exists in the element map.`;

      const actorRaw = await callLLM(apiConfig, [
        { role: 'system', content: actorPrompt },
        { role: 'user', content: 'Choose the next action.' }
      ]);

      let cleanJson = actorRaw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const firstBrace = cleanJson.indexOf('{');
      const lastBrace = cleanJson.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
      }

      let parsed;
      try {
        parsed = JSON.parse(cleanJson);
      } catch (e) {
        consecutiveErrors++;
        updateThinkingState(thinkingEl, 'I’m re-checking the page to choose the right next move…');

        if (consecutiveErrors >= 3) break;
        await delay(900);
        continue;
      }

      consecutiveErrors = 0;
      const actionStr = parsed.action || '';

      const doneMatch = actionStr.match(/^DONE\(([\s\S]*)\)$/i);
      if (doneMatch) {
        isDone = true;
        finalAnswer = doneMatch[1]?.trim();

        if (!finalAnswer) {
          finalAnswer = await generateAgentFinalAnswer(apiConfig, userGoal, strategyText);
        }
        break;
      }

      const clickMatch = actionStr.match(/^CLICK\((\d+)\)$/i);
      if (clickMatch) {
        await sendToContentScript({
          action: 'executeAction',
          actionType: 'CLICK',
          id: parseInt(clickMatch[1], 10)
        });
        await delay(2200);
        continue;
      }

      const typeMatch =
        actionStr.match(/^TYPE\((\d+),\s*'([\s\S]*?)'\)$/i) ||
        actionStr.match(/^TYPE\((\d+),\s*"([\s\S]*?)"\)$/i);

      if (typeMatch) {
        await sendToContentScript({
          action: 'executeAction',
          actionType: 'TYPE',
          id: parseInt(typeMatch[1], 10),
          textValue: typeMatch[2]
        });
        await delay(2200);
        continue;
      }

      if (/SCROLL_DOWN/i.test(actionStr)) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => window.scrollBy(0, window.innerHeight * 0.7)
          });
        }
        await delay(1500);
        continue;
      }

      consecutiveErrors++;
      updateThinkingState(thinkingEl, 'I’m adjusting my plan and trying another route…');

      if (consecutiveErrors >= 3) break;
      await delay(800);
    }

    if (cancelAgent) {
      updateThinkingState(thinkingEl, 'Stopping…');
      await delay(200);
      await fadeOutAndRemove(thinkingEl);
      appendAIMessage('Stopped.', { className: 'message ai' });
      return;
    }

    if (isDone) {
      await delay(350);
      await fadeOutAndRemove(thinkingEl);

      const finalText = finalAnswer?.trim() || `### Done\nI finished: **${userGoal}**.`;
      appendAIMessage(finalText, { stream: true });
      return;
    }

    updateThinkingState(thinkingEl, lastVisibleThought || 'I couldn’t finish that task from here…');
    await delay(250);
    await fadeOutAndRemove(thinkingEl);

    appendAIMessage(
      `I couldn’t finish that task from the current page. Try guiding me to the right section or rephrasing the goal.`,
      { stream: true }
    );
  } catch (err) {
    console.error('Agent loop failed:', err);

    if (thinkingEl?.isConnected) {
      updateThinkingState(thinkingEl, 'I hit a snag while working on that…');
      await delay(250);
      await fadeOutAndRemove(thinkingEl);
    }

    appendAIMessage(`I ran into an error: ${err.message}`, {
      className: 'message ai'
    });
  } finally {
    activeAgentThinkingEl = null;
    try { await sendToContentScript({ action: 'removeMarkers' }); } catch (e) { }
    isAgentRunning = false;
    cancelAgent = false;
    agentModeButton.innerHTML = agentIconNormal;
  }
}

function streamText(fullText, container) {
  return new Promise((resolve) => {
    if (!fullText) {
      container.textContent = '';
      resolve();
      return;
    }

    let i = 0;
    let currentText = '';

    const interval = setInterval(() => {
      currentText += fullText.charAt(i);

      if (typeof marked !== 'undefined') {
        container.innerHTML = marked.parse(currentText);
      } else {
        container.textContent = currentText;
      }

      i++;
      scrollToBottom();

      if (i >= fullText.length) {
        clearInterval(interval);
        resolve();
      }
    }, 10);
  });
}