(function() {
  const BADGE_CLASS = 'pixsim7-img-badge';
  const MENU_CLASS = 'pixsim7-provider-menu';
  const TOAST_CLASS = 'pixsim7-toast';

  // ===== PixVerse Site Detection & ID Extraction =====

  function isPixverseSite() {
    return window.location.hostname.includes('pixverse.ai');
  }

  /**
   * Extract PixVerse asset UUID from media.pixverse.ai URLs
   * Example: https://media.pixverse.ai/pixverse%2Fi2i%2Fori%2Fb9c8fa2a-ff80-4fd6-a233-beae0b167b93.jpg
   * Returns: { uuid: 'b9c8fa2a-ff80-4fd6-a233-beae0b167b93', mediaType: 'i2i', variant: 'ori', numericId: null } or null
   */
  function extractPixverseAssetInfo(url, mediaElement = null) {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('pixverse.ai')) return null;

      // Decode URL-encoded path: pixverse%2Fi2i%2Fori%2Fuuid.ext -> pixverse/i2i/ori/uuid.ext
      const decodedPath = decodeURIComponent(parsed.pathname);

      let result = null;

      // Match pattern: /pixverse/<type>/<variant>/<uuid>.<ext>
      // Types seen: i2i (image-to-image), t2v (text-to-video), etc.
      const match = decodedPath.match(/\/pixverse\/([^\/]+)\/([^\/]+)\/([a-f0-9-]{36})\.[a-z]+$/i);
      if (match) {
        result = {
          uuid: match[3],
          mediaType: match[1], // e.g., 'i2i', 't2v'
          variant: match[2],   // e.g., 'ori', 'thumb'
          numericId: null,
        };
      }

      // Fallback: just find any UUID in the path
      if (!result) {
        const uuidMatch = decodedPath.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        if (uuidMatch) {
          result = { uuid: uuidMatch[1], mediaType: null, variant: null, numericId: null };
        }
      }

      // Try to extract numeric ID from parent <a> href (e.g., ?id=380571015745668)
      if (result && mediaElement) {
        const numericId = extractNumericIdFromElement(mediaElement);
        if (numericId) {
          result.numericId = numericId;
        }
      }

      return result;
    } catch (e) {
      // Invalid URL
    }
    return null;
  }

  /**
   * Extract numeric Pixverse ID from element's parent anchor or data attributes
   * Looks for patterns like ?id=380571015745668 in href or data-id attributes
   */
  function extractNumericIdFromElement(element) {
    if (!element) return null;

    // Helper to extract ID from an anchor element
    function getIdFromAnchor(anchor) {
      if (!anchor || anchor.tagName !== 'A' || !anchor.href) return null;
      try {
        const linkUrl = new URL(anchor.href);
        const idParam = linkUrl.searchParams.get('id');
        if (idParam && /^\d+$/.test(idParam)) {
          return idParam;
        }
      } catch {}
      return null;
    }

    // Walk up the DOM looking for an anchor with ?id= parameter (up to 20 levels)
    let el = element;
    for (let i = 0; i < 20 && el; i++) {
      // Check for data-id attributes (various naming conventions)
      const dataId = el.getAttribute?.('data-id')
        || el.getAttribute?.('data-video-id')
        || el.getAttribute?.('data-image-id')
        || el.getAttribute?.('data-asset-id');
      if (dataId && /^\d+$/.test(dataId)) {
        return dataId;
      }

      // Check if this element is an anchor with ?id=
      const idFromThis = getIdFromAnchor(el);
      if (idFromThis) return idFromThis;

      // Check sibling anchors (for cases where img and link are siblings)
      if (el.parentElement) {
        const siblingAnchors = el.parentElement.querySelectorAll(':scope > a[href*="id="]');
        for (const anchor of siblingAnchors) {
          const idFromSibling = getIdFromAnchor(anchor);
          if (idFromSibling) return idFromSibling;
        }
      }

      // Check for anchor descendants (for cases where the wrapper contains the link)
      const descendantAnchor = el.querySelector?.('a[href*="id="]');
      if (descendantAnchor) {
        const idFromDescendant = getIdFromAnchor(descendantAnchor);
        if (idFromDescendant) return idFromDescendant;
      }

      el = el.parentElement;
    }

    return null;
  }

  function isPixverseMediaUrl(url) {
    return url && url.includes('media.pixverse.ai');
  }

  const STYLE = `
    .${BADGE_CLASS} {
      position: fixed; z-index: 2147483646;
      background: rgba(17,24,39,0.92); color: #e5e7eb; font-size: 11px; line-height: 1;
      padding: 6px 8px; border-radius: 6px; cursor: pointer; opacity: 0.95;
      display: inline-flex; align-items: center; gap: 6px; user-select: none;
      box-shadow: 0 6px 18px rgba(0,0,0,.2); border: 1px solid rgba(55,65,81,.6);
      pointer-events: auto;
    }
    .${BADGE_CLASS}:hover { background: rgba(31,41,55,0.98); opacity: 1; }

    .${MENU_CLASS} { position: fixed; z-index: 2147483647; background: #111827; color: #e5e7eb; border: 1px solid #374151; border-radius: 6px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,.2); font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; pointer-events: auto; }
    .${MENU_CLASS} button { display: block; width: 100%; text-align: left; background: transparent; border: 0; color: inherit; padding: 8px 10px; font-size: 12px; cursor: pointer; }
    .${MENU_CLASS} button:hover { background: #1f2937; }

    .${TOAST_CLASS} { position: fixed; bottom: 16px; right: 16px; background: #111827; color: #e5e7eb; padding: 10px 12px; border-radius: 6px; border: 1px solid #374151; z-index: 2147483002; font-size: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.2); }
    .${TOAST_CLASS}.ok { background: #065f46; border-color: #10b981; }
    .${TOAST_CLASS}.err { background: #7f1d1d; border-color: #ef4444; }
  `;

  function injectStyle() {
    if (document.getElementById('pixsim7-img-style')) return;
    const st = document.createElement('style');
    st.id = 'pixsim7-img-style';
    st.textContent = STYLE;
    (document.head || document.documentElement).appendChild(st);
  }

  async function getSettings() {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'getSettings' });
      return res || {};
    } catch (e) { return {}; }
  }

  function showToast(text, ok = true) {
    try {
      const el = document.createElement('div');
      el.className = `${TOAST_CLASS} ${ok ? 'ok' : 'err'}`;
      el.textContent = text;
      document.documentElement.appendChild(el);
      setTimeout(() => el.remove(), 2500);
    } catch {}
  }

  function pickProvider(x, y, defProv) {
    return new Promise((resolve) => {
      const providers = window.__pixsim7_providers || [{ provider_id: 'pixverse', name: 'Pixverse' }];
      const menu = document.createElement('div');
      menu.className = MENU_CLASS;
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      providers.forEach(p => {
        const b = document.createElement('button');
        const pid = p.provider_id || p.id;
        b.textContent = `${p.name || pid}${pid === defProv ? ' (default)' : ''}`;
        b.addEventListener('click', () => { cleanup(); resolve(pid); });
        menu.appendChild(b);
      });
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => { cleanup(); resolve(null); });
      menu.appendChild(cancel);
      function cleanup() {
        document.removeEventListener('mousedown', onDoc);
        menu.remove();
      }
      function onDoc(ev) { if (!menu.contains(ev.target)) { cleanup(); resolve(null); } }
      document.addEventListener('mousedown', onDoc);
      document.documentElement.appendChild(menu);
    });
  }

  /**
   * Convert blob: or file: URLs to data URLs that can cross context boundaries
   * @param {string} url - Media URL
   * @param {boolean} isVideo - Whether this is a video
   * @param {HTMLImageElement|null} imgElement - Optional existing image element to use
   */
  async function resolveMediaUrl(url, isVideo = false, imgElement = null) {
    // Blob URLs need to be converted to data URLs since they're context-specific
    if (url.startsWith('blob:')) {
      try {
        console.log('[pxs7 badge] Converting blob URL to data URL...');
        const response = await fetch(url);
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Failed to read blob'));
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn('[pxs7 badge] Failed to convert blob URL:', e);
        throw new Error('Failed to convert blob URL: ' + e.message);
      }
    }

    // file:// URLs can't be fetched, use canvas to convert image to data URL
    if (url.startsWith('file://')) {
      if (isVideo) {
        throw new Error('Video upload from local files not yet supported');
      }
      try {
        console.log('[pxs7 badge] Converting file:// URL to data URL via canvas...');

        // Try to use the existing image element on the page first (already loaded)
        // This works better than creating a new Image() for file:// URLs
        let existingImg = imgElement || (currentImg && currentImg.src === url ? currentImg : null);

        // Fallback: find img on page with matching src (for Chrome's native file viewer)
        if (!existingImg) {
          const allImgs = document.querySelectorAll('img');
          for (const img of allImgs) {
            if (img.src === url && img.complete && img.naturalWidth > 0) {
              existingImg = img;
              console.log('[pxs7 badge] Found img via querySelectorAll');
              break;
            }
          }
        }

        return await new Promise((resolve, reject) => {
          const convertToDataUrl = (imgEl) => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = imgEl.naturalWidth || imgEl.width;
              canvas.height = imgEl.naturalHeight || imgEl.height;
              console.log('[pxs7 badge] Canvas size:', canvas.width, 'x', canvas.height);
              const ctx = canvas.getContext('2d');
              ctx.drawImage(imgEl, 0, 0);
              // Try PNG first, fall back to JPEG for large images
              let dataUrl;
              try {
                dataUrl = canvas.toDataURL('image/png');
              } catch (taintedErr) {
                console.error('[pxs7 badge] toDataURL failed (tainted canvas?):', taintedErr);
                reject(new Error('Canvas tainted - cannot export local file image. Try dragging the image to the PixSim7 app instead.'));
                return;
              }
              // If PNG is too large (>5MB), use JPEG
              if (dataUrl.length > 5 * 1024 * 1024) {
                dataUrl = canvas.toDataURL('image/jpeg', 0.92);
              }
              console.log('[pxs7 badge] Data URL generated, length:', dataUrl.length);
              resolve(dataUrl);
            } catch (e) {
              console.error('[pxs7 badge] Canvas conversion error:', e);
              reject(new Error('Canvas conversion failed: ' + e.message));
            }
          };

          console.log('[pxs7 badge] existingImg:', existingImg, 'complete:', existingImg?.complete, 'naturalWidth:', existingImg?.naturalWidth);

          if (existingImg && existingImg.complete && existingImg.naturalWidth > 0) {
            // Use existing loaded image directly
            console.log('[pxs7 badge] Using existing image element');
            convertToDataUrl(existingImg);
          } else {
            // Create new image - don't set crossOrigin for file:// URLs
            console.log('[pxs7 badge] Creating new Image() for:', url);
            const img = new Image();
            img.onload = () => {
              console.log('[pxs7 badge] New image loaded:', img.naturalWidth, 'x', img.naturalHeight);
              convertToDataUrl(img);
            };
            img.onerror = (e) => {
              console.error('[pxs7 badge] Image load error:', e, 'src was:', url);
              reject(new Error('Failed to load local image'));
            };
            img.src = url;
          }
        });
      } catch (e) {
        console.warn('[pxs7 badge] Failed to convert file:// URL:', e);
        throw new Error('Failed to convert local file: ' + e.message);
      }
    }

    // HTTP/HTTPS and data URLs can be passed through
    return url;
  }

  /**
   * Capture current frame from a video element as a data URL
   * @param {HTMLVideoElement} video - The video element to capture from
   * @returns {string|null} - Data URL of the captured frame, or null on error
   */
  function captureVideoFrame(video) {
    try {
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
        console.warn('[pxs7] Cannot capture frame: video not ready');
        return null;
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to PNG data URL (high quality)
      const dataUrl = canvas.toDataURL('image/png');
      console.log('[pxs7] Captured video frame:', canvas.width, 'x', canvas.height);
      return dataUrl;
    } catch (e) {
      console.error('[pxs7] Failed to capture video frame:', e);
      // This can fail due to CORS restrictions on cross-origin videos
      if (e.name === 'SecurityError') {
        showToast('Cannot capture frame: video is cross-origin protected', false);
      }
      return null;
    }
  }

  async function upload(mediaUrl, providerId, isVideo = false, options = {}) {
    try {
      const settings = await getSettings();
      if (!settings.pixsim7Token) { showToast('Login to PixSim7 first', false); return; }

      // Convert blob/file URLs to data URLs first
      // Pass the current image element for file:// URLs so we can use it directly
      const imgElement = !isVideo ? currentImg : null;
      const resolvedUrl = await resolveMediaUrl(mediaUrl, isVideo, imgElement);

      const provider = providerId || settings.defaultUploadProvider || 'pixverse';
      const res = await chrome.runtime.sendMessage({
        action: 'uploadMediaFromUrl',
        mediaUrl: resolvedUrl,
        providerId: provider,
        // For backwards compatibility, callers that don't pass options will
        // get the default backend behavior (ensure_asset=True). Callers can
        // override via options.ensureAsset.
        ensureAsset: options.ensureAsset,
      });
      if (res && res.success) {
        const providerSucceeded = res.providerSucceeded;
        const kindLabel = isVideo ? 'Video' : 'Image';
        if (providerSucceeded === false) {
          showToast(`${kindLabel} saved to PixSim7; provider upload failed. See gallery for details.`, false);
        } else {
          showToast(`${kindLabel} saved to PixSim7 (${provider})`, true);
        }
      } else {
        showToast(res?.error || 'Upload failed', false);
      }
    } catch (e) { showToast(e.message || 'Upload error', false); }
  }

  /**
   * Get current PixVerse session account ID from storage
   */
  async function getPixverseSessionAccountId() {
    try {
      const stored = await chrome.storage.local.get('pixsim7ProviderSessions');
      const sessions = stored.pixsim7ProviderSessions || {};
      const accountId = sessions.pixverse?.accountId || null;
      console.log('[pxs7 badge] Session lookup:', { sessions, accountId });
      return accountId;
    } catch (e) {
      console.warn('[pxs7 badge] Session lookup error:', e);
      return null;
    }
  }

  /**
   * Sync a PixVerse asset to PixSim7 (no re-upload, just register by ID)
   */
  async function syncPixverseAsset(mediaUrl, assetInfo, isVideo = false) {
    try {
      const settings = await getSettings();
      if (!settings.pixsim7Token) { showToast('Login to PixSim7 first', false); return; }

      // Get current PixVerse session account if available
      const accountId = await getPixverseSessionAccountId();

      // Prefer numeric ID over UUID (Pixverse API works better with numeric IDs)
      const assetId = assetInfo.numericId || assetInfo.uuid;

      const res = await chrome.runtime.sendMessage({
        action: 'syncPixverseAsset',
        mediaUrl,
        pixverseAssetId: assetId,
        pixverseAssetUuid: assetInfo.uuid, // Always pass UUID for reference
        pixverseMediaType: assetInfo.mediaType,
        isVideo,
        accountId,
      });

      if (res && res.success) {
        const kindLabel = isVideo ? 'Video' : 'Image';
        if (res.existed) {
          showToast(`${kindLabel} already synced`, true);
        } else {
          showToast(`${kindLabel} synced to PixSim7`, true);
        }
      } else {
        showToast(res?.error || 'Sync failed', false);
      }
    } catch (e) { showToast(e.message || 'Sync error', false); }
  }

  /**
   * Extract the last frame of a Pixverse video via the backend and upload it.
   * Works by syncing the video first (to get asset ID), then calling extract-frame.
   */
  async function extractLastFrameAndUpload(video) {
    const mediaSrc = video.src;
    const onPixverse = isPixverseSite();
    const assetInfo = isPixverseMediaUrl(mediaSrc) ? extractPixverseAssetInfo(mediaSrc, video) : null;

    if (!onPixverse || !assetInfo) {
      showToast('Last frame extraction is only supported for Pixverse videos', false);
      return;
    }

    showToast('Syncing & extracting last frame...', true);
    try {
      const accountId = await getPixverseSessionAccountId();
      const syncRes = await chrome.runtime.sendMessage({
        action: 'syncPixverseAsset',
        mediaUrl: mediaSrc,
        pixverseAssetId: assetInfo.numericId || assetInfo.uuid,
        pixverseAssetUuid: assetInfo.uuid,
        pixverseMediaType: assetInfo.mediaType,
        isVideo: true,
        accountId,
      });
      if (!syncRes || !syncRes.success) {
        showToast(syncRes?.error || 'Sync failed', false);
        return;
      }
      const videoAssetId = syncRes.data?.asset_id;
      if (!videoAssetId) {
        showToast('Could not determine asset ID after sync', false);
        return;
      }
      const res = await chrome.runtime.sendMessage({
        action: 'extractLastFrameAndUpload',
        videoAssetId,
        providerId: 'pixverse',
      });
      if (res && res.success) {
        showToast('Last frame uploaded to Pixverse', true);
      } else {
        showToast(res?.error || 'Failed to extract/upload last frame', false);
      }
    } catch (err) {
      console.error('[pxs7] Failed to extract last frame:', err);
      showToast('Failed to extract last frame', false);
    }
  }

  let badgeEl = null;
  let currentImg = null;
  let currentVideo = null;
  let defProvCache = 'pixverse';

  function ensureBadge() {
    if (badgeEl) return badgeEl;
    badgeEl = document.createElement('div');
    badgeEl.className = BADGE_CLASS;
    badgeEl.innerHTML = '<span style="font-size:12px">⬆</span><span>PixSim7</span>';
    document.documentElement.appendChild(badgeEl);
    badgeEl.style.display = 'none';

    // Click to upload or sync
    // Shift+Click on video = capture current frame as image
    // Ctrl/Cmd+Click = force create asset even if provider fails
    badgeEl.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const hasVideo = !!(currentVideo && currentVideo.src);
      const hasImage = !!(currentImg && currentImg.src);

      // Shift+Click on video: capture frame as image
      if (e.shiftKey && !e.altKey && hasVideo && currentVideo) {
        const frameDataUrl = captureVideoFrame(currentVideo);
        if (frameDataUrl) {
          showToast('Capturing frame...', true);
          const forceAsset = !!(e.ctrlKey || e.metaKey);
          await upload(frameDataUrl, defProvCache, false, { ensureAsset: forceAsset });
        } else {
          showToast('Failed to capture frame', false);
        }
        return;
      }

      // Alt+Click on video: extract last frame via backend and upload to provider
      if (e.altKey && hasVideo && currentVideo) {
        await extractLastFrameAndUpload(currentVideo);
        return;
      }

      const isVideo = hasVideo;
      const src = isVideo ? currentVideo.src : (currentImg && currentImg.src);
      if (!src) return;

      // On PixVerse site with identifiable PixVerse media: sync instead of upload
      const onPixverse = isPixverseSite();
      const mediaElement = isVideo ? currentVideo : currentImg;
      const assetInfo = isPixverseMediaUrl(src) ? extractPixverseAssetInfo(src, mediaElement) : null;

      if (onPixverse && assetInfo) {
        await syncPixverseAsset(src, assetInfo, isVideo);
      } else {
        // Ctrl/Cmd-click => always create asset (even if provider upload fails).
        // Plain click => only create asset if provider upload succeeds.
        const forceAsset = !!(e.ctrlKey || e.metaKey);
        const ensureAsset = forceAsset;
        await upload(src, defProvCache, isVideo, { ensureAsset });
      }
    });
    // Right-click provider menu
    badgeEl.addEventListener('contextmenu', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const prov = await pickProvider(e.clientX, e.clientY, defProvCache);
      const isVideo = !!(currentVideo && currentVideo.src);
      const src = isVideo ? currentVideo.src : (currentImg && currentImg.src);
      if (prov && src) await upload(src, prov, isVideo);
    });
    // Middle-click: extract last frame and upload to Pixverse
    badgeEl.addEventListener('auxclick', async (e) => {
      if (e.button !== 1) return; // Only middle click
      e.preventDefault(); e.stopPropagation();
      if (currentVideo && currentVideo.src) {
        await extractLastFrameAndUpload(currentVideo);
      }
    });
    return badgeEl;
  }

  function positionBadgeFor(img) {
    const b = ensureBadge();
    const r = img.getBoundingClientRect();

    // Hide if image is mostly off-screen
    if (r.top < -r.height * 0.5 || r.bottom > window.innerHeight + r.height * 0.5 ||
        r.left < -r.width * 0.5 || r.right > window.innerWidth + r.width * 0.5) {
      b.style.display = 'none';
      return;
    }

    b.style.display = 'inline-flex';
    // Force layout to get accurate size
    const bw = b.offsetWidth || 60;
    const bh = b.offsetHeight || 20;

    // Position at top-right, with bounds checking
    let x = Math.floor(r.right - 8 - bw);
    let y = Math.floor(r.top + 8);

    // Ensure badge stays within viewport
    x = Math.max(8, Math.min(x, window.innerWidth - bw - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - bh - 8));

    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
  }

  function hideBadge() { if (badgeEl) badgeEl.style.display = 'none'; }

  // Check if we should skip this image (on own site, or already has PixSim7 badge/elements)
  function shouldSkipImage(img) {
    // Skip if on PixSim7 app itself (localhost or specific domains)
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' ||
        hostname.includes('pixsim7') || hostname.includes('pixsim')) {
      return true;
    }

    // Skip if image is part of PixSim7 UI (check parent elements for markers)
    let el = img;
    for (let i = 0; i < 10; i++) {
      if (!el) break;
      // Check for common PixSim7 UI markers (both full and short prefixes)
      const classes = el.className || '';
      const classStr = typeof classes === 'string' ? classes : (classes.baseVal || '');
      if (
          classStr.includes('pixsim7') ||
          classStr.includes('pxs7-') ||
          classStr.includes('pxs7_') ||
          el.hasAttribute('data-pixsim7') ||
          el.hasAttribute('data-pxs7') ||
          (el.id && (el.id.includes('pixsim7') || el.id.includes('pxs7')))
      ) {
        return true;
      }
      el = el.parentElement;
    }

    return false;
  }

  let hoverTimeout = null;
  let isOverBadge = false;
  let isOverMedia = false;

  function cancelHideTimer() {
    clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }

  function scheduleHide() {
    cancelHideTimer();
    hoverTimeout = setTimeout(() => {
      if (!isOverBadge && !isOverMedia) {
        hideBadge();
        currentImg = null;
        currentVideo = null;
      }
    }, 150);
  }

  function onImgEnter(e) {
    const img = e.target;
    if (!img || !img.src) return;
    if (shouldSkipImage(img)) return;
    const rect = img.getBoundingClientRect();
    if (rect.width < 32 || rect.height < 32) return;

    isOverMedia = true;
    cancelHideTimer();
    currentImg = img;
    currentVideo = null;
    positionBadgeFor(img);
    updateBadgeLabel(false, img.src, img);
  }

  function onVideoEnter(e) {
    const video = e.target;
    if (!video || !video.src) return;
    if (shouldSkipImage(video)) return;
    const rect = video.getBoundingClientRect();
    if (rect.width < 32 || rect.height < 32) return;

    const duration = video.duration;
    if (duration && (duration < 5 || duration > 30)) return;

    isOverMedia = true;
    cancelHideTimer();
    currentVideo = video;
    currentImg = null;
    positionBadgeFor(video);
    updateBadgeLabel(true, video.src, video);
  }

  function onImgLeave(e) {
    isOverMedia = false;
    scheduleHide();
  }

  function updateBadgeLabel(isVideo, mediaSrc = null, mediaElement = null) {
    if (!badgeEl) return;
    // On PixVerse site with PixVerse media URL: show sync badge
    const onPixverse = isPixverseSite();
    const isPixverseMedia = mediaSrc && isPixverseMediaUrl(mediaSrc);
    const assetInfo = isPixverseMedia ? extractPixverseAssetInfo(mediaSrc, mediaElement) : null;
    const isBlobUrl = mediaSrc && mediaSrc.startsWith('blob:');
    const isFileUrl = mediaSrc && mediaSrc.startsWith('file://');
    const isLocalUrl = isBlobUrl || isFileUrl;

    if (onPixverse && assetInfo) {
      // Show sync icon for PixVerse images we can identify
      const idDisplay = assetInfo.numericId || assetInfo.uuid.slice(0, 8) + '...';
      const idType = assetInfo.numericId ? 'ID' : 'UUID';
      badgeEl.innerHTML = '<span style="font-size:12px">🔗</span><span>Sync</span>';
      badgeEl.title = `Sync to PixSim7 (${idType}: ${idDisplay})`;
    } else if (isVideo) {
      badgeEl.innerHTML = '<span style="font-size:12px">🎥</span><span>PixSim7</span>';
      badgeEl.title = 'Click: Save video | Shift+Click: Capture frame | Middle/Alt+Click: Upload last frame';
    } else if (isFileUrl) {
      badgeEl.innerHTML = '<span style="font-size:12px">📁</span><span>PixSim7</span>';
      badgeEl.title = 'Upload local image to PixSim7';
    } else {
      badgeEl.innerHTML = '<span style="font-size:12px">⬆</span><span>PixSim7</span>';
      badgeEl.title = isBlobUrl ? 'Save image to PixSim7 (from blob)' : 'Save image to PixSim7';
    }
  }

  if (!document.__pixsim7_badgeBound) {
    // Badge hover - keep visible while over badge
    document.addEventListener('mouseover', (e) => {
      if (badgeEl && (e.target === badgeEl || badgeEl.contains(e.target))) {
        isOverBadge = true;
        cancelHideTimer();
      }
    });
    document.addEventListener('mouseout', (e) => {
      if (badgeEl && (e.target === badgeEl || badgeEl.contains(e.target))) {
        isOverBadge = false;
        scheduleHide();
      }
    });
    document.__pixsim7_badgeBound = true;
  }

  let scrollTimeout = null;
  function onScrollOrResize() {
    // Immediate update for better responsiveness
    if (currentImg) positionBadgeFor(currentImg);
    else if (currentVideo) positionBadgeFor(currentVideo);

    // Also debounce to reduce overhead on fast scrolling
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (currentImg) positionBadgeFor(currentImg);
      else if (currentVideo) positionBadgeFor(currentVideo);
    }, 50);
  }

  async function init() {
    injectStyle();
    const settings = await getSettings();
    defProvCache = (settings && settings.defaultUploadProvider) || 'pixverse';
    try {
      const provRes = await chrome.runtime.sendMessage({ action: 'getProviders' });
      if (provRes && provRes.success && Array.isArray(provRes.data)) { window.__pixsim7_providers = provRes.data; }
    } catch {}

    // Delegate hover events
    document.addEventListener('mouseover', (e) => { 
      if (e.target && e.target.tagName === 'IMG') onImgEnter(e);
      else if (e.target && e.target.tagName === 'VIDEO') onVideoEnter(e);
    });
    document.addEventListener('mouseout', (e) => { 
      if (e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO')) onImgLeave(e);
    });
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize, true);
  }

  try { init(); } catch {}
})();
