/**
 * Player Playlist - Playlist panel for managing media items
 * Works with dockview for panel layout
 *
 * Supports File System Access API to persist local file handles
 * so users can re-open local files without re-selecting them.
 */
(function() {
  'use strict';

  const { elements, state, utils } = window.PXS7Player;
  const { showToast } = utils;

  const PLAYLIST_STORAGE_KEY = 'pxs7_player_playlist';
  const FILE_HANDLES_DB_NAME = 'pxs7_file_handles';
  const FILE_HANDLES_STORE_NAME = 'handles';

  // ===== IndexedDB for File Handles =====
  let fileHandlesDb = null;

  async function openFileHandlesDb() {
    if (fileHandlesDb) return fileHandlesDb;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(FILE_HANDLES_DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        fileHandlesDb = request.result;
        resolve(fileHandlesDb);
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(FILE_HANDLES_STORE_NAME)) {
          db.createObjectStore(FILE_HANDLES_STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  async function storeFileHandle(itemId, handle) {
    try {
      const db = await openFileHandlesDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FILE_HANDLES_STORE_NAME, 'readwrite');
        const store = tx.objectStore(FILE_HANDLES_STORE_NAME);
        store.put({ id: itemId, handle });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to store file handle:', e);
    }
  }

  async function getFileHandle(itemId) {
    try {
      const db = await openFileHandlesDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FILE_HANDLES_STORE_NAME, 'readonly');
        const store = tx.objectStore(FILE_HANDLES_STORE_NAME);
        const request = store.get(itemId);
        request.onsuccess = () => resolve(request.result?.handle || null);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('Failed to get file handle:', e);
      return null;
    }
  }

  async function deleteFileHandle(itemId) {
    try {
      const db = await openFileHandlesDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FILE_HANDLES_STORE_NAME, 'readwrite');
        const store = tx.objectStore(FILE_HANDLES_STORE_NAME);
        store.delete(itemId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to delete file handle:', e);
    }
  }

  // Check if File System Access API is available
  function hasFileSystemAccess() {
    return 'showOpenFilePicker' in window;
  }

  // ===== Storage =====
  function loadPlaylist() {
    try {
      const stored = localStorage.getItem(PLAYLIST_STORAGE_KEY);
      if (stored) {
        state.playlist = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load playlist:', e);
      state.playlist = [];
    }
  }

  function savePlaylist() {
    try {
      // Trim to max items
      if (state.playlist.length > state.PLAYLIST_MAX_ITEMS) {
        state.playlist = state.playlist.slice(-state.PLAYLIST_MAX_ITEMS);
      }
      localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(state.playlist));
    } catch (e) {
      console.warn('Failed to save playlist:', e);
    }
  }

  // ===== Thumbnail generation =====
  function generateThumbnail(source, isImage) {
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = state.THUMBNAIL_WIDTH;
        canvas.height = state.THUMBNAIL_HEIGHT;
        const ctx = canvas.getContext('2d');

        let srcWidth, srcHeight;
        if (isImage) {
          srcWidth = source.width;
          srcHeight = source.height;
        } else {
          srcWidth = source.videoWidth;
          srcHeight = source.videoHeight;
        }

        if (!srcWidth || !srcHeight) {
          resolve(null);
          return;
        }

        // Calculate aspect-fit dimensions
        const srcAspect = srcWidth / srcHeight;
        const thumbAspect = state.THUMBNAIL_WIDTH / state.THUMBNAIL_HEIGHT;

        let drawWidth, drawHeight, drawX, drawY;
        if (srcAspect > thumbAspect) {
          drawWidth = state.THUMBNAIL_WIDTH;
          drawHeight = state.THUMBNAIL_WIDTH / srcAspect;
          drawX = 0;
          drawY = (state.THUMBNAIL_HEIGHT - drawHeight) / 2;
        } else {
          drawHeight = state.THUMBNAIL_HEIGHT;
          drawWidth = state.THUMBNAIL_HEIGHT * srcAspect;
          drawX = (state.THUMBNAIL_WIDTH - drawWidth) / 2;
          drawY = 0;
        }

        // Fill with black background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, state.THUMBNAIL_WIDTH, state.THUMBNAIL_HEIGHT);

        // Draw media
        ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);

        // Convert to JPEG data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      } catch (e) {
        console.warn('Failed to generate thumbnail:', e);
        resolve(null);
      }
    });
  }

  // ===== Playlist operations =====
  function generateItemId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  async function addToPlaylist(name, url, isLocal, isImage, source, fileHandle = null) {
    if (!state.playlistEnabled) return;

    // Check for duplicate by URL (for remote) or name (for local)
    const existingIndex = state.playlist.findIndex(item => {
      if (isLocal) {
        return item.isLocal && item.name === name;
      }
      return item.url === url;
    });

    // Generate thumbnail
    let thumbnail = null;
    if (source) {
      thumbnail = await generateThumbnail(source, isImage);
    }

    const now = Date.now();
    const item = {
      id: generateItemId(),
      name: name || 'Untitled',
      url: isLocal ? null : url,
      isLocal: isLocal,
      isImage: isImage,
      hasFileHandle: !!fileHandle, // Flag to indicate we have a stored handle
      timestamp: now,
      thumbnail: thumbnail,
      sourcesite: state.currentVideoSourceSite || null,
      sourcefolder: state.currentVideoSourceFolder || null,
      lastPlayed: now,
    };

    if (existingIndex >= 0) {
      // Update existing item and move to end
      const existing = state.playlist[existingIndex];
      item.id = existing.id;
      item.timestamp = existing.timestamp;
      item.hasFileHandle = existing.hasFileHandle || !!fileHandle;
      state.playlist.splice(existingIndex, 1);
      // Delete old handle if we have a new one
      if (fileHandle) {
        await deleteFileHandle(existing.id);
      }
    }

    state.playlist.push(item);
    state.currentPlaylistItemId = item.id;

    // Store file handle if provided
    if (fileHandle && item.isLocal) {
      await storeFileHandle(item.id, fileHandle);
      item.hasFileHandle = true;
    }

    savePlaylist();
    renderPlaylist();
  }

  async function removeFromPlaylist(itemId) {
    const index = state.playlist.findIndex(item => item.id === itemId);
    if (index >= 0) {
      const item = state.playlist[index];
      state.playlist.splice(index, 1);
      if (state.currentPlaylistItemId === itemId) {
        state.currentPlaylistItemId = null;
      }
      // Clean up file handle if exists
      if (item.hasFileHandle) {
        await deleteFileHandle(itemId);
      }
      savePlaylist();
      renderPlaylist();
    }
  }

  function clearPlaylist() {
    state.playlist = [];
    state.currentPlaylistItemId = null;
    savePlaylist();
    renderPlaylist();
    showToast('Playlist cleared', true);
  }

  async function selectPlaylistItem(itemId) {
    const item = state.playlist.find(i => i.id === itemId);
    if (!item) return;

    // Update last played
    item.lastPlayed = Date.now();
    state.currentPlaylistItemId = itemId;
    savePlaylist();
    renderPlaylist();

    if (item.isLocal) {
      // Try to use stored file handle first
      if (item.hasFileHandle) {
        const loaded = await tryLoadFromFileHandle(item);
        if (loaded) return;
      }
      // Fall back to file picker
      showToast('Select the file to re-open it', true);
      promptReOpenLocalFile(item);
      return;
    }

    if (!item.url) {
      showToast('No URL available for this item', false);
      return;
    }

    // Load the media
    if (item.isImage) {
      window.PXS7Player.image?.loadImage(item.url, item.name);
    } else {
      window.PXS7Player.loadVideo?.(item.url, item.name);
    }
  }

  async function tryLoadFromFileHandle(item) {
    try {
      const handle = await getFileHandle(item.id);
      if (!handle) {
        item.hasFileHandle = false;
        savePlaylist();
        return false;
      }

      // Request permission to read the file
      const permission = await handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted') {
        const requestResult = await handle.requestPermission({ mode: 'read' });
        if (requestResult !== 'granted') {
          showToast('Permission denied - use file picker instead', false);
          return false;
        }
      }

      // Read the file
      const file = await handle.getFile();
      const url = URL.createObjectURL(file);

      if (item.isImage) {
        window.PXS7Player.image?.loadImage(url, item.name);
      } else {
        // Use handleVideoFile to support conversion if needed
        window.PXS7Player.file?.handleVideoFile?.(file) ||
          window.PXS7Player.loadVideo?.(url, item.name);
      }

      showToast('Loaded from saved file handle', true);
      return true;
    } catch (e) {
      console.warn('Failed to load from file handle:', e);
      // Mark handle as invalid
      item.hasFileHandle = false;
      savePlaylist();
      await deleteFileHandle(item.id);
      return false;
    }
  }

  function promptReOpenLocalFile(item) {
    // Create a temporary file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = item.isImage ? 'image/*' : 'video/*,.avi,.mkv,.wmv,.flv,.mpeg,.mpg,.m4v,.3gp,.ts,.mts,.m2ts';

    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        // Update the playlist item and load the file
        if (item.isImage) {
          const url = URL.createObjectURL(file);
          window.PXS7Player.image?.loadImage(url, file.name);
        } else {
          window.PXS7Player.file?.handleVideoFile?.(file);
        }
      }
    };

    input.click();
  }

  // ===== UI =====
  function renderPlaylist() {
    if (!elements.playlistItems) return;

    if (state.playlist.length === 0) {
      elements.playlistItems.innerHTML = '<div class="playlist-empty">No items in playlist.<br>Open media to add.</div>';
      return;
    }

    // Render items in reverse order (newest first)
    const items = [...state.playlist].reverse();
    elements.playlistItems.innerHTML = items.map(item => {
      const isActive = item.id === state.currentPlaylistItemId;
      const typeIcon = item.isImage ? '🖼' : '🎬';
      // Show different badge for local files: saved (has handle) vs. needs re-select
      let localBadge = '';
      if (item.isLocal) {
        if (item.hasFileHandle) {
          localBadge = '<span style="color:#4ade80" title="Click to play - file access saved">● local</span>';
        } else {
          localBadge = '<span style="opacity:0.5" title="Click to re-select file">(local)</span>';
        }
      }
      const meta = item.sourcesite || item.sourcefolder || '';

      let thumbContent;
      if (item.thumbnail) {
        thumbContent = `<img src="${item.thumbnail}" alt="">`;
      } else {
        thumbContent = typeIcon;
      }

      return `
        <div class="playlist-item ${isActive ? 'active' : ''}" data-id="${item.id}">
          <div class="playlist-item-thumb">${thumbContent}</div>
          <div class="playlist-item-info">
            <div class="playlist-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            <div class="playlist-item-meta">${typeIcon} ${meta} ${localBadge}</div>
          </div>
          <button class="playlist-item-remove" data-id="${item.id}" title="Remove">x</button>
        </div>
      `;
    }).join('');

    // Add click handlers
    elements.playlistItems.querySelectorAll('.playlist-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('playlist-item-remove')) return;
        selectPlaylistItem(el.dataset.id);
      });
    });

    elements.playlistItems.querySelectorAll('.playlist-item-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromPlaylist(btn.dataset.id);
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function togglePanel() {
    // Use dockview to toggle the playlist panel
    window.PXS7Player.dockview?.togglePanel('playlist');
  }

  // ===== Event handlers =====
  function setupEventHandlers() {
    const clearBtn = elements.playlistClearBtn || document.getElementById('playlistClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (state.playlist.length === 0) {
          showToast('Playlist is empty', true);
          return;
        }
        clearPlaylist();
      });
    }
  }

  // ===== Initialize =====
  function init() {
    loadPlaylist();
    renderPlaylist();
    setupEventHandlers();
  }

  // Initialize when dockview is ready (elements are in place)
  if (window.PXS7Player.dockviewReady) {
    init();
  } else {
    window.addEventListener('pxs7-dockview-ready', init, { once: true });
  }

  // Export
  window.PXS7Player.playlist = {
    addToPlaylist,
    removeFromPlaylist,
    clearPlaylist,
    selectPlaylistItem,
    renderPlaylist,
    toggleSidebar: togglePanel,  // Alias for backward compatibility
    togglePanel,
    loadPlaylist,
    savePlaylist,
  };
})();
