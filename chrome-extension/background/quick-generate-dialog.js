/**
 * Quick Generate Dialog
 *
 * Loaded via importScripts in background.js.
 * This function is injected into page context via chrome.scripting.executeScript
 * Exposes: showQuickGenerateDialog
 */

async function showQuickGenerateDialog(imageUrl, providerId) {
  const dialogId = 'pixsim7-quick-generate-dialog';
  if (document.getElementById(dialogId)) return;

  const overlay = document.createElement('div');
  overlay.id = dialogId;
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.75); z-index: 2147483647;
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: #1f2937; border-radius: 12px; padding: 24px;
    max-width: 500px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    border: 1px solid #374151;
  `;

  dialog.innerHTML = `
    <h3 style="margin: 0 0 16px; color: #f3f4f6; font-size: 18px; font-weight: 600;">⚡ Quick Generate Video</h3>
    <div style="margin-bottom: 16px;">
      <img src="${imageUrl}" style="max-width: 100%; max-height: 200px; border-radius: 6px; display: block; margin: 0 auto;" />
    </div>
    <div style="margin-bottom: 12px;">
      <label style="display: block; color: #d1d5db; font-size: 12px; margin-bottom: 6px; font-weight: 500;">
        Preset Template
        <button id="pixsim7-refresh-presets" style="margin-left: 8px; padding: 2px 6px; border: 1px solid #4b5563; border-radius: 4px; background: #374151; color: #d1d5db; cursor: pointer; font-size: 11px;">↻</button>
      </label>
      <select id="pixsim7-preset-select" style="width: 100%; padding: 8px; border: 1px solid #4b5563; border-radius: 6px; background: #111827; color: #f3f4f6; font-size: 13px;">
        <option value="">Custom Prompt</option>
      </select>
    </div>
    <div style="margin-bottom: 16px;">
      <label style="display: block; color: #d1d5db; font-size: 12px; margin-bottom: 6px; font-weight: 500;">Prompt (max 2048 chars)</label>
      <textarea id="pixsim7-prompt-input" maxlength="2048" placeholder="Describe how you want to animate this image..."
        style="width: 100%; min-height: 100px; padding: 10px; border: 1px solid #4b5563; border-radius: 6px;
               background: #111827; color: #f3f4f6; font-size: 14px; font-family: inherit; resize: vertical;"></textarea>
      <div style="text-align: right; color: #9ca3af; font-size: 11px; margin-top: 4px;">
        <span id="pixsim7-char-count">0</span> / 2048
      </div>
    </div>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button id="pixsim7-cancel-btn" style="padding: 10px 20px; border: 1px solid #4b5563; border-radius: 6px;
                background: transparent; color: #d1d5db; cursor: pointer; font-size: 14px; font-weight: 500;">Cancel</button>
      <button id="pixsim7-generate-btn" style="padding: 10px 20px; border: none; border-radius: 6px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; cursor: pointer; font-size: 14px; font-weight: 600;">Generate Video</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const input = dialog.querySelector('#pixsim7-prompt-input');
  const charCount = dialog.querySelector('#pixsim7-char-count');
  const cancelBtn = dialog.querySelector('#pixsim7-cancel-btn');
  const generateBtn = dialog.querySelector('#pixsim7-generate-btn');

  input.addEventListener('input', () => {
    charCount.textContent = input.value.length;
  });

  cancelBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  generateBtn.addEventListener('click', async () => {
    const prompt = input.value.trim();
    if (!prompt) {
      input.style.borderColor = '#ef4444';
      return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'quickGenerate',
        imageUrl,
        prompt,
        providerId
      });

      if (res && res.success) {
        // Show success toast
        const toast = document.createElement('div');
        toast.style.cssText = `
          position: fixed; bottom: 20px; right: 20px; z-index: 2147483648;
          background: #065f46; color: white; padding: 12px 20px; border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3); font-size: 14px; border: 1px solid #10b981;
        `;
        toast.textContent = EMOJI_STATES.VIDEO_STARTED;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        overlay.remove();
      } else {
        throw new Error(res?.error || 'Failed to generate');
      }
    } catch (e) {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate Video';
      const error = document.createElement('div');
      error.style.cssText = 'color: #ef4444; font-size: 12px; margin-top: 8px;';
      error.textContent = e.message || 'Generation failed';
      dialog.appendChild(error);
      setTimeout(() => error.remove(), 3000);
    }
  });

  // === PRESET LOADING ===
  const presetSelect = dialog.querySelector('#pixsim7-preset-select');
  const refreshBtn = dialog.querySelector('#pixsim7-refresh-presets');

  async function loadPresets() {
    presetSelect.innerHTML = '<option value="">Custom Prompt</option>';

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        {
          action: 'getQuickPromptTemplates',
          providerId: providerId || 'pixverse',
        },
        (res) => renderPresetOptions(res)
      );
    } else {
      renderPresetOptions({ success: true, data: getQuickGeneratePresets(providerId || 'pixverse') });
    }
  }

  function renderPresetOptions(res) {
    try {
      if (!res || !res.success || !Array.isArray(res.data)) {
        console.error('Preset load failed:', res?.error || 'Unknown error');
        return;
      }

      res.data.forEach((preset) => {
        if (!preset?.prompt) {
          return;
        }
        const opt = document.createElement('option');
        opt.value = preset.id || preset.name;
        opt.textContent = preset.name || 'Quick Prompt';
        opt.dataset.prompt = preset.prompt;
        presetSelect.appendChild(opt);
      });
    } catch (e) {
      console.error('Preset load failed:', e);
    }
  }

  loadPresets();
  refreshBtn.addEventListener('click', () => loadPresets());
  presetSelect.addEventListener('change', () => {
    const opt = presetSelect.options[presetSelect.selectedIndex];
    if (opt.dataset.prompt) {
      input.value = opt.dataset.prompt;
      charCount.textContent = input.value.length;
    }
  });

  input.focus();
}
