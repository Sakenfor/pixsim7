(function() {
  const BADGE_CLASS = 'pixsim7-img-badge';
  const MENU_CLASS = 'pixsim7-provider-menu';
  const TOAST_CLASS = 'pixsim7-toast';

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

  async function upload(mediaUrl, providerId, isVideo = false) {
    try {
      const settings = await getSettings();
      if (!settings.pixsim7Token) { showToast('Login to PixSim7 first', false); return; }
      const provider = providerId || settings.defaultUploadProvider || 'pixverse';
      const res = await chrome.runtime.sendMessage({ action: 'uploadMediaFromUrl', mediaUrl, providerId: provider });
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

    // Click to upload
    badgeEl.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const isVideo = currentVideo && currentVideo.src;
      const src = isVideo ? currentVideo.src : (currentImg && currentImg.src);
      if (src) await upload(src, defProvCache, isVideo);
    });
    // Right-click provider menu
    badgeEl.addEventListener('contextmenu', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const prov = await pickProvider(e.clientX, e.clientY, defProvCache);
      const isVideo = currentVideo && currentVideo.src;
      const src = isVideo ? currentVideo.src : (currentImg && currentImg.src);
      if (prov && src) await upload(src, prov, isVideo);
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

  let hoverTimeout = null;
  function onImgEnter(e) {
    const img = e.target;
    if (!img || !img.src) return;
    const rect = img.getBoundingClientRect();
    if (rect.width < 32 || rect.height < 32) return; // allow smaller than before
    currentImg = img;
    currentVideo = null;
    positionBadgeFor(img);
    updateBadgeLabel(false);
  }
  function onVideoEnter(e) {
    const video = e.target;
    if (!video || !video.src) return;
    const rect = video.getBoundingClientRect();
    if (rect.width < 32 || rect.height < 32) return;
    
    // Check duration (5-30 seconds)
    const duration = video.duration;
    if (duration && (duration < 5 || duration > 30)) {
      // Don't show badge for videos outside range
      return;
    }
    
    currentVideo = video;
    currentImg = null;
    positionBadgeFor(video);
    updateBadgeLabel(true);
  }
  function onImgLeave(e) {
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      // If pointer not over badge, hide
      const { clientX, clientY } = (e || {});
      const el = document.elementFromPoint(clientX || -1, clientY || -1);
      if (!el || (badgeEl && !badgeEl.contains(el))) hideBadge();
    }, 180);
  }
  
  function updateBadgeLabel(isVideo) {
    if (!badgeEl) return;
    if (isVideo) {
      badgeEl.innerHTML = '<span style="font-size:12px">🎥</span><span>PixSim7</span>';
    } else {
      badgeEl.innerHTML = '<span style="font-size:12px">⬆</span><span>PixSim7</span>';
    }
  }

  if (!document.__pixsim7_badgeBound) {
    document.addEventListener('mouseover', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains(BADGE_CLASS)) {
        // keep visible
        if (currentImg) positionBadgeFor(currentImg);
      }
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains(BADGE_CLASS)) {
        // delay hide similar to image leave
        onImgLeave(e);
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
