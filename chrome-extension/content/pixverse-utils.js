/**
 * Pixverse Utils Module
 *
 * Common UI utilities for toasts, menus, and positioning.
 */

window.PXS7 = window.PXS7 || {};

(function() {
  'use strict';

  // Import from styles module
  const MENU_CLASS = window.PXS7.styles?.MENU_CLASS || 'pxs7-menu';

  // ===== Toast Notifications =====

  function showToast(message, success = true) {
    document.querySelectorAll('.pxs7-toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = `pxs7-toast pxs7-toast--${success ? 'success' : 'error'}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  // ===== Menu Management =====

  function closeMenus() {
    document.querySelectorAll(`.${MENU_CLASS}`).forEach(m => m.remove());
  }

  function positionMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;

    // Adjust for viewport
    setTimeout(() => {
      const menuRect = menu.getBoundingClientRect();
      if (left + menuRect.width > window.innerWidth - 10) {
        left = window.innerWidth - menuRect.width - 10;
      }
      if (top + menuRect.height > window.innerHeight - 10) {
        top = rect.top - menuRect.height - 4;
      }
      menu.style.top = `${Math.max(10, top)}px`;
      menu.style.left = `${Math.max(10, left)}px`;
    }, 0);

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  function setupOutsideClick(menu, anchor) {
    const handler = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
        menu.remove();
        document.removeEventListener('mousedown', handler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
  }

  // ===== Message Helpers =====

  // Helper to add timeout to sendMessage
  function sendMessageWithTimeout(msg, timeoutMs = 3000) {
    return Promise.race([
      chrome.runtime.sendMessage(msg),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('sendMessage timeout')), timeoutMs)
      )
    ]);
  }

  // ===== URL Helpers =====

  /**
   * Normalize URL by removing query parameters
   * @param {string} url - URL to normalize
   * @returns {string} URL without query params
   */
  function normalizeUrl(url) {
    if (!url) return '';
    return url.split('?')[0];
  }

  /**
   * Extract image URL from a style attribute string
   * @param {string} styleString - CSS style string
   * @param {string} [domain] - Optional domain to match (default: media.pixverse.ai)
   * @returns {string|null} Extracted URL or null
   */
  function extractImageUrl(styleString, domain = 'media.pixverse.ai') {
    if (!styleString) return null;
    const regex = new RegExp(`url\\(["']?(https://${domain.replace('.', '\\.')}[^"')\\s]+)`, 'i');
    const match = styleString.match(regex);
    return match ? normalizeUrl(match[1]) : null;
  }

  // ===== DOM Helpers =====

  /**
   * Add hover effect listeners to an element
   * @param {HTMLElement} element - Element to add hover to
   * @param {string} [hoverBg] - Background color on hover (default: COLORS.bgHover)
   * @param {string} [normalBg] - Background color normally (default: transparent)
   */
  function addHoverEffect(element, hoverBg, normalBg = 'transparent') {
    const COLORS = window.PXS7.styles?.COLORS || {};
    const hoverColor = hoverBg || COLORS.bgHover || '#374151';
    element.addEventListener('mouseenter', () => element.style.background = hoverColor);
    element.addEventListener('mouseleave', () => element.style.background = normalBg);
  }

  /**
   * Wrap an async function with loading state on a button
   * @param {HTMLElement} button - Button element
   * @param {Function} asyncFn - Async function to execute
   * @param {string} [loadingText] - Text to show while loading (default: '...')
   * @returns {Promise} Result of asyncFn
   */
  async function withLoadingState(button, asyncFn, loadingText = '...') {
    button.classList.add('loading');
    const origContent = button.innerHTML;
    button.innerHTML = loadingText;
    try {
      return await asyncFn();
    } finally {
      button.classList.remove('loading');
      button.innerHTML = origContent;
    }
  }

  /**
   * Create a styled button element
   * @param {Object} options - Button options
   * @param {string} [options.text] - Button text
   * @param {string} [options.html] - Button innerHTML (alternative to text)
   * @param {string} [options.title] - Button title/tooltip
   * @param {Object} [options.styles] - CSS styles object
   * @param {string} [options.className] - CSS class name
   * @param {Function} [options.onClick] - Click handler
   * @param {boolean} [options.hover] - Add hover effect (default: true)
   * @returns {HTMLButtonElement}
   */
  function createButton(options = {}) {
    const COLORS = window.PXS7.styles?.COLORS || {};
    const btn = document.createElement('button');

    if (options.text) btn.textContent = options.text;
    if (options.html) btn.innerHTML = options.html;
    if (options.title) btn.title = options.title;
    if (options.className) btn.className = options.className;

    // Default styles
    const defaultStyles = {
      padding: '6px 12px',
      fontSize: '11px',
      background: 'transparent',
      border: 'none',
      color: COLORS.text || '#e5e7eb',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    };

    const mergedStyles = { ...defaultStyles, ...options.styles };
    Object.assign(btn.style, mergedStyles);

    if (options.onClick) {
      btn.addEventListener('click', options.onClick);
    }

    if (options.hover !== false) {
      addHoverEffect(btn, options.hoverBg);
    }

    return btn;
  }

  /**
   * Create a menu item button
   * @param {Object} options - Menu item options
   * @param {string} options.label - Item label
   * @param {string} [options.icon] - Icon HTML or text
   * @param {string} [options.title] - Tooltip
   * @param {Function} [options.onClick] - Click handler
   * @param {string} [options.color] - Text color
   * @returns {HTMLButtonElement}
   */
  function createMenuItem(options = {}) {
    const COLORS = window.PXS7.styles?.COLORS || {};
    return createButton({
      html: options.icon
        ? `<span style="opacity:0.6">${options.icon}</span><span>${options.label}</span>`
        : options.label,
      title: options.title,
      onClick: options.onClick,
      styles: {
        width: '100%',
        padding: '6px 12px',
        fontSize: '11px',
        textAlign: 'left',
        color: options.color || COLORS.text || '#e5e7eb',
      },
    });
  }

  /**
   * Create a menu divider
   * @param {string} [color] - Divider color
   * @returns {HTMLDivElement}
   */
  function createDivider(color) {
    const COLORS = window.PXS7.styles?.COLORS || {};
    const divider = document.createElement('div');
    divider.style.cssText = `height: 1px; background: ${color || COLORS.border || '#4b5563'}; margin: 4px 0;`;
    return divider;
  }

  /**
   * Ensure element stays within viewport bounds
   * @param {HTMLElement} element - Element to constrain
   * @param {number} [padding] - Padding from viewport edge (default: 10)
   */
  function ensureInViewport(element, padding = 10) {
    const rect = element.getBoundingClientRect();
    let { top, left } = rect;

    if (left + rect.width > window.innerWidth - padding) {
      left = window.innerWidth - rect.width - padding;
    }
    if (top + rect.height > window.innerHeight - padding) {
      top = window.innerHeight - rect.height - padding;
    }

    element.style.left = `${Math.max(padding, left)}px`;
    element.style.top = `${Math.max(padding, top)}px`;
  }

  // ===== Page State Capture =====

  /**
   * Capture current page state for restoration after account switch/reload.
   * Captures: URL, prompts, images, slot count, model, aspect ratio.
   * @returns {Object} Page state object
   */
  function capturePageState() {
    const pageState = {
      url: window.location.href,
      path: window.location.pathname,
    };

    // Capture prompt text from textareas
    const prompts = {};
    document.querySelectorAll('textarea').forEach((el, i) => {
      if (el.value && el.value.trim()) {
        const key = el.id || el.name || el.placeholder || `textarea_${i}`;
        prompts[key] = el.value;
      }
    });
    if (Object.keys(prompts).length > 0) {
      pageState.prompts = prompts;
      console.log('[PixSim7] Captured', Object.keys(prompts).length, 'prompt(s)');
    }

    // Capture images from upload containers
    const images = [];
    const seenUrls = new Set();

    const uploadInputs = Array.from(document.querySelectorAll('input[type="file"]'))
      .filter(input => {
        const accept = input.getAttribute('accept') || '';
        return accept.includes('image') || input.closest('.ant-upload');
      });

    uploadInputs.forEach((input, slotIndex) => {
      const container = input.closest('.ant-upload-wrapper') ||
                       input.closest('.ant-upload') ||
                       input.parentElement?.parentElement;
      if (!container) return;

      const parentWithId = input.closest('[id]');
      const containerId = parentWithId?.id || '';

      // Skip video containers
      if (containerId.includes('video')) return;

      // Look for images in this container
      let imageUrl = null;

      // Check img tags
      const img = container.querySelector('img[src*="media.pixverse.ai"], img[src*="aliyun"]');
      if (img?.src) {
        imageUrl = normalizeUrl(img.src);
      }

      // Check background-image styles
      if (!imageUrl) {
        const bgEl = container.querySelector('[style*="media.pixverse.ai"]');
        if (bgEl) {
          imageUrl = extractImageUrl(bgEl.getAttribute('style'));
        }
      }

      if (imageUrl && !seenUrls.has(imageUrl)) {
        seenUrls.add(imageUrl);
        images.push({ url: imageUrl, slot: slotIndex, containerId });
      }
    });

    if (images.length > 0) {
      pageState.images = images;
      console.log('[PixSim7] Captured', images.length, 'image(s)');
    }

    // Count image upload slots
    const imageSlotCount = uploadInputs.filter(input => {
      const parentWithId = input.closest('[id]');
      const containerId = parentWithId?.id || '';
      return containerId.includes('customer_img') && !containerId.includes('video');
    }).length;
    if (imageSlotCount > 0) {
      pageState.imageSlotCount = imageSlotCount;
      console.log('[PixSim7] Captured slot count:', imageSlotCount);
    }

    // Capture selected model
    const modelImg = document.querySelector('img[src*="asset/media/model/model-"]');
    if (modelImg) {
      const modelContainer = modelImg.closest('div');
      const modelNameSpan = modelContainer?.querySelector('span.font-semibold, span[class*="font-semibold"]');
      if (modelNameSpan?.textContent) {
        pageState.selectedModel = modelNameSpan.textContent.trim();
        console.log('[PixSim7] Captured model:', pageState.selectedModel);
      }
    }

    // Capture selected aspect ratio
    const ratioButtons = document.querySelectorAll('div[class*="aspect-"][class*="cursor-pointer"]');
    for (const btn of ratioButtons) {
      if (btn.className.includes('bg-button-secondary-hover')) {
        const ratioText = btn.textContent?.trim();
        if (ratioText && ratioText.includes(':')) {
          pageState.selectedAspectRatio = ratioText;
          console.log('[PixSim7] Captured aspect ratio:', ratioText);
          break;
        }
      }
    }

    return pageState;
  }

  /**
   * Save page state to chrome.storage for restoration after reload.
   * Uses storage module if available, falls back to direct storage.
   * @param {Object} pageState - State object from capturePageState()
   */
  async function savePageState(pageState) {
    if (window.PXS7?.storage?.savePendingPageState) {
      await window.PXS7.storage.savePendingPageState(pageState);
      console.log('[PixSim7] Saved page state via storage module');
    } else {
      // Fallback: save directly with same key as storage module
      await chrome.storage.local.set({
        pixsim7PendingPageState: { ...pageState, savedAt: Date.now() }
      });
      console.log('[PixSim7] Saved page state directly');
    }
  }

  // Export to global namespace
  window.PXS7.utils = {
    showToast,
    closeMenus,
    positionMenu,
    setupOutsideClick,
    sendMessageWithTimeout,
    // URL helpers
    normalizeUrl,
    extractImageUrl,
    // DOM helpers
    addHoverEffect,
    withLoadingState,
    createButton,
    createMenuItem,
    createDivider,
    ensureInViewport,
    // Page state
    capturePageState,
    savePageState,
  };

})();
