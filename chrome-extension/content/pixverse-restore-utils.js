/**
 * Pixverse Restore Utilities
 * Shared functions for restoring model, aspect ratio, and prompts
 * Used by both page refresh (sessionStorage) and account switch (chrome.storage) flows
 */

(function() {
  'use strict';

  window.PXS7 = window.PXS7 || {};

  const DEBUG = localStorage.getItem('pxs7_debug') === 'true';
  const debugLog = (...args) => DEBUG && console.log('[PixSim7 Restore]', ...args);

  /**
   * Restore model selection
   * @param {string} modelName - The model name to restore
   * @param {Object} options - { retries, retryDelay, dropdownWait }
   * @returns {Promise<boolean>} - true if restored successfully
   */
  async function restoreModel(modelName, options = {}) {
    const { retries = 5, retryDelay = 400, dropdownWait = 800 } = options;

    if (!modelName) return false;

    const attempt = async (retriesLeft) => {
      const modelImg = document.querySelector('img[src*="asset/media/model/model-"]');
      const modelContainer = modelImg?.closest('div.cursor-pointer');

      if (!modelContainer) {
        debugLog('Model container not found, retries left:', retriesLeft);
        if (retriesLeft > 0) {
          await new Promise(r => setTimeout(r, retryDelay));
          return attempt(retriesLeft - 1);
        }
        return false;
      }

      // Check if already correct
      const currentModelSpan = modelContainer.querySelector('span.font-semibold, span[class*="font-semibold"]');
      if (currentModelSpan?.textContent?.trim() === modelName) {
        debugLog('Model already correct:', modelName);
        return true;
      }

      debugLog('Opening model selector to restore:', modelName);
      modelContainer.click();
      await new Promise(r => setTimeout(r, dropdownWait));

      // Search in multiple containers (dropdown may be a portal)
      const containers = [
        ...document.querySelectorAll('[class*="dropdown"]'),
        ...document.querySelectorAll('[class*="popup"]'),
        ...document.querySelectorAll('[class*="overlay"]'),
        ...document.querySelectorAll('[role="listbox"]'),
        ...document.querySelectorAll('[role="menu"]'),
        document.body
      ];

      for (const container of containers) {
        const modelOptions = container.querySelectorAll('img[src*="asset/media/model/model-"]');

        for (const optionImg of modelOptions) {
          // Skip small thumbnails by dimensions
          const imgRect = optionImg.getBoundingClientRect();
          if (imgRect.width < 50 || imgRect.height < 50) continue;

          // Also skip by class
          const imgClasses = optionImg.className || '';
          if (imgClasses.includes('w-11') || imgClasses.includes('w-10') || imgClasses.includes('w-8')) {
            continue;
          }

          // Find clickable parent
          let clickTarget = optionImg.closest('div.cursor-pointer, div[class*="cursor-pointer"]');
          if (!clickTarget) {
            clickTarget = optionImg.parentElement;
            let depth = 0;
            while (clickTarget && depth < 10) {
              if (clickTarget.className?.includes('cursor-pointer') ||
                  clickTarget.onclick ||
                  clickTarget.getAttribute('role') === 'option') {
                break;
              }
              clickTarget = clickTarget.parentElement;
              depth++;
            }
            if (depth >= 10 || clickTarget === document.body) clickTarget = null;
          }

          if (!clickTarget) continue;

          // Find model name text
          let optionText = null;
          const nameSelectors = [
            'span.font-semibold',
            'span[class*="font-semibold"]',
            'span[class*="text-"]',
            'div[class*="font-semibold"]',
            'p'
          ];
          for (const selector of nameSelectors) {
            const el = clickTarget.querySelector(selector);
            if (el?.textContent?.trim()) {
              optionText = el.textContent.trim();
              break;
            }
          }

          if (optionText === modelName) {
            debugLog('Found and clicking model:', modelName);
            clickTarget.click();
            return true;
          }
        }
      }

      debugLog('Model not found in dropdown, closing');
      document.body.click();
      return false;
    };

    return attempt(retries);
  }

  /**
   * Restore aspect ratio selection
   * @param {string} ratioText - The aspect ratio text to restore (e.g., "16:9")
   * @param {Object} options - { retries, retryDelay }
   * @returns {Promise<boolean>} - true if restored successfully
   */
  async function restoreAspectRatio(ratioText, options = {}) {
    const { retries = 3, retryDelay = 500 } = options;

    if (!ratioText) return false;

    const attempt = async (retriesLeft) => {
      const ratioButtons = document.querySelectorAll('div[class*="aspect-"][class*="cursor-pointer"]');

      for (const btn of ratioButtons) {
        if (btn.textContent?.trim() === ratioText) {
          // Check if already selected
          if (!btn.className.includes('bg-button-secondary-hover')) {
            debugLog('Clicking aspect ratio:', ratioText);
            btn.click();
          } else {
            debugLog('Aspect ratio already correct:', ratioText);
          }
          return true;
        }
      }

      if (retriesLeft > 0) {
        await new Promise(r => setTimeout(r, retryDelay));
        return attempt(retriesLeft - 1);
      }

      debugLog('Could not find aspect ratio:', ratioText);
      return false;
    };

    return attempt(retries);
  }

  /**
   * Restore prompts to textareas
   * @param {Object} prompts - Map of key -> prompt text
   * @param {Object} options - { retries, retryDelay }
   * @returns {Promise<number>} - Number of prompts restored
   */
  async function restorePrompts(prompts, options = {}) {
    const { retries = 3, retryDelay = 500 } = options;

    if (!prompts || Object.keys(prompts).length === 0) return 0;

    const attempt = async (retriesLeft) => {
      const textareas = document.querySelectorAll('textarea');
      if (textareas.length === 0) {
        if (retriesLeft > 0) {
          await new Promise(r => setTimeout(r, retryDelay));
          return attempt(retriesLeft - 1);
        }
        return 0;
      }

      let restored = 0;
      const promptKeys = Object.keys(prompts);
      const usedKeys = new Set();

      textareas.forEach((el, i) => {
        // Skip if already has content
        if (el.value && el.value.trim()) return;

        const key = el.id || el.name || el.placeholder || `textarea_${i}`;

        // Try exact key match first
        if (prompts[key] && !usedKeys.has(key)) {
          el.value = prompts[key];
          el.dispatchEvent(new Event('input', { bubbles: true }));
          usedKeys.add(key);
          restored++;
          return;
        }

        // Try partial key match
        for (const savedKey of promptKeys) {
          if (usedKeys.has(savedKey)) continue;
          if (key.includes(savedKey) || savedKey.includes(key)) {
            el.value = prompts[savedKey];
            el.dispatchEvent(new Event('input', { bubbles: true }));
            usedKeys.add(savedKey);
            restored++;
            return;
          }
        }

        // For main prompt area, try to find any long saved prompt
        const isMainPromptArea = (el.placeholder || '').toLowerCase().includes('describe');
        if (isMainPromptArea) {
          for (const savedKey of promptKeys) {
            if (usedKeys.has(savedKey)) continue;
            if (!savedKey.startsWith('textarea_') && prompts[savedKey].length > 20) {
              el.value = prompts[savedKey];
              el.dispatchEvent(new Event('input', { bubbles: true }));
              usedKeys.add(savedKey);
              restored++;
              return;
            }
          }
        }
      });

      if (restored > 0) {
        debugLog('Restored', restored, 'prompt(s)');
      }
      return restored;
    };

    return attempt(retries);
  }

  /**
   * Restore contenteditable elements
   * @param {Object} editables - Map of key -> HTML content
   * @returns {number} - Number of editables restored
   */
  function restoreContentEditables(editables) {
    if (!editables || Object.keys(editables).length === 0) return 0;

    let restored = 0;
    document.querySelectorAll('[contenteditable="true"]').forEach((el, i) => {
      if (el.textContent && el.textContent.trim()) return;
      const key = el.id || el.dataset.placeholder || `editable_${i}`;
      const ceKey = `ce_${key}`;
      if (editables[ceKey]) {
        el.innerHTML = editables[ceKey];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        restored++;
      }
    });
    return restored;
  }

  /**
   * Capture current model selection
   * @returns {string|null} - Model name or null
   */
  function captureModel() {
    const modelImg = document.querySelector('img[src*="asset/media/model/model-"]');
    const modelContainer = modelImg?.closest('div.cursor-pointer') || modelImg?.closest('div');
    const modelSpan = modelContainer?.querySelector('span.font-semibold, span[class*="font-semibold"]');
    return modelSpan?.textContent?.trim() || null;
  }

  /**
   * Capture current aspect ratio selection
   * @returns {string|null} - Aspect ratio text or null
   */
  function captureAspectRatio() {
    const selectedRatio = document.querySelector('div[class*="aspect-"][class*="bg-button-secondary-hover"]');
    return selectedRatio?.textContent?.trim() || null;
  }

  /**
   * Capture all textarea prompts
   * @returns {Object} - Map of key -> prompt text
   */
  function capturePrompts() {
    const prompts = {};
    document.querySelectorAll('textarea').forEach((el, i) => {
      if (el.value && el.value.trim()) {
        const key = el.id || el.name || el.placeholder || `textarea_${i}`;
        prompts[key] = el.value;
      }
    });
    return prompts;
  }

  /**
   * Capture all contenteditable elements
   * @returns {Object} - Map of key -> HTML content
   */
  function captureContentEditables() {
    const editables = {};
    document.querySelectorAll('[contenteditable="true"]').forEach((el, i) => {
      if (el.textContent && el.textContent.trim()) {
        const key = el.id || el.dataset.placeholder || `editable_${i}`;
        editables[`ce_${key}`] = el.innerHTML;
      }
    });
    return editables;
  }

  // Export
  window.PXS7.restoreUtils = {
    // Restore functions
    restoreModel,
    restoreAspectRatio,
    restorePrompts,
    restoreContentEditables,
    // Capture functions
    captureModel,
    captureAspectRatio,
    capturePrompts,
    captureContentEditables
  };

  debugLog('Restore utils loaded');
})();
