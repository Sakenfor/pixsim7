/**
 * Player Dockview - Panel layout management using dockview-core
 *
 * This module initializes dockview and moves existing DOM elements into panels.
 * Elements are moved (not cloned) so existing event listeners stay attached.
 */
import { DockviewComponent } from 'dockview-core';

(function() {
  'use strict';

  const LAYOUT_STORAGE_KEY = 'pxs7_player_dockview_layout';

  // Panel definitions - map panel IDs to their template element IDs
  const PANELS = {
    video: {
      id: 'video',
      title: 'Video',
      templateId: 'videoPanel',
    },
    playlist: {
      id: 'playlist',
      title: 'Playlist',
      templateId: 'playlistPanel',
    },
    controls: {
      id: 'controls',
      title: 'Controls',
      templateId: 'controlsPanel',
    },
  };

  // Store moved elements for panel recreation
  const panelElements = new Map();

  let dockview = null;
  let isLayoutLoading = false;

  // ===== Panel Content Factory =====
  function createPanelContent(panelId) {
    // Check if we already have this element stored
    if (panelElements.has(panelId)) {
      return panelElements.get(panelId);
    }

    const panelDef = PANELS[panelId];
    if (!panelDef) {
      console.warn(`Unknown panel: ${panelId}`);
      const placeholder = document.createElement('div');
      placeholder.textContent = `Unknown panel: ${panelId}`;
      return placeholder;
    }

    // Get the template element and move it (not clone)
    const template = document.getElementById(panelDef.templateId);
    if (!template) {
      console.warn(`Panel template not found: ${panelDef.templateId}`);
      const placeholder = document.createElement('div');
      placeholder.textContent = `Template not found: ${panelDef.templateId}`;
      return placeholder;
    }

    // Get the inner content (skip the template wrapper)
    const content = template.querySelector('.panel-content');
    if (content) {
      // Remove from template and make visible
      content.classList.remove('panel-template');
      panelElements.set(panelId, content);
      return content;
    }

    // Fallback: use the template itself
    template.classList.remove('panel-template');
    template.style.display = '';
    panelElements.set(panelId, template);
    return template;
  }

  // ===== Dockview Setup =====
  function initDockview() {
    const container = document.getElementById('dockviewContainer');
    if (!container) {
      console.error('[Dockview] Container not found');
      return;
    }

    // Create dockview instance
    // Constructor signature: DockviewComponent(container, options)
    dockview = new DockviewComponent(container, {
      createComponent: (options) => {
        const content = createPanelContent(options.id);
        return {
          element: content,
          init: () => {
            // Called when panel is initialized
          },
          dispose: () => {
            // Don't destroy the element - keep it for potential re-add
          },
        };
      },
      disableFloatingGroups: false,
      floatingGroupBounds: 'boundedWithinViewport',
    });

    // Apply dark theme
    container.classList.add('dockview-theme-dark');

    // Listen for layout changes to save
    dockview.onDidLayoutChange(() => {
      if (!isLayoutLoading) {
        saveLayout();
      }
    });

    // Try to load saved layout, or use default
    if (!loadLayout()) {
      createDefaultLayout();
    }

    // Signal that dockview is ready
    window.PXS7Player.dockviewReady = true;

    // Dispatch event for other modules
    window.dispatchEvent(new CustomEvent('pxs7-dockview-ready'));
  }

  // ===== Default Layout =====
  function createDefaultLayout() {
    // Main video panel (center, takes most space)
    dockview.addPanel({
      id: 'video',
      component: 'default',
      title: 'Video',
    });

    // Playlist panel (left sidebar)
    dockview.addPanel({
      id: 'playlist',
      component: 'default',
      title: 'Playlist',
      position: { referencePanel: 'video', direction: 'left' },
      initialWidth: 220,
    });

    // Controls panel (bottom)
    dockview.addPanel({
      id: 'controls',
      component: 'default',
      title: 'Controls',
      position: { referencePanel: 'video', direction: 'below' },
      initialHeight: 100,
    });
  }

  // ===== Layout Persistence =====
  function saveLayout() {
    if (!dockview) return;

    try {
      const layout = dockview.toJSON();
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch (e) {
      console.warn('Failed to save dockview layout:', e);
    }
  }

  function loadLayout() {
    if (!dockview) return false;

    try {
      const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!stored) return false;

      const layout = JSON.parse(stored);
      isLayoutLoading = true;
      dockview.fromJSON(layout);
      isLayoutLoading = false;
      return true;
    } catch (e) {
      console.warn('Failed to load dockview layout:', e);
      isLayoutLoading = false;
      return false;
    }
  }

  function resetLayout() {
    if (!dockview) return;

    localStorage.removeItem(LAYOUT_STORAGE_KEY);

    // Clear existing panels
    const panels = [...dockview.panels];
    panels.forEach(panel => {
      try {
        dockview.removePanel(panel);
      } catch (e) {
        // Ignore errors during cleanup
      }
    });

    createDefaultLayout();

    const { utils } = window.PXS7Player;
    utils?.showToast?.('Layout reset to default', true);
  }

  // ===== Panel API =====
  function getPanel(panelId) {
    if (!dockview) return null;
    return dockview.getPanel(panelId);
  }

  function showPanel(panelId) {
    const panel = getPanel(panelId);
    if (panel) {
      panel.api.setActive();
    } else {
      // Panel doesn't exist, re-add it
      const def = PANELS[panelId];
      if (def) {
        dockview.addPanel({
          id: panelId,
          component: 'default',
          title: def.title,
        });
      }
    }
  }

  function hidePanel(panelId) {
    const panel = getPanel(panelId);
    if (panel) {
      dockview.removePanel(panel);
    }
  }

  function togglePanel(panelId) {
    const panel = getPanel(panelId);
    if (panel) {
      dockview.removePanel(panel);
    } else {
      showPanel(panelId);
    }
  }

  function isPanelOpen(panelId) {
    return !!getPanel(panelId);
  }

  // ===== Settings Integration =====
  function setupResetLayoutCheckbox() {
    const checkbox = document.getElementById('resetLayoutCheck');
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          resetLayout();
          checkbox.checked = false;
        }
      });
    }
  }

  // ===== View Menu =====
  function setupViewMenu() {
    const btn = document.getElementById('viewMenuBtn');
    const dropdown = document.getElementById('viewMenuDropdown');
    if (!btn || !dropdown) return;

    // Toggle dropdown
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
      if (!dropdown.classList.contains('hidden')) {
        updateViewMenuChecks();
      }
    });

    // Close on outside click
    document.addEventListener('click', () => {
      dropdown.classList.add('hidden');
    });

    // Handle menu options
    dropdown.querySelectorAll('.view-menu-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const panelId = option.dataset.panel;
        const action = option.dataset.action;

        if (panelId) {
          togglePanel(panelId);
          updateViewMenuChecks();
        } else if (action === 'reset') {
          resetLayout();
          dropdown.classList.add('hidden');
        }
      });
    });
  }

  function updateViewMenuChecks() {
    const videoCheck = document.getElementById('viewCheckVideo');
    const playlistCheck = document.getElementById('viewCheckPlaylist');
    const controlsCheck = document.getElementById('viewCheckControls');

    if (videoCheck) {
      videoCheck.classList.toggle('hidden', !isPanelOpen('video'));
    }
    if (playlistCheck) {
      playlistCheck.classList.toggle('hidden', !isPanelOpen('playlist'));
    }
    if (controlsCheck) {
      controlsCheck.classList.toggle('hidden', !isPanelOpen('controls'));
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initDockview();
      setupResetLayoutCheckbox();
      setupViewMenu();
    });
  } else {
    initDockview();
    setupResetLayoutCheckbox();
    setupViewMenu();
  }

  // ===== Export =====
  window.PXS7Player = window.PXS7Player || {};
  window.PXS7Player.dockview = {
    getApi: () => dockview,
    getPanel,
    showPanel,
    hidePanel,
    togglePanel,
    isPanelOpen,
    resetLayout,
    saveLayout,
    loadLayout,
    PANELS,
  };
})();
