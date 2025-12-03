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

  // Export to global namespace
  window.PXS7.utils = {
    showToast,
    closeMenus,
    positionMenu,
    setupOutsideClick,
    sendMessageWithTimeout,
  };

})();
