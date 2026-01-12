/**
 * Picker Panel - Main panel UI, drag, resize, minimize
 */
(function() {
  'use strict';

  window.PXS7 = window.PXS7 || {};
  window.PXS7.picker = window.PXS7.picker || {};

  const { COLORS } = window.PXS7.styles || {};
  const { closeMenus } = window.PXS7.utils || {};
  const { getAssets: getRecentlyUsedAssets } = window.PXS7.recentlyUsed || {};

  const { state, utils, scan, tabs } = window.PXS7.picker;
  const { debugLog, triggerPixverseDryRunSync, Z_INDEX_PICKER, Z_INDEX_PICKER_INACTIVE } = utils;
  const { scanPageForImages } = scan;
  const { renderTabContent } = tabs;

  const DEFAULT_WIDTH = '320px';
  const DEFAULT_HEIGHT = '480px';

  function showUnifiedImagePicker(activeTab = 'assets', loadAssets = null) {
    if (loadAssets) state.loadAssetsFunction = loadAssets;
    if (!loadAssets && state.loadAssetsFunction) loadAssets = state.loadAssetsFunction;

    document.querySelectorAll('.pxs7-restore-panel, .pxs7-image-picker').forEach(p => p.remove());
    if (closeMenus) closeMenus();

    const pageImages = scanPageForImages();
    const allRecent = new Set([...state.recentSiteImages, ...pageImages]);
    state.recentSiteImages = Array.from(allRecent);

    // Load saved state
    let savedState = {};
    try {
      savedState = JSON.parse(localStorage.getItem('pxs7_picker_state') || '{}');
    } catch (e) {}
    const savedPos = savedState.position || {};
    const savedSize = savedState.size || {};
    const savedMinimized = savedState.minimized || false;
    const panelWidth = savedSize.width || DEFAULT_WIDTH;
    const panelHeight = savedSize.height || DEFAULT_HEIGHT;

    // Bounds check
    const checkBounds = () => {
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const panelW = parseInt(panelWidth) || 320;
      const panelH = parseInt(panelHeight) || 480;
      const topVal = parseInt(savedPos.top) || 80;
      const leftVal = savedPos.left ? parseInt(savedPos.left) : null;
      const rightVal = savedPos.right ? parseInt(savedPos.right) : 20;
      if (leftVal !== null && (leftVal < -panelW + 50 || leftVal > screenW - 50)) return true;
      if (leftVal === null && (rightVal < -panelW + 50 || rightVal > screenW - 50)) return true;
      if (topVal < -panelH + 50 || topVal > screenH - 50) return true;
      return false;
    };
    const useDefaults = checkBounds();

    // Create panel
    const panel = document.createElement('div');
    panel.className = 'pxs7-image-picker';
    panel.style.cssText = `
      position: fixed;
      top: ${useDefaults ? '80px' : (savedPos.top || '80px')};
      ${useDefaults ? 'right: 20px;' : (savedPos.left ? `left: ${savedPos.left};` : `right: ${savedPos.right || '20px'};`)}
      z-index: ${Z_INDEX_PICKER};
      background: ${COLORS.bg}; border: 1px solid ${COLORS.border};
      border-radius: 8px;
      width: ${savedMinimized ? 'auto' : panelWidth};
      max-height: ${savedMinimized ? 'auto' : panelHeight};
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; flex-direction: column; overflow: hidden;
    `;
    state.activePickerPanel = panel;

    const resetPosition = () => {
      panel.style.top = '80px';
      panel.style.right = '20px';
      panel.style.left = 'auto';
      panel.style.width = DEFAULT_WIDTH;
      panel.style.maxHeight = DEFAULT_HEIGHT;
      localStorage.removeItem('pxs7_picker_state');
    };

    const saveState = () => {
      const data = {
        position: { top: panel.style.top, left: panel.style.left || null, right: panel.style.left ? null : panel.style.right },
        size: { width: panel.style.width, height: panel.style.maxHeight },
        minimized: panel.dataset.minimized === 'true',
      };
      localStorage.setItem('pxs7_picker_state', JSON.stringify(data));
    };

    // Resize observer
    let isUserResizing = false;
    let resizeTimeout = null;
    const resizeObserver = new ResizeObserver(() => {
      if (panel.dataset.minimized === 'true' || !isUserResizing) return;
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        panel.style.width = panel.offsetWidth + 'px';
        panel.style.maxHeight = panel.offsetHeight + 'px';
        saveState();
        isUserResizing = false;
      }, 500);
    });
    resizeObserver.observe(panel);

    const originalRemove = panel.remove.bind(panel);
    panel.remove = function() {
      resizeObserver.disconnect();
      originalRemove();
    };

    // Z-index management
    const lowerPriority = () => { if (panel.isConnected) panel.style.zIndex = Z_INDEX_PICKER_INACTIVE; };
    const raisePriority = () => { if (panel.isConnected) panel.style.zIndex = Z_INDEX_PICKER; };
    panel.addEventListener('mouseenter', raisePriority);
    panel.addEventListener('mousedown', raisePriority);
    document.addEventListener('mousedown', e => { if (!panel.contains(e.target)) lowerPriority(); });

    let isMinimized = savedMinimized;
    panel.dataset.minimized = isMinimized ? 'true' : 'false';

    // Header
    const header = document.createElement('div');
    header.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; cursor: move; background: rgba(0,0,0,0.2); border-radius: 8px 8px 0 0; user-select: none; flex-shrink: 0;`;

    const title = document.createElement('span');
    title.style.cssText = `font-size: 12px; font-weight: 600; color: ${COLORS.text};`;
    title.textContent = '🖼 Image Picker';
    header.appendChild(title);

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; gap: 8px;';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = '⌂';
    resetBtn.title = 'Reset position';
    resetBtn.style.cssText = `background: none; border: none; color: ${COLORS.textMuted}; font-size: 12px; cursor: pointer; padding: 0; width: 20px;`;
    resetBtn.addEventListener('click', resetPosition);
    btnGroup.appendChild(resetBtn);

    const minBtn = document.createElement('button');
    minBtn.textContent = isMinimized ? '+' : '−';
    minBtn.style.cssText = `background: none; border: none; color: ${COLORS.textMuted}; font-size: 16px; cursor: pointer; padding: 0; width: 20px;`;

    const syncBtn = document.createElement('button');
    syncBtn.textContent = 'Sync';
    syncBtn.title = 'Pixverse sync dry-run';
    syncBtn.style.cssText = `background: none; border: none; color: ${COLORS.textMuted}; font-size: 10px; cursor: pointer; padding: 0 4px;`;
    syncBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); triggerPixverseDryRunSync(); });
    btnGroup.appendChild(syncBtn);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `background: none; border: none; color: ${COLORS.textMuted}; font-size: 18px; cursor: pointer; padding: 0; width: 20px;`;
    closeBtn.addEventListener('click', () => { panel.remove(); state.activePickerPanel = null; });
    btnGroup.appendChild(minBtn);
    btnGroup.appendChild(closeBtn);
    header.appendChild(btnGroup);
    panel.appendChild(header);

    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = `position: absolute; bottom: 0; right: 0; width: 16px; height: 16px; cursor: se-resize; background: linear-gradient(135deg, transparent 50%, ${COLORS.border} 50%); border-radius: 0 0 8px 0;`;
    resizeHandle.style.display = isMinimized ? 'none' : 'block';

    // Panel body
    const panelBody = document.createElement('div');
    panelBody.style.cssText = `display: ${isMinimized ? 'none' : 'flex'}; flex-direction: column; flex: 1; overflow: hidden;`;

    minBtn.addEventListener('click', () => {
      isMinimized = !isMinimized;
      panel.dataset.minimized = isMinimized ? 'true' : 'false';
      panelBody.style.display = isMinimized ? 'none' : 'flex';
      resizeHandle.style.display = isMinimized ? 'none' : 'block';
      panel.style.maxHeight = isMinimized ? 'auto' : panelHeight;
      panel.style.width = isMinimized ? 'auto' : panelWidth;
      minBtn.textContent = isMinimized ? '+' : '−';
      saveState();
    });

    // Drag handling
    let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
    header.addEventListener('mousedown', e => {
      if ([minBtn, closeBtn, syncBtn, resetBtn].includes(e.target)) return;
      isDragging = true;
      dragOffsetX = e.clientX - panel.offsetLeft;
      dragOffsetY = e.clientY - panel.offsetTop;
      panel.style.transition = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const newLeft = Math.max(-panel.offsetWidth + 50, Math.min(window.innerWidth - 50, e.clientX - dragOffsetX));
      const newTop = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffsetY));
      panel.style.left = newLeft + 'px';
      panel.style.top = newTop + 'px';
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => {
      if (isDragging) { isDragging = false; panel.style.transition = ''; saveState(); }
    });
    header.addEventListener('dblclick', e => {
      if ([minBtn, closeBtn, syncBtn, resetBtn].includes(e.target)) return;
      resetPosition();
    });

    // Resize handling
    let isResizing = false, resizeStartX = 0, resizeStartY = 0, startWidth = 0, startHeight = 0;
    resizeHandle.addEventListener('mousedown', e => {
      isResizing = true;
      isUserResizing = true;
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;
      startWidth = panel.offsetWidth;
      startHeight = panel.offsetHeight;
      panel.style.transition = 'none';
      e.preventDefault();
      e.stopPropagation();
    });
    document.addEventListener('mousemove', e => {
      if (!isResizing) return;
      panel.style.width = Math.max(200, startWidth + (e.clientX - resizeStartX)) + 'px';
      panel.style.maxHeight = Math.max(150, startHeight + (e.clientY - resizeStartY)) + 'px';
    });
    document.addEventListener('mouseup', () => { if (isResizing) { isResizing = false; panel.style.transition = ''; } });
    panel.appendChild(resizeHandle);

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.style.cssText = `display: flex; border-bottom: 1px solid ${COLORS.border}; margin: 8px 12px 0;`;

    const recentlyUsedAssets = getRecentlyUsedAssets ? getRecentlyUsedAssets() : [];
    const tabDefs = [
      { id: 'page', label: 'Page', count: state.recentSiteImages.length },
      { id: 'recents', label: 'Recents', count: recentlyUsedAssets.length },
      { id: 'assets', label: 'Assets', count: state.assetsCache.length }
    ];

    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 10px 12px;';

    tabDefs.forEach(tab => {
      const tabBtn = document.createElement('button');
      tabBtn.dataset.tab = tab.id;
      tabBtn.style.cssText = `flex: 1; padding: 8px; font-size: 11px; font-weight: 600; background: transparent; border: none; border-bottom: 2px solid transparent; color: ${COLORS.textMuted}; cursor: pointer;`;
      tabBtn.innerHTML = `${tab.label} ${tab.count > 0 ? `<span style="opacity:0.6">(${tab.count})</span>` : ''}`;
      if (tab.id === activeTab) {
        tabBtn.style.color = COLORS.accent;
        tabBtn.style.borderBottomColor = COLORS.accent;
      }
      tabBtn.addEventListener('click', () => {
        tabBar.querySelectorAll('button').forEach(b => { b.style.color = COLORS.textMuted; b.style.borderBottomColor = 'transparent'; });
        tabBtn.style.color = COLORS.accent;
        tabBtn.style.borderBottomColor = COLORS.accent;
        renderTabContent(tab.id, contentContainer, panel, loadAssets);
      });
      tabBar.appendChild(tabBtn);
    });

    panelBody.appendChild(tabBar);
    panelBody.appendChild(contentContainer);
    panel.appendChild(panelBody);

    renderTabContent(activeTab, contentContainer, panel, loadAssets);
    document.body.appendChild(panel);
  }

  function showImageRestorePanel(images) {
    state.recentSiteImages = images;
    showUnifiedImagePicker('page');
  }

  // Export
  window.PXS7.picker.panel = {
    showUnifiedImagePicker,
    showImageRestorePanel,
  };
})();
