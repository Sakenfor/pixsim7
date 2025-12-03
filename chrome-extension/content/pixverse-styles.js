/**
 * Pixverse Styles Module
 *
 * CSS constants and styling for Pixverse preset buttons.
 */

window.PXS7 = window.PXS7 || {};

(function() {
  'use strict';

  // Class names
  const BTN_GROUP_CLASS = 'pxs7-group';
  const BTN_CLASS = 'pxs7-btn';
  const MENU_CLASS = 'pxs7-menu';

  // Unified dark theme colors
  const COLORS = {
  bg: '#1f2937',
  bgHover: '#374151',
  border: '#4b5563',
  text: '#e5e7eb',
  textMuted: '#9ca3af',
  accent: '#a78bfa',      // purple - primary
  accentAlt: '#60a5fa',   // blue - login
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
};

const STYLE = `
  /* Button Group */
  .${BTN_GROUP_CLASS} {
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
    vertical-align: middle;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid ${COLORS.border};
    background: ${COLORS.bg};
  }

  /* Base Button */
  .${BTN_CLASS} {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 500;
    color: ${COLORS.textMuted};
    background: transparent;
    border: none;
    border-right: 1px solid ${COLORS.border};
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .${BTN_CLASS}:last-child {
    border-right: none;
  }
  .${BTN_CLASS}:hover {
    background: ${COLORS.bgHover};
    color: ${COLORS.text};
  }
  .${BTN_CLASS}:active {
    opacity: 0.8;
  }
  .${BTN_CLASS}.loading {
    opacity: 0.5;
    pointer-events: none;
  }

  /* Account Button */
  .${BTN_CLASS}--account {
    max-width: 260px;
    overflow: hidden;
  }
  .${BTN_CLASS}--account .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .${BTN_CLASS}--account .arrow {
    font-size: 8px;
    opacity: 0.6;
  }
  .${BTN_CLASS}--account .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .${BTN_CLASS}--account .dot.active { background: ${COLORS.success}; }
  .${BTN_CLASS}--account .dot.exhausted { background: ${COLORS.error}; }
  .${BTN_CLASS}--account .dot.error { background: ${COLORS.warning}; }
  .${BTN_CLASS}--account .dot.disabled { background: ${COLORS.textMuted}; }
  .${BTN_CLASS}--account.mismatch {
    background: rgba(251, 191, 36, 0.1);
  }
  .${BTN_CLASS}--account.mismatch .arrow {
    color: ${COLORS.warning};
  }

  /* Login Button */
  .${BTN_CLASS}--login {
    color: ${COLORS.accentAlt};
  }
  .${BTN_CLASS}--login:hover {
    background: rgba(96, 165, 250, 0.15);
  }

  /* Run Button */
  .${BTN_CLASS}--run {
    color: ${COLORS.accent};
  }
  .${BTN_CLASS}--run:hover {
    background: rgba(167, 139, 250, 0.15);
  }

  /* Dropdown Menu */
  .${MENU_CLASS} {
    position: fixed;
    z-index: 2147483647;
    background: ${COLORS.bg};
    border: 1px solid ${COLORS.border};
    border-radius: 8px;
    padding: 4px 0;
    min-width: 200px;
    max-width: 300px;
    max-height: 360px;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .${MENU_CLASS}__section {
    padding: 6px 10px 4px;
    font-size: 9px;
    font-weight: 600;
    color: ${COLORS.textMuted};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .${MENU_CLASS}__section::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${COLORS.border};
  }

  .${MENU_CLASS}__item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 7px 10px;
    text-align: left;
    background: transparent;
    border: none;
    color: ${COLORS.text};
    font-size: 12px;
    cursor: pointer;
    gap: 8px;
  }
  .${MENU_CLASS}__item:hover {
    background: ${COLORS.bgHover};
  }

  .${MENU_CLASS}__account {
    padding: 6px 10px;
    font-size: 11px;
  }
  .${MENU_CLASS}__account.selected {
    background: rgba(167, 139, 250, 0.12);
  }
  .${MENU_CLASS}__account.current {
    background: rgba(16, 185, 129, 0.1);
  }
  .${MENU_CLASS}__account-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .${MENU_CLASS}__account-dot.active { background: ${COLORS.success}; }
  .${MENU_CLASS}__account-dot.exhausted { background: ${COLORS.error}; }
  .${MENU_CLASS}__account-dot.error { background: ${COLORS.warning}; }
  .${MENU_CLASS}__account-dot.disabled { background: ${COLORS.textMuted}; }
  .${MENU_CLASS}__account-info {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
  .${MENU_CLASS}__account-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .${MENU_CLASS}__account-meta {
    font-size: 9px;
    color: ${COLORS.textMuted};
    margin-top: 1px;
  }
  .${MENU_CLASS}__account-badge {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .${MENU_CLASS}__account-badge--current {
    background: rgba(16, 185, 129, 0.2);
    color: ${COLORS.success};
  }
  .${MENU_CLASS}__account-badge--selected {
    background: rgba(167, 139, 250, 0.2);
    color: ${COLORS.accent};
  }
  .${MENU_CLASS}__account-credits {
    font-size: 10px;
    color: ${COLORS.textMuted};
    flex-shrink: 0;
  }

  .${MENU_CLASS}__divider {
    height: 1px;
    background: ${COLORS.border};
    margin: 4px 0;
  }

  .${MENU_CLASS}__empty {
    padding: 12px;
    text-align: center;
    color: ${COLORS.textMuted};
    font-size: 11px;
  }

  .${MENU_CLASS}__refresh {
    padding: 2px 6px;
    font-size: 10px;
    color: ${COLORS.textMuted};
    background: transparent;
    border: 1px solid ${COLORS.border};
    border-radius: 4px;
    cursor: pointer;
    margin-left: auto;
  }
  .${MENU_CLASS}__refresh:hover {
    background: ${COLORS.bgHover};
    color: ${COLORS.text};
  }

  /* Toast */
  .pxs7-toast {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483648;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    color: white;
  }
  .pxs7-toast--success {
    background: #065f46;
    border: 1px solid ${COLORS.success};
  }
  .pxs7-toast--error {
    background: #7f1d1d;
    border: 1px solid ${COLORS.error};
  }
`;

  let styleInjected = false;

  function injectStyle() {
    if (styleInjected) return;
    const existing = document.getElementById('pxs7-style');
    if (existing) { styleInjected = true; return; }
    const style = document.createElement('style');
    style.id = 'pxs7-style';
    style.textContent = STYLE;
    (document.head || document.documentElement).appendChild(style);
    styleInjected = true;
  }

  // Export to global namespace
  window.PXS7.styles = {
    BTN_GROUP_CLASS,
    BTN_CLASS,
    MENU_CLASS,
    COLORS,
    STYLE,
    injectStyle
  };

})();
