/**
 * Pixverse Dialogs Module
 *
 * Reusable custom dialog components to replace browser's alert/confirm/prompt
 */

(function() {
  'use strict';

  window.PXS7 = window.PXS7 || {};
  const { COLORS } = window.PXS7.styles || {};

  // Z-index for dialogs (highest priority)
  const Z_INDEX_DIALOG = 10002;

  // ===== Base Dialog =====

  /**
   * Create a base dialog container
   * @param {object} options - Dialog options
   * @returns {HTMLElement} dialog element
   */
  function createBaseDialog(options = {}) {
    const {
      title = '',
      icon = '',
      x = window.innerWidth / 2,
      y = window.innerHeight / 2,
      minWidth = '280px',
      maxWidth = '400px',
      className = 'pxs7-dialog',
    } = options;

    // Remove any existing dialogs of same class
    document.querySelectorAll(`.${className}`).forEach(d => d.remove());

    const dialog = document.createElement('div');
    dialog.className = className;
    dialog.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      z-index: ${Z_INDEX_DIALOG};
      background: ${COLORS.bg};
      border: 2px solid ${COLORS.accent};
      border-radius: 8px;
      padding: 16px;
      min-width: ${minWidth};
      max-width: ${maxWidth};
      box-shadow: 0 10px 40px rgba(0,0,0,0.7);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      color: ${COLORS.text};
      transform: translate(-50%, -50%);
    `;

    // Header (if title or icon provided)
    if (title || icon) {
      const header = document.createElement('div');
      header.style.cssText = `
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 12px;
        color: ${COLORS.accent};
      `;
      header.textContent = `${icon ? icon + ' ' : ''}${title}`;
      dialog.appendChild(header);
    }

    document.body.appendChild(dialog);

    // Position adjustment (keep on screen after measuring actual size)
    setTimeout(() => {
      const rect = dialog.getBoundingClientRect();
      let adjustedX = parseFloat(dialog.style.left);
      let adjustedY = parseFloat(dialog.style.top);

      if (rect.left < 10) {
        adjustedX = rect.width / 2 + 10;
        dialog.style.left = adjustedX + 'px';
      }
      if (rect.right > window.innerWidth - 10) {
        adjustedX = window.innerWidth - rect.width / 2 - 10;
        dialog.style.left = adjustedX + 'px';
      }
      if (rect.top < 10) {
        adjustedY = rect.height / 2 + 10;
        dialog.style.top = adjustedY + 'px';
      }
      if (rect.bottom > window.innerHeight - 10) {
        adjustedY = window.innerHeight - rect.height / 2 - 10;
        dialog.style.top = adjustedY + 'px';
      }
    }, 0);

    return dialog;
  }

  /**
   * Create a button for dialogs
   */
  function createDialogButton(options = {}) {
    const {
      label = 'Button',
      description = null,
      color = COLORS.accent,
      variant = 'primary', // 'primary', 'secondary', 'danger'
      onClick = () => {},
    } = options;

    const btn = document.createElement('button');

    // Style based on variant
    let bgColor = color;
    let borderColor = color;
    let textColor = 'white';

    if (variant === 'secondary') {
      bgColor = 'transparent';
      borderColor = COLORS.border;
      textColor = COLORS.textMuted;
    }

    btn.style.cssText = `
      width: 100%;
      padding: ${description ? '10px 12px' : '8px 12px'};
      font-size: 11px;
      text-align: ${description ? 'left' : 'center'};
      background: ${bgColor};
      border: 1px solid ${borderColor};
      border-radius: 6px;
      color: ${textColor};
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      flex-direction: column;
      gap: 2px;
    `;

    if (description) {
      const labelEl = document.createElement('div');
      labelEl.style.cssText = 'font-weight: 600; font-size: 12px;';
      labelEl.textContent = label;
      btn.appendChild(labelEl);

      const descEl = document.createElement('div');
      descEl.style.cssText = 'font-size: 10px; opacity: 0.9;';
      descEl.textContent = description;
      btn.appendChild(descEl);
    } else {
      btn.textContent = label;
      btn.style.fontWeight = variant === 'primary' ? '600' : '500';
    }

    btn.addEventListener('mouseenter', () => {
      if (variant === 'primary' || variant === 'danger') {
        btn.style.transform = 'scale(1.02)';
        btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      } else {
        btn.style.background = COLORS.hover;
      }
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = 'none';
      if (variant === 'secondary') {
        btn.style.background = 'transparent';
      }
    });

    btn.addEventListener('click', onClick);

    return btn;
  }

  /**
   * Close dialog on outside click
   */
  function setupOutsideClickClose(dialog, onClose = null) {
    const closeHandler = (e) => {
      if (!dialog.contains(e.target)) {
        dialog.remove();
        document.removeEventListener('mousedown', closeHandler);
        if (onClose) onClose();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }

  // ===== Alert Dialog =====

  /**
   * Show an alert dialog (replaces window.alert)
   * @param {string} message - Message to display
   * @param {object} options - Additional options
   */
  function showAlert(message, options = {}) {
    const {
      title = 'Notice',
      icon = 'ℹ️',
      x = window.innerWidth / 2,
      y = window.innerHeight / 2,
      buttonText = 'OK',
      onClose = null,
    } = options;

    const dialog = createBaseDialog({
      title,
      icon,
      x,
      y,
      className: 'pxs7-alert-dialog',
    });

    // Message
    const messageEl = document.createElement('div');
    messageEl.style.cssText = `
      margin-bottom: 16px;
      line-height: 1.4;
      color: ${COLORS.text};
      white-space: pre-wrap;
    `;
    messageEl.textContent = message;
    dialog.appendChild(messageEl);

    // OK button
    const btnContainer = document.createElement('div');
    const okBtn = createDialogButton({
      label: buttonText,
      variant: 'primary',
      onClick: () => {
        dialog.remove();
        if (onClose) onClose();
      }
    });
    btnContainer.appendChild(okBtn);
    dialog.appendChild(btnContainer);

    // Allow Enter key to close
    const keyHandler = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        dialog.remove();
        document.removeEventListener('keydown', keyHandler);
        if (onClose) onClose();
      }
    };
    document.addEventListener('keydown', keyHandler);

    // Focus the button
    setTimeout(() => okBtn.focus(), 0);
  }

  // ===== Confirm Dialog =====

  /**
   * Show a confirmation dialog (replaces window.confirm)
   * @param {string} message - Message to display
   * @param {object} options - Additional options
   * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
   */
  function showConfirm(message, options = {}) {
    const {
      title = 'Confirm',
      icon = '❓',
      x = window.innerWidth / 2,
      y = window.innerHeight / 2,
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      confirmColor = COLORS.accent,
      isDangerous = false, // If true, uses red color for confirm button
    } = options;

    return new Promise((resolve) => {
      const dialog = createBaseDialog({
        title,
        icon,
        x,
        y,
        className: 'pxs7-confirm-dialog',
      });

      // Message
      const messageEl = document.createElement('div');
      messageEl.style.cssText = `
        margin-bottom: 16px;
        line-height: 1.4;
        color: ${COLORS.text};
        white-space: pre-wrap;
      `;
      messageEl.textContent = message;
      dialog.appendChild(messageEl);

      // Buttons
      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

      const confirmBtn = createDialogButton({
        label: confirmText,
        variant: 'primary',
        color: isDangerous ? '#dc2626' : confirmColor,
        onClick: () => {
          dialog.remove();
          resolve(true);
        }
      });

      const cancelBtn = createDialogButton({
        label: cancelText,
        variant: 'secondary',
        onClick: () => {
          dialog.remove();
          resolve(false);
        }
      });

      btnContainer.appendChild(confirmBtn);
      btnContainer.appendChild(cancelBtn);
      dialog.appendChild(btnContainer);

      // Keyboard handling
      const keyHandler = (e) => {
        if (e.key === 'Enter') {
          dialog.remove();
          document.removeEventListener('keydown', keyHandler);
          resolve(true);
        } else if (e.key === 'Escape') {
          dialog.remove();
          document.removeEventListener('keydown', keyHandler);
          resolve(false);
        }
      };
      document.addEventListener('keydown', keyHandler);

      // Close on outside click (treat as cancel)
      setupOutsideClickClose(dialog, () => resolve(false));

      // Focus confirm button
      setTimeout(() => confirmBtn.focus(), 0);
    });
  }

  // ===== Delete Asset Dialog =====

  /**
   * Show delete asset confirmation dialog with DB/Provider options
   * @param {object} assetData - Asset data
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {function} onConfirm - Callback with (deleteFromProvider: boolean)
   */
  function showDeleteAssetDialog(assetData, x, y, onConfirm) {
    const dialog = createBaseDialog({
      title: 'Delete Asset',
      icon: '⚠️',
      x,
      y,
      className: 'pxs7-delete-confirm-dialog',
    });

    // Message
    const message = document.createElement('div');
    message.style.cssText = `
      margin-bottom: 16px;
      line-height: 1.4;
      color: ${COLORS.textSecondary};
    `;
    message.textContent = 'Choose how to delete this asset:';
    dialog.appendChild(message);

    // Button container
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

    // Delete from DB + Provider button (red, more prominent)
    const deleteAllBtn = createDialogButton({
      label: 'Delete from DB + Provider',
      description: 'Permanently removes from database and provider storage',
      color: '#dc2626',
      variant: 'danger',
      onClick: () => {
        dialog.remove();
        onConfirm(true);
      }
    });
    btnContainer.appendChild(deleteAllBtn);

    // Delete from DB only button (orange)
    const deleteDbBtn = createDialogButton({
      label: 'Delete from DB Only',
      description: 'Removes from database but keeps on provider',
      color: '#ea580c',
      variant: 'danger',
      onClick: () => {
        dialog.remove();
        onConfirm(false);
      }
    });
    btnContainer.appendChild(deleteDbBtn);

    // Cancel button
    const cancelBtn = createDialogButton({
      label: 'Cancel',
      variant: 'secondary',
      onClick: () => dialog.remove()
    });
    btnContainer.appendChild(cancelBtn);

    dialog.appendChild(btnContainer);

    // Close on outside click
    setupOutsideClickClose(dialog);
  }

  // ===== Multi-Choice Dialog =====

  /**
   * Show a dialog with multiple custom choices
   * @param {string} message - Message to display
   * @param {Array} choices - Array of {label, description?, value, color?, variant?}
   * @param {object} options - Additional options
   * @returns {Promise} - Resolves to the selected choice value, or null if cancelled
   */
  function showChoiceDialog(message, choices, options = {}) {
    const {
      title = 'Choose an option',
      icon = '❓',
      x = window.innerWidth / 2,
      y = window.innerHeight / 2,
      allowCancel = true,
      cancelText = 'Cancel',
    } = options;

    return new Promise((resolve) => {
      const dialog = createBaseDialog({
        title,
        icon,
        x,
        y,
        className: 'pxs7-choice-dialog',
      });

      // Message
      const messageEl = document.createElement('div');
      messageEl.style.cssText = `
        margin-bottom: 16px;
        line-height: 1.4;
        color: ${COLORS.text};
        white-space: pre-wrap;
      `;
      messageEl.textContent = message;
      dialog.appendChild(messageEl);

      // Buttons
      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

      // Add choice buttons
      choices.forEach((choice, index) => {
        const btn = createDialogButton({
          label: choice.label,
          description: choice.description || null,
          color: choice.color || COLORS.accent,
          variant: choice.variant || 'primary',
          onClick: () => {
            dialog.remove();
            resolve(choice.value !== undefined ? choice.value : index);
          }
        });
        btnContainer.appendChild(btn);
      });

      // Add cancel button if allowed
      if (allowCancel) {
        const cancelBtn = createDialogButton({
          label: cancelText,
          variant: 'secondary',
          onClick: () => {
            dialog.remove();
            resolve(null);
          }
        });
        btnContainer.appendChild(cancelBtn);
      }

      dialog.appendChild(btnContainer);

      // Close on outside click if cancel is allowed
      if (allowCancel) {
        setupOutsideClickClose(dialog, () => resolve(null));
      }

      // Keyboard handling (Escape to cancel)
      if (allowCancel) {
        const keyHandler = (e) => {
          if (e.key === 'Escape') {
            dialog.remove();
            document.removeEventListener('keydown', keyHandler);
            resolve(null);
          }
        };
        document.addEventListener('keydown', keyHandler);
      }
    });
  }

  // Export to global scope
  window.PXS7.dialogs = {
    showAlert,
    showConfirm,
    showDeleteAssetDialog,
    showChoiceDialog,
    createBaseDialog,
    createDialogButton,
  };

})();
