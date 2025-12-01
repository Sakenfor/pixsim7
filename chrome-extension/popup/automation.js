/**
 * Automation (presets/loops) module
 *
 * Handles preset and loop execution for accounts.
 */


function showAutomationToolbar(show) {
  const el = document.getElementById('automationToolbar');
  if (!el) return;
  el.classList.toggle('hidden', !show);
}

async function loadAutomationOptions() {
  try {
    // Backend now filters by provider_id, no need for client-side filtering!
    const providerId = currentProvider?.provider_id || null;

    const [presetsRes, loopsRes] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getPresets', providerId }),
      chrome.runtime.sendMessage({ action: 'getLoops', providerId }),
    ]);

    if (presetsRes.success) automationOptions.presets = presetsRes.data || [];
    if (loopsRes.success) automationOptions.loops = loopsRes.data || [];

    await populateAutomationSelects();
  } catch (e) {
    console.error('[Popup] Failed to load automation options', e);
  }
}

async function populateAutomationSelects() {
  const presetSelect = document.getElementById('presetSelect');
  const loopSelect = document.getElementById('loopSelect');
  if (!presetSelect || !loopSelect) return;

  // Preserve current selection (for within-session changes)
  const prevPreset = presetSelect.value;
  const prevLoop = loopSelect.value;

  presetSelect.innerHTML = '';
  loopSelect.innerHTML = '';

  // Filter out "snippets" type presets - those are for prompt building, not execution
  automationOptions.presets
    .filter(p => !p.type?.toLowerCase().includes('snippet'))
    .forEach(p => {
      const opt = document.createElement('option');
      opt.value = String(p.id);
      opt.textContent = p.name || `Preset #${p.id}`;
      presetSelect.appendChild(opt);
    });

  automationOptions.loops.forEach(l => {
    const opt = document.createElement('option');
    opt.value = String(l.id);
    opt.textContent = l.name || `Loop #${l.id}`;
    loopSelect.appendChild(opt);
  });

  // Try to restore from storage first, then fall back to session value
  try {
    const stored = await chrome.storage.local.get([PRESET_SELECTION_STORAGE_KEY, LOOP_SELECTION_STORAGE_KEY]);

    // Restore preset selection
    const savedPreset = stored[PRESET_SELECTION_STORAGE_KEY] || prevPreset;
    if (savedPreset) {
      const presetExists = Array.from(presetSelect.options).some(opt => opt.value === savedPreset);
      if (presetExists) {
        presetSelect.value = savedPreset;
      }
    }

    // Restore loop selection
    const savedLoop = stored[LOOP_SELECTION_STORAGE_KEY] || prevLoop;
    if (savedLoop) {
      const loopExists = Array.from(loopSelect.options).some(opt => opt.value === savedLoop);
      if (loopExists) {
        loopSelect.value = savedLoop;
      }
    }
  } catch (e) {
    console.warn('[Popup] Failed to restore automation selections:', e);
    // Fall back to session values
    if (prevPreset) presetSelect.value = prevPreset;
    if (prevLoop) loopSelect.value = prevLoop;
  }
}

async function executePresetForAccount(account) {
  const presetSelect = document.getElementById('presetSelect');
  const presetId = presetSelect && presetSelect.value ? parseInt(presetSelect.value, 10) : null;
  if (!presetId) {
    return showError('Select a preset in the toolbar');
  }

  // Get selected device from global selector
  const deviceSelect = document.getElementById('deviceSelect');
  const deviceId = deviceSelect?.value || null;

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'executePreset',
      presetId,
      accountId: account.id,
      deviceId: deviceId || undefined,
    });
    if (res.success) {
      showLastImport(`Queued preset '${res.data.preset_name}' for ${account.email}${deviceId ? ' on device' : ''}`);
      showToast('success', `Preset queued for ${account.email}`);
    } else {
      showError(res.error || 'Failed to queue preset');
    }
  } catch (e) {
    showError(`Error: ${e.message}`);
  }
}

async function executeLoopForAccount(account) {
  const loopSelect = document.getElementById('loopSelect');
  const loopId = loopSelect && loopSelect.value ? parseInt(loopSelect.value, 10) : null;
  if (!loopId) {
    return showError('Select a loop in the toolbar');
  }

  // Get selected device from global selector
  const deviceSelect = document.getElementById('deviceSelect');
  const deviceId = deviceSelect?.value || null;

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'executeLoopForAccount',
      loopId,
      accountId: account.id,
      deviceId: deviceId || undefined,
    });
    if (res.success) {
      showLastImport(`Queued loop preset '${res.data.preset_name}' for ${account.email}${deviceId ? ' on device' : ''}`);
      showToast('success', `Loop queued for ${account.email}`);
    } else {
      showError(res.error || 'Failed to queue loop execution');
    }
  } catch (e) {
    showError(`Error: ${e.message}`);
  }
}

// ===== Toasts =====


// Export main functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { executePresetForAccount, executeLoopForAccount, loadAutomationOptions };
}
