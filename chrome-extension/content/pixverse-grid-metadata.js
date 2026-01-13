/**
 * Pixverse Grid - Metadata Popup
 * Shows asset details, generation info, and source images
 */

(function() {
  'use strict';

  window.PXS7 = window.PXS7 || {};

  // Access dependencies dynamically (they may not be ready at load time)
  const getUtils = () => window.PXS7.utils || {};
  const getColors = () => window.PXS7.styles?.COLORS || {};

  // Debug
  let DEBUG = false;
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get({ debugImagePicker: false, debugAll: false }, (result) => {
      DEBUG = result.debugImagePicker || result.debugAll;
    });
  }
  const debugLog = (...args) => DEBUG && console.log('[PixSim7 Metadata]', ...args);

  const Z_INDEX_POPUP = 10002;

  // Reference to loadImageSrc (set by main module)
  let loadImageSrc = null;

  function setLoadImageSrc(fn) {
    loadImageSrc = fn;
  }

  // Helper to create an image row with proper HTTP proxying
  function createImageRow(url, label, onClick = null) {
    const COLORS = getColors();
    const imgRow = document.createElement('div');
    imgRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px;
      margin-bottom: 4px;
      background: ${COLORS.bgAlt};
      border-radius: 4px;
      cursor: pointer;
    `;

    const img = document.createElement('img');
    img.style.cssText = 'width: 32px; height: 32px; object-fit: cover; border-radius: 3px;';
    if (loadImageSrc) loadImageSrc(img, url);

    const span = document.createElement('span');
    span.style.cssText = `font-size: 10px; color: ${COLORS.textMuted}; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;
    span.textContent = label;

    imgRow.appendChild(img);
    imgRow.appendChild(span);

    if (onClick) {
      imgRow.title = 'Click to copy URL';
      imgRow.onclick = onClick;
    }

    return imgRow;
  }

  function showMetadataPopup(assetData, x, y) {
    const COLORS = getColors();
    const { sendMessageWithTimeout, showToast } = getUtils();

    // Remove any existing popup
    document.querySelectorAll('.pxs7-metadata-popup').forEach(p => p.remove());

    debugLog('Metadata popup data:', assetData);

    const popup = document.createElement('div');
    popup.className = 'pxs7-metadata-popup';
    popup.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      z-index: ${Z_INDEX_POPUP};
      background: ${COLORS.bg};
      border: 1px solid ${COLORS.border};
      border-radius: 8px;
      padding: 12px;
      min-width: 280px;
      max-width: 400px;
      max-height: 500px;
      overflow-y: auto;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 11px;
      color: ${COLORS.text};
    `;

    // Header with close button
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid ${COLORS.border};
    `;
    header.innerHTML = `
      <span style="font-weight: 600; font-size: 12px;">Asset Details</span>
      <button style="background: none; border: none; color: ${COLORS.textMuted}; cursor: pointer; font-size: 16px; padding: 0 4px;">×</button>
    `;
    header.querySelector('button').onclick = () => popup.remove();
    popup.appendChild(header);

    // Content container
    const content = document.createElement('div');
    popup.appendChild(content);

    // Helper to add a field
    const addField = (container, label, value, copyable = false) => {
      if (!value) return;
      const row = document.createElement('div');
      row.style.cssText = `margin-bottom: 8px;`;

      const labelEl = document.createElement('div');
      labelEl.style.cssText = `font-size: 10px; color: ${COLORS.textMuted}; margin-bottom: 2px;`;
      labelEl.textContent = label;
      row.appendChild(labelEl);

      const valueEl = document.createElement('div');
      valueEl.style.cssText = `
        word-break: break-word;
        ${copyable ? 'cursor: pointer;' : ''}
        ${typeof value === 'string' && value.length > 100 ? 'max-height: 80px; overflow-y: auto; padding-right: 4px;' : ''}
      `;
      valueEl.textContent = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;

      if (copyable) {
        valueEl.title = 'Click to copy';
        valueEl.addEventListener('click', async () => {
          await navigator.clipboard.writeText(String(value));
          if (showToast) showToast('Copied!', true);
        });
        valueEl.addEventListener('mouseenter', () => { valueEl.style.background = COLORS.hover; });
        valueEl.addEventListener('mouseleave', () => { valueEl.style.background = 'transparent'; });
      }
      row.appendChild(valueEl);
      container.appendChild(row);
    };

    // Format field name from snake_case or camelCase to Title Case
    const formatFieldName = (key) => {
      return key
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
    };

    // Format value based on type/key
    const formatValue = (key, value) => {
      if (value === null || value === undefined) return null;

      // Date fields
      if (key.includes('_at') || key.includes('At') || key === 'created' || key === 'updated') {
        const date = new Date(value);
        return isNaN(date) ? value : date.toLocaleString();
      }

      // Time fields (seconds)
      if (key.includes('time') && typeof value === 'number') {
        return `${value.toFixed(2)}s`;
      }

      // Boolean
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';

      // Objects - stringify
      if (typeof value === 'object') return JSON.stringify(value, null, 2);

      return String(value);
    };

    // Check if field should be copyable
    const isCopyable = (key) => {
      const copyableKeys = ['id', 'url', 'prompt', 'asset_id', 'assetId', 'generation_id', 'provider_asset_id'];
      return copyableKeys.some(k => key.toLowerCase().includes(k.toLowerCase()));
    };

    // Fields to skip (internal/uninteresting)
    const skipFields = new Set([
      'element', 'thumbnail_url', 'file_url', 'preview_url', 'remote_url',
      'fullUrl', 'thumbUrl', 'mediaType', 'generation', 'media_metadata'
    ]);

    // Priority fields to show first
    const priorityFields = [
      'prompt', 'final_prompt', 'model', 'aspect_ratio',
      'frame_time', 'source', 'source_url', 'source_filename',
      'created_at', 'id', 'asset_id', 'assetId', 'provider_asset_id',
      'source_generation_id'
    ];

    // Render metadata dynamically from data object
    const renderMetadata = (container, data, generation = null) => {
      container.innerHTML = '';
      let hasContent = false;

      // Collect all fields from multiple sources
      const allFields = new Map();

      // Helper to add field if not already present
      const collectField = (key, value, source = '') => {
        if (skipFields.has(key)) return;
        if (value === null || value === undefined || value === '') return;
        if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return;

        if (!allFields.has(key)) {
          allFields.set(key, { value, source });
        }
      };

      // Collect from generation
      if (generation) {
        collectField('prompt', generation.final_prompt, 'generation');
        if (generation.canonical_params) {
          Object.entries(generation.canonical_params).forEach(([k, v]) => collectField(k, v, 'generation'));
        }
        collectField('generation_id', generation.id, 'generation');
      }

      // Collect from data.generation
      if (data.generation) {
        collectField('prompt', data.generation.final_prompt, 'data.generation');
        if (data.generation.canonical_params) {
          Object.entries(data.generation.canonical_params).forEach(([k, v]) => collectField(k, v, 'data.generation'));
        }
      }

      // Collect from media_metadata (includes upload_context from captures)
      if (data.media_metadata) {
        Object.entries(data.media_metadata).forEach(([k, v]) => {
          if (k === 'customer_paths' && v?.prompt) {
            collectField('prompt', v.prompt, 'media_metadata');
          } else {
            collectField(k, v, 'media_metadata');
          }
        });
      }

      // Collect from upload_context directly if present
      if (data.upload_context) {
        Object.entries(data.upload_context).forEach(([k, v]) => collectField(k, v, 'upload_context'));
      }

      // Collect top-level asset fields
      Object.entries(data).forEach(([k, v]) => {
        if (typeof v !== 'object' || v === null) {
          collectField(k, v, 'asset');
        }
      });

      // Sort: priority fields first, then alphabetically
      const sortedKeys = [...allFields.keys()].sort((a, b) => {
        const aPriority = priorityFields.indexOf(a);
        const bPriority = priorityFields.indexOf(b);
        if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
        if (aPriority !== -1) return -1;
        if (bPriority !== -1) return 1;
        return a.localeCompare(b);
      });

      // Render fields
      for (const key of sortedKeys) {
        const { value } = allFields.get(key);
        const formatted = formatValue(key, value);
        if (formatted) {
          addField(container, formatFieldName(key), formatted, isCopyable(key));
          hasContent = true;
        }
      }

      // Source images if available
      const inputs = generation?.inputs || data.generation?.inputs;
      if (inputs && inputs.length > 0) {
        hasContent = true;
        const inputsLabel = document.createElement('div');
        inputsLabel.style.cssText = `font-size: 10px; color: ${COLORS.textMuted}; margin: 10px 0 4px;`;
        inputsLabel.textContent = `Source Images (${inputs.length})`;
        container.appendChild(inputsLabel);

        inputs.forEach((input, i) => {
          let assetRef = null;
          if (input.asset && typeof input.asset === 'string' && input.asset.startsWith('asset:')) {
            assetRef = input.asset.replace('asset:', '');
          }

          const url = input.url || input.thumbnail_url;
          const label = input.role || `Input ${i + 1}`;

          if (url) {
            const imgRow = createImageRow(url, label, async () => {
              await navigator.clipboard.writeText(url);
              if (showToast) showToast('URL copied', true);
            });
            container.appendChild(imgRow);
          } else if (assetRef) {
            const imgRow = document.createElement('div');
            imgRow.style.cssText = `
              display: flex; align-items: center; gap: 8px; padding: 4px;
              margin-bottom: 4px; background: ${COLORS.bgAlt}; border-radius: 4px; cursor: pointer;
            `;
            imgRow.innerHTML = `
              <div style="width: 32px; height: 32px; background: ${COLORS.hover}; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 10px;">⏳</div>
              <span style="font-size: 10px; color: ${COLORS.textMuted}; flex: 1;">${label} (asset:${assetRef})</span>
            `;
            (async () => {
              try {
                const assetRes = await sendMessageWithTimeout({ action: 'getAsset', assetId: assetRef }, 5000);
                if (assetRes?.success && assetRes.data) {
                  const fetchedUrl = assetRes.data.file_url || assetRes.data.preview_url || assetRes.data.remote_url;
                  if (fetchedUrl) {
                    const newImgRow = createImageRow(fetchedUrl, label, async () => {
                      await navigator.clipboard.writeText(fetchedUrl);
                      if (showToast) showToast('URL copied', true);
                    });
                    imgRow.replaceWith(newImgRow);
                  }
                }
              } catch (e) {
                debugLog('Failed to fetch source asset:', e);
              }
            })();
            container.appendChild(imgRow);
          }
        });
      }

      // No data notice
      if (!hasContent) {
        const notice = document.createElement('div');
        notice.style.cssText = `padding: 10px; text-align: center; color: ${COLORS.textMuted}; font-style: italic;`;
        notice.textContent = 'No metadata available';
        container.appendChild(notice);
      }
    };

    // Initial render
    renderMetadata(content, assetData);

    document.body.appendChild(popup);

    // Position adjustment
    const adjustPosition = () => {
      const rect = popup.getBoundingClientRect();
      if (rect.right > window.innerWidth - 10) {
        popup.style.left = Math.max(10, window.innerWidth - rect.width - 10) + 'px';
      }
      if (rect.bottom > window.innerHeight - 10) {
        popup.style.top = Math.max(10, window.innerHeight - rect.height - 10) + 'px';
      }
    };
    setTimeout(adjustPosition, 0);

    // Fetch full details
    const assetId = assetData.assetId || assetData.asset_id || assetData.id;
    if (assetId && sendMessageWithTimeout) {
      (async () => {
        try {
          const assetRes = await sendMessageWithTimeout({ action: 'getAsset', assetId }, 5000);
          debugLog('[Metadata] Full asset response:', assetRes);

          if (assetRes?.success && assetRes.data) {
            const fullAsset = assetRes.data;
            let generation = null;

            if (fullAsset.source_generation_id) {
              const genRes = await sendMessageWithTimeout({
                action: 'getGeneration',
                generationId: fullAsset.source_generation_id
              }, 5000);
              debugLog('[Metadata] Generation response:', genRes);
              if (genRes?.success && genRes.data) {
                generation = genRes.data;
              }
            }

            renderMetadata(content, fullAsset, generation);
            setTimeout(adjustPosition, 0);
          }
        } catch (err) {
          console.warn('[PixSim7] Failed to fetch asset details:', err);
          renderMetadata(content, assetData, undefined);
        }
      })();
    }

    // Close on outside click
    const closeHandler = (e) => {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  }

  // Export
  window.PXS7.gridMetadata = {
    showMetadataPopup,
    setLoadImageSrc,
  };

})();
