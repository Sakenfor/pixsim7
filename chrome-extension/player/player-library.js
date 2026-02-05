/**
 * Player Library - Local folder browser with thumbnail grid
 *
 * Uses File System Access API to bookmark folders and browse their contents.
 * Generates thumbnails for video/image files and allows clicking to play.
 */
(function() {
  'use strict';

  const { state, utils } = window.PXS7Player;
  const { showToast } = utils;

  const FOLDERS_DB_NAME = 'pxs7_library_folders';
  const FOLDERS_STORE_NAME = 'folders';
  const THUMBS_STORE_NAME = 'thumbnails';

  const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.m4v', '.ts', '.mts'];
  const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'];
  const THUMB_SIZE = 160;

  let foldersDb = null;
  let folders = []; // { id, name, handle }
  let currentFolderId = null;
  let currentFiles = []; // { name, handle, isVideo, isImage, thumbnail }
  let isScanning = false;

  // ===== IndexedDB for Folders =====
  async function openFoldersDb() {
    if (foldersDb) return foldersDb;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(FOLDERS_DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        foldersDb = request.result;
        resolve(foldersDb);
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(FOLDERS_STORE_NAME)) {
          db.createObjectStore(FOLDERS_STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(THUMBS_STORE_NAME)) {
          db.createObjectStore(THUMBS_STORE_NAME, { keyPath: 'key' });
        }
      };
    });
  }

  async function loadFolders() {
    try {
      const db = await openFoldersDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FOLDERS_STORE_NAME, 'readonly');
        const store = tx.objectStore(FOLDERS_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
          folders = request.result || [];
          resolve(folders);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('Failed to load folders:', e);
      return [];
    }
  }

  async function saveFolder(folder) {
    try {
      const db = await openFoldersDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FOLDERS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(FOLDERS_STORE_NAME);
        store.put(folder);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to save folder:', e);
    }
  }

  async function deleteFolder(folderId) {
    try {
      const db = await openFoldersDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FOLDERS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(FOLDERS_STORE_NAME);
        store.delete(folderId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to delete folder:', e);
    }
  }

  async function getCachedThumbnail(key) {
    try {
      const db = await openFoldersDb();
      return new Promise((resolve) => {
        const tx = db.transaction(THUMBS_STORE_NAME, 'readonly');
        const store = tx.objectStore(THUMBS_STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.data || null);
        request.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async function setCachedThumbnail(key, data) {
    try {
      const db = await openFoldersDb();
      return new Promise((resolve) => {
        const tx = db.transaction(THUMBS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(THUMBS_STORE_NAME);
        store.put({ key, data });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (e) {
      // Ignore cache errors
    }
  }

  // ===== File System Operations =====
  function generateFolderId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  async function addFolder() {
    if (!('showDirectoryPicker' in window)) {
      showToast('Folder access not supported in this browser', false);
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      const id = generateFolderId();
      const folder = { id, name: handle.name, handle };

      folders.push(folder);
      await saveFolder(folder);
      updateFolderSelect();
      selectFolder(id);
      showToast(`Added folder: ${handle.name}`, true);
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('Failed to add folder:', e);
        showToast('Failed to add folder', false);
      }
    }
  }

  async function removeCurrentFolder() {
    if (!currentFolderId) return;

    const folder = folders.find(f => f.id === currentFolderId);
    if (!folder) return;

    await deleteFolder(currentFolderId);
    folders = folders.filter(f => f.id !== currentFolderId);
    currentFolderId = null;
    currentFiles = [];

    updateFolderSelect();
    renderGrid();
    showToast(`Removed folder: ${folder.name}`, true);
  }

  async function selectFolder(folderId) {
    if (!folderId) {
      currentFolderId = null;
      currentFiles = [];
      renderGrid();
      return;
    }

    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    currentFolderId = folderId;

    // Check/request permission
    try {
      const permission = await folder.handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted') {
        const result = await folder.handle.requestPermission({ mode: 'read' });
        if (result !== 'granted') {
          showToast('Permission denied for folder', false);
          return;
        }
      }
    } catch (e) {
      showToast('Folder no longer accessible', false);
      return;
    }

    await scanFolder(folder);
  }

  async function scanFolder(folder) {
    if (isScanning) return;
    isScanning = true;

    const grid = document.getElementById('libraryGrid');
    const status = document.getElementById('libraryStatus');

    grid.innerHTML = '<div class="library-loading">Scanning folder...</div>';
    status.textContent = 'Scanning...';

    currentFiles = [];

    try {
      for await (const entry of folder.handle.values()) {
        if (entry.kind !== 'file') continue;

        const name = entry.name.toLowerCase();
        const isVideo = VIDEO_EXTENSIONS.some(ext => name.endsWith(ext));
        const isImage = IMAGE_EXTENSIONS.some(ext => name.endsWith(ext));

        if (isVideo || isImage) {
          currentFiles.push({
            name: entry.name,
            handle: entry,
            isVideo,
            isImage,
            thumbnail: null,
          });
        }
      }

      // Sort by name
      currentFiles.sort((a, b) => a.name.localeCompare(b.name));

      status.textContent = `${currentFiles.length} files`;
      renderGrid();

      // Generate thumbnails in background
      generateThumbnails(folder.id);
    } catch (e) {
      console.warn('Failed to scan folder:', e);
      grid.innerHTML = '<div class="library-empty">Failed to scan folder</div>';
      status.textContent = '';
    }

    isScanning = false;
  }

  async function generateThumbnails(folderId) {
    for (const file of currentFiles) {
      if (currentFolderId !== folderId) break; // Folder changed, stop

      const cacheKey = `${folderId}:${file.name}`;

      // Check cache first
      const cached = await getCachedThumbnail(cacheKey);
      if (cached) {
        file.thumbnail = cached;
        updateThumbnail(file);
        continue;
      }

      // Generate thumbnail
      try {
        const fileData = await file.handle.getFile();
        const url = URL.createObjectURL(fileData);

        if (file.isImage) {
          file.thumbnail = await generateImageThumbnail(url);
        } else if (file.isVideo) {
          file.thumbnail = await generateVideoThumbnail(url);
        }

        URL.revokeObjectURL(url);

        if (file.thumbnail) {
          await setCachedThumbnail(cacheKey, file.thumbnail);
          updateThumbnail(file);
        }
      } catch (e) {
        // Skip failed thumbnails
      }
    }
  }

  function generateImageThumbnail(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calculate aspect-fit dimensions
        const scale = Math.min(THUMB_SIZE / img.width, THUMB_SIZE / img.height);
        const w = img.width * scale;
        const h = img.height * scale;

        canvas.width = THUMB_SIZE;
        canvas.height = Math.round(THUMB_SIZE * 9 / 16);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);

        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function generateVideoThumbnail(url) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';

      video.onloadeddata = () => {
        // Seek to 1 second or 10% of duration
        video.currentTime = Math.min(1, video.duration * 0.1);
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = THUMB_SIZE;
        canvas.height = Math.round(THUMB_SIZE * 9 / 16);

        const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
        const w = video.videoWidth * scale;
        const h = video.videoHeight * scale;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);

        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };

      video.onerror = () => resolve(null);
      video.src = url;
    });
  }

  function updateThumbnail(file) {
    const grid = document.getElementById('libraryGrid');
    const item = grid.querySelector(`[data-name="${CSS.escape(file.name)}"]`);
    if (item && file.thumbnail) {
      const placeholder = item.querySelector('.library-item-placeholder');
      if (placeholder) {
        placeholder.outerHTML = `<img src="${file.thumbnail}" alt="">`;
      }
    }
  }

  // ===== UI =====
  function updateFolderSelect() {
    const select = document.getElementById('libraryFolderSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Select folder...</option>' +
      folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');

    if (currentFolderId) {
      select.value = currentFolderId;
    }
  }

  function renderGrid() {
    const grid = document.getElementById('libraryGrid');
    if (!grid) return;

    if (currentFiles.length === 0) {
      if (currentFolderId) {
        grid.innerHTML = '<div class="library-empty">No media files found</div>';
      } else {
        grid.innerHTML = `
          <div class="library-empty">
            <div style="font-size: 24px; margin-bottom: 8px;">📁</div>
            <div>Click + to add a folder</div>
          </div>
        `;
      }
      return;
    }

    grid.innerHTML = currentFiles.map(file => {
      const icon = file.isVideo ? '🎬' : '🖼';
      const thumbContent = file.thumbnail
        ? `<img src="${file.thumbnail}" alt="">`
        : `<div class="library-item-placeholder">${icon}</div>`;

      return `
        <div class="library-item" data-name="${escapeHtml(file.name)}" title="${escapeHtml(file.name)}">
          ${thumbContent}
          <div class="library-item-type">${icon}</div>
          <div class="library-item-name">${escapeHtml(file.name)}</div>
        </div>
      `;
    }).join('');

    // Add click handlers
    grid.querySelectorAll('.library-item').forEach(item => {
      item.addEventListener('click', () => playFile(item.dataset.name));
    });
  }

  async function playFile(fileName) {
    const file = currentFiles.find(f => f.name === fileName);
    if (!file) return;

    try {
      const fileData = await file.handle.getFile();
      const url = URL.createObjectURL(fileData);

      // Store handle for playlist persistence
      state.pendingFileHandle = file.handle;

      if (file.isImage) {
        window.PXS7Player.image?.loadImage(url, file.name);
      } else {
        window.PXS7Player.file?.handleVideoFile?.(fileData) ||
          window.PXS7Player.loadVideo?.(url, file.name);
      }
    } catch (e) {
      showToast('Failed to open file', false);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== Event Handlers =====
  function setupEventHandlers() {
    const addBtn = document.getElementById('libraryAddFolderBtn');
    const removeBtn = document.getElementById('libraryRemoveFolderBtn');
    const refreshBtn = document.getElementById('libraryRefreshBtn');
    const select = document.getElementById('libraryFolderSelect');

    if (addBtn) addBtn.addEventListener('click', addFolder);
    if (removeBtn) removeBtn.addEventListener('click', removeCurrentFolder);
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
      if (currentFolderId) {
        const folder = folders.find(f => f.id === currentFolderId);
        if (folder) scanFolder(folder);
      }
    });
    if (select) select.addEventListener('change', (e) => selectFolder(e.target.value));
  }

  // ===== Initialize =====
  async function init() {
    await loadFolders();
    updateFolderSelect();
    renderGrid();
    setupEventHandlers();
  }

  // Initialize when dockview is ready
  if (window.PXS7Player.dockviewReady) {
    init();
  } else {
    window.addEventListener('pxs7-dockview-ready', init, { once: true });
  }

  // Export
  window.PXS7Player.library = {
    addFolder,
    removeCurrentFolder,
    selectFolder,
    refresh: () => {
      if (currentFolderId) {
        const folder = folders.find(f => f.id === currentFolderId);
        if (folder) scanFolder(folder);
      }
    },
  };
})();
