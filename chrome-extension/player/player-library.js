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
  const PINS_STORE_NAME = 'pins';
  const PINNED_FOLDER_ID = '__pinned__';

  const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.m4v', '.ts', '.mts'];
  const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'];
  const THUMB_SIZE = 160;

  let foldersDb = null;
  let folders = []; // { id, name, handle }
  let pinnedItems = []; // { id, name, handle, type: 'folder'|'file', sourceFolderId, isVideo, isImage, thumbnail }
  let currentFolderId = null;
  let currentPath = []; // Stack of { name, handle } for subdirectory navigation
  let currentFiles = []; // { name, handle, isVideo, isImage, isFolder, thumbnail, pinned, pinId }
  let isScanning = false;
  let contextMenu = null;

  // ===== IndexedDB for Folders =====
  async function openFoldersDb() {
    if (foldersDb) return foldersDb;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(FOLDERS_DB_NAME, 2);
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
        if (!db.objectStoreNames.contains(PINS_STORE_NAME)) {
          db.createObjectStore(PINS_STORE_NAME, { keyPath: 'id' });
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

  // ===== Pinned Items =====
  async function loadPinnedItems() {
    try {
      const db = await openFoldersDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PINS_STORE_NAME, 'readonly');
        const store = tx.objectStore(PINS_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
          pinnedItems = request.result || [];
          resolve(pinnedItems);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('Failed to load pinned items:', e);
      return [];
    }
  }

  async function savePinnedItem(item) {
    try {
      const db = await openFoldersDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PINS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(PINS_STORE_NAME);
        store.put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to save pinned item:', e);
    }
  }

  async function deletePinnedItem(pinId) {
    try {
      const db = await openFoldersDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PINS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(PINS_STORE_NAME);
        store.delete(pinId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Failed to delete pinned item:', e);
    }
  }

  function generatePinId() {
    return 'pin_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  async function pinItem(file) {
    const pinId = generatePinId();
    const pinnedItem = {
      id: pinId,
      name: file.name,
      handle: file.handle,
      type: file.isFolder ? 'folder' : 'file',
      sourceFolderId: currentFolderId,
      sourcePath: [...currentPath],
      isVideo: file.isVideo || false,
      isImage: file.isImage || false,
      thumbnail: file.thumbnail || null,
    };

    pinnedItems.push(pinnedItem);
    await savePinnedItem(pinnedItem);
    showToast(`Pinned: ${file.name}`, true);

    // Update current view to show pin badge
    if (currentFolderId !== PINNED_FOLDER_ID) {
      file.pinned = true;
      file.pinId = pinId;
      renderGrid();
    }
    updateFolderSelect();
  }

  async function unpinItem(pinId) {
    const item = pinnedItems.find(p => p.id === pinId);
    if (!item) return;

    await deletePinnedItem(pinId);
    pinnedItems = pinnedItems.filter(p => p.id !== pinId);
    showToast(`Unpinned: ${item.name}`, true);

    if (currentFolderId === PINNED_FOLDER_ID) {
      // Refresh pinned view
      await showPinnedFolder();
    } else {
      // Update current view to remove pin badge
      const file = currentFiles.find(f => f.pinId === pinId);
      if (file) {
        file.pinned = false;
        file.pinId = null;
        renderGrid();
      }
    }
    updateFolderSelect();
  }

  function isItemPinned(name, handle) {
    return pinnedItems.find(p => p.name === name && p.sourceFolderId === currentFolderId);
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
      currentPath = [];
      currentFiles = [];
      updateBreadcrumb();
      renderGrid();
      return;
    }

    // Handle pinned folder
    if (folderId === PINNED_FOLDER_ID) {
      currentFolderId = PINNED_FOLDER_ID;
      currentPath = [];
      await showPinnedFolder();
      return;
    }

    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    currentFolderId = folderId;
    currentPath = []; // Reset path when selecting a new root folder

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

  async function showPinnedFolder() {
    const grid = document.getElementById('libraryGrid');
    const status = document.getElementById('libraryStatus');

    currentFiles = [];
    updateBreadcrumb();

    if (pinnedItems.length === 0) {
      grid.innerHTML = '<div class="library-empty">No pinned items<br><span style="font-size:9px;opacity:0.7">Right-click items to pin them</span></div>';
      status.textContent = '';
      return;
    }

    // Convert pinned items to currentFiles format
    const pinFolders = [];
    const pinFiles = [];

    for (const pin of pinnedItems) {
      const item = {
        name: pin.name,
        handle: pin.handle,
        isFolder: pin.type === 'folder',
        isVideo: pin.isVideo,
        isImage: pin.isImage,
        thumbnail: pin.thumbnail,
        pinned: true,
        pinId: pin.id,
        sourceFolderId: pin.sourceFolderId,
        sourcePath: pin.sourcePath,
      };

      if (pin.type === 'folder') {
        pinFolders.push(item);
      } else {
        pinFiles.push(item);
      }
    }

    pinFolders.sort((a, b) => a.name.localeCompare(b.name));
    pinFiles.sort((a, b) => a.name.localeCompare(b.name));
    currentFiles = [...pinFolders, ...pinFiles];

    const folderCount = pinFolders.length;
    const fileCount = pinFiles.length;
    const parts = [];
    if (folderCount > 0) parts.push(`${folderCount} folder${folderCount !== 1 ? 's' : ''}`);
    if (fileCount > 0) parts.push(`${fileCount} file${fileCount !== 1 ? 's' : ''}`);
    status.textContent = parts.join(', ') || 'Empty';

    renderGrid();
  }

  async function navigateToSubfolder(folderItem) {
    if (!currentFolderId) return;
    const folder = folders.find(f => f.id === currentFolderId);
    if (!folder) return;

    currentPath.push({ name: folderItem.name, handle: folderItem.handle });
    await scanFolder(folder, folderItem.handle);
  }

  async function navigateToBreadcrumb(index) {
    if (!currentFolderId) return;
    const folder = folders.find(f => f.id === currentFolderId);
    if (!folder) return;

    if (index < 0) {
      // Navigate to root
      currentPath = [];
      await scanFolder(folder);
    } else {
      // Navigate to specific path level
      currentPath = currentPath.slice(0, index + 1);
      const targetHandle = currentPath[currentPath.length - 1].handle;
      await scanFolder(folder, targetHandle);
    }
  }

  function updateBreadcrumb() {
    const breadcrumb = document.getElementById('libraryBreadcrumb');
    if (!breadcrumb) return;

    if (currentPath.length === 0) {
      breadcrumb.innerHTML = '';
      return;
    }

    const folder = folders.find(f => f.id === currentFolderId);
    const rootName = folder?.name || 'Root';

    let html = `<span class="library-breadcrumb-item" data-index="-1" title="${escapeHtml(rootName)}">${escapeHtml(rootName)}</span>`;

    currentPath.forEach((p, i) => {
      html += `<span class="library-breadcrumb-sep">›</span>`;
      html += `<span class="library-breadcrumb-item" data-index="${i}" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>`;
    });

    breadcrumb.innerHTML = html;

    // Add click handlers
    breadcrumb.querySelectorAll('.library-breadcrumb-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index, 10);
        navigateToBreadcrumb(index);
      });
    });
  }

  async function scanFolder(folder, dirHandle = null) {
    if (isScanning) return;
    isScanning = true;

    const grid = document.getElementById('libraryGrid');
    const status = document.getElementById('libraryStatus');

    grid.innerHTML = '<div class="library-loading">Scanning folder...</div>';
    status.textContent = 'Scanning...';

    currentFiles = [];
    const handleToScan = dirHandle || folder.handle;

    try {
      const subfolders = [];
      const files = [];

      for await (const entry of handleToScan.values()) {
        if (entry.kind === 'directory') {
          subfolders.push({
            name: entry.name,
            handle: entry,
            isFolder: true,
            isVideo: false,
            isImage: false,
            thumbnail: null,
          });
        } else if (entry.kind === 'file') {
          const name = entry.name.toLowerCase();
          const isVideo = VIDEO_EXTENSIONS.some(ext => name.endsWith(ext));
          const isImage = IMAGE_EXTENSIONS.some(ext => name.endsWith(ext));

          if (isVideo || isImage) {
            files.push({
              name: entry.name,
              handle: entry,
              isFolder: false,
              isVideo,
              isImage,
              thumbnail: null,
            });
          }
        }
      }

      // Sort folders and files separately, then combine (folders first)
      subfolders.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));
      currentFiles = [...subfolders, ...files];

      // Mark pinned items
      for (const file of currentFiles) {
        const pin = pinnedItems.find(p =>
          p.name === file.name &&
          p.sourceFolderId === currentFolderId &&
          p.sourcePath?.length === currentPath.length
        );
        if (pin) {
          file.pinned = true;
          file.pinId = pin.id;
        }
      }

      const folderCount = subfolders.length;
      const fileCount = files.length;
      const parts = [];
      if (folderCount > 0) parts.push(`${folderCount} folder${folderCount !== 1 ? 's' : ''}`);
      if (fileCount > 0) parts.push(`${fileCount} file${fileCount !== 1 ? 's' : ''}`);
      status.textContent = parts.join(', ') || 'Empty';

      updateBreadcrumb();
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
      if (file.isFolder) continue; // Skip folders

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

    const pinnedOption = pinnedItems.length > 0
      ? `<option value="${PINNED_FOLDER_ID}">📌 Pinned (${pinnedItems.length})</option>`
      : `<option value="${PINNED_FOLDER_ID}">📌 Pinned</option>`;

    select.innerHTML = '<option value="">Select folder...</option>' +
      pinnedOption +
      folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');

    if (currentFolderId) {
      select.value = currentFolderId;
    }
  }

  function renderGrid() {
    const grid = document.getElementById('libraryGrid');
    if (!grid) return;

    if (currentFiles.length === 0) {
      if (currentFolderId === PINNED_FOLDER_ID) {
        grid.innerHTML = '<div class="library-empty">No pinned items<br><span style="font-size:9px;opacity:0.7">Right-click items to pin them</span></div>';
      } else if (currentFolderId) {
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
      const pinBadge = file.pinned ? '<div class="pin-badge">📌</div>' : '';

      if (file.isFolder) {
        return `
          <div class="library-item folder" data-name="${escapeHtml(file.name)}" data-type="folder" title="${escapeHtml(file.name)}">
            ${pinBadge}
            <div class="library-item-placeholder">📁</div>
            <div class="library-item-name">${escapeHtml(file.name)}</div>
          </div>
        `;
      }

      const icon = file.isVideo ? '🎬' : '🖼';
      const thumbContent = file.thumbnail
        ? `<img src="${file.thumbnail}" alt="">`
        : `<div class="library-item-placeholder">${icon}</div>`;

      return `
        <div class="library-item" data-name="${escapeHtml(file.name)}" data-type="file" title="${escapeHtml(file.name)}">
          ${pinBadge}
          ${thumbContent}
          <div class="library-item-type">${icon}</div>
          <div class="library-item-name">${escapeHtml(file.name)}</div>
        </div>
      `;
    }).join('');

    // Add click handlers
    grid.querySelectorAll('.library-item').forEach(item => {
      item.addEventListener('click', () => {
        const name = item.dataset.name;
        const type = item.dataset.type;
        if (type === 'folder') {
          const folderItem = currentFiles.find(f => f.name === name && f.isFolder);
          if (folderItem) {
            if (currentFolderId === PINNED_FOLDER_ID) {
              // Navigate into pinned folder - need to set up context
              navigateIntoPinnedFolder(folderItem);
            } else {
              navigateToSubfolder(folderItem);
            }
          }
        } else {
          playFile(name);
        }
      });

      // Right-click for context menu
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const name = item.dataset.name;
        const file = currentFiles.find(f => f.name === name);
        if (file) showContextMenu(e.clientX, e.clientY, file);
      });
    });
  }

  async function navigateIntoPinnedFolder(folderItem) {
    // For pinned folders, we need to navigate into them using their source context
    const sourceFolder = folders.find(f => f.id === folderItem.sourceFolderId);
    if (!sourceFolder) {
      showToast('Source folder no longer available', false);
      return;
    }

    // Check permission
    try {
      const permission = await sourceFolder.handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted') {
        const result = await sourceFolder.handle.requestPermission({ mode: 'read' });
        if (result !== 'granted') {
          showToast('Permission denied for folder', false);
          return;
        }
      }
    } catch (e) {
      showToast('Folder no longer accessible', false);
      return;
    }

    // Switch to source folder and navigate to the pinned folder
    currentFolderId = folderItem.sourceFolderId;
    currentPath = folderItem.sourcePath ? [...folderItem.sourcePath] : [];
    currentPath.push({ name: folderItem.name, handle: folderItem.handle });

    document.getElementById('libraryFolderSelect').value = currentFolderId;
    await scanFolder(sourceFolder, folderItem.handle);
  }

  async function playFile(fileName) {
    const file = currentFiles.find(f => f.name === fileName);
    if (!file) return;

    try {
      const fileData = await file.handle.getFile();
      const url = URL.createObjectURL(fileData);

      // Store handle for playlist persistence
      state.pendingFileHandle = file.handle;

      // Build folder path for capture context
      const folderPath = buildCurrentFolderPath();

      if (file.isImage) {
        window.PXS7Player.image?.loadImage(url, file.name, folderPath);
      } else {
        state.currentVideoSourceFolder = folderPath;
        window.PXS7Player.file?.handleVideoFile?.(fileData) ||
          window.PXS7Player.loadVideo?.(url, file.name);
      }
    } catch (e) {
      showToast('Failed to open file', false);
    }
  }

  function buildCurrentFolderPath() {
    if (currentFolderId === PINNED_FOLDER_ID) {
      return 'Pinned';
    }

    const rootFolder = folders.find(f => f.id === currentFolderId);
    if (!rootFolder) return null;

    const parts = [rootFolder.name];
    for (const p of currentPath) {
      parts.push(p.name);
    }
    return parts.join('/');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== Context Menu =====
  function showContextMenu(x, y, file) {
    hideContextMenu();

    const menu = document.createElement('div');
    menu.className = 'library-context-menu';

    const isPinned = file.pinned;
    const inPinnedView = currentFolderId === PINNED_FOLDER_ID;

    if (isPinned) {
      const unpinEl = document.createElement('div');
      unpinEl.className = 'library-context-menu-item';
      unpinEl.innerHTML = '<span>📌</span><span>Unpin</span>';
      unpinEl.addEventListener('click', () => {
        hideContextMenu();
        unpinItem(file.pinId);
      });
      menu.appendChild(unpinEl);
    } else if (!inPinnedView) {
      const pinEl = document.createElement('div');
      pinEl.className = 'library-context-menu-item';
      pinEl.innerHTML = '<span>📌</span><span>Pin</span>';
      pinEl.addEventListener('click', () => {
        hideContextMenu();
        pinItem(file);
      });
      menu.appendChild(pinEl);
    }

    if (!file.isFolder) {
      const playItem = document.createElement('div');
      playItem.className = 'library-context-menu-item';
      playItem.innerHTML = '<span>▶</span><span>Play</span>';
      playItem.addEventListener('click', () => {
        hideContextMenu();
        playFile(file.name);
      });
      menu.appendChild(playItem);
    }

    // Position menu
    document.body.appendChild(menu);

    // Adjust position if menu goes off screen
    const rect = menu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 8;
    }
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - 8;
    }

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    contextMenu = menu;

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
  }

  function hideContextMenu() {
    if (contextMenu) {
      contextMenu.remove();
      contextMenu = null;
    }
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
      if (currentFolderId === PINNED_FOLDER_ID) {
        showPinnedFolder();
      } else if (currentFolderId) {
        const folder = folders.find(f => f.id === currentFolderId);
        if (folder) {
          const currentHandle = currentPath.length > 0
            ? currentPath[currentPath.length - 1].handle
            : null;
          scanFolder(folder, currentHandle);
        }
      }
    });
    if (select) select.addEventListener('change', (e) => selectFolder(e.target.value));
  }

  // ===== Initialize =====
  async function init() {
    await loadFolders();
    await loadPinnedItems();
    updateFolderSelect();
    updateBreadcrumb();
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
      if (currentFolderId === PINNED_FOLDER_ID) {
        showPinnedFolder();
      } else if (currentFolderId) {
        const folder = folders.find(f => f.id === currentFolderId);
        if (folder) {
          const currentHandle = currentPath.length > 0
            ? currentPath[currentPath.length - 1].handle
            : null;
          scanFolder(folder, currentHandle);
        }
      }
    },
  };
})();
