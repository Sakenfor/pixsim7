import { Z } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ViewerState {
  url: string;
  type: 'image' | 'video';
  name?: string;
}

/**
 * Standalone fullscreen overlay for viewing media sent from the browser extension.
 * Listens on BroadcastChannel('pixsim7-viewer') and reads ?view= URL params.
 * Completely independent from the asset viewer infrastructure.
 */
// Capture URL params synchronously at module load, before React Router can redirect
const _initialParams = new URLSearchParams(window.location.search);
const _initialViewUrl = _initialParams.get('view');
const _initialViewType = _initialParams.get('viewType') as 'image' | 'video' | null;
if (_initialViewUrl) {
  // Clean params immediately so React Router doesn't see them
  _initialParams.delete('view');
  _initialParams.delete('viewType');
  const cleanUrl = _initialParams.toString()
    ? `${window.location.pathname}?${_initialParams.toString()}`
    : window.location.pathname;
  window.history.replaceState({}, '', cleanUrl);
}

export function ExternalMediaViewer() {
  const [media, setMedia] = useState<ViewerState | null>(
    _initialViewUrl ? { url: _initialViewUrl, type: _initialViewType || 'image' } : null,
  );
  const channelRef = useRef<BroadcastChannel | null>(null);

  const close = useCallback(() => {
    setMedia((prev) => {
      if (prev?.url.startsWith('blob:')) {
        try { URL.revokeObjectURL(prev.url); } catch { /* ignore revoke errors */ }
      }
      return null;
    });
  }, []);

  // BroadcastChannel listener
  useEffect(() => {
    const ch = new BroadcastChannel('pixsim7-viewer');
    channelRef.current = ch;

    ch.onmessage = (ev) => {
      const data = ev.data;
      if (data?.action === 'view' && data.url) {
        setMedia({ url: data.url, type: data.type || 'image', name: data.name });
        ch.postMessage({ action: 'ack' });
      }
    };

    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, []);

  // Esc key handler
  useEffect(() => {
    if (!media) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [media, close]);

  if (!media) return null;

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center bg-black/85"
      style={{ zIndex: Z.globalModal }}
      onClick={close}
    >
      {/* Close button */}
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none p-2 z-10"
        onClick={(e) => { e.stopPropagation(); close(); }}
        title="Close (Esc)"
      >
        &times;
      </button>

      {/* Media content */}
      <div
        className="flex items-center justify-center max-w-[95vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {media.type === 'video' ? (
          <video
            src={media.url}
            className="max-w-full max-h-[85vh] rounded"
            controls
            autoPlay
            loop
          />
        ) : (
          <img
            src={media.url}
            className="max-w-full max-h-[85vh] rounded object-contain"
            alt={media.name || 'External media'}
          />
        )}
      </div>

      {/* Source URL display */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[80vw] text-xs text-white/40 truncate px-3 py-1.5 bg-white/5 rounded">
        {media.name || media.url}
      </div>
    </div>
  );
}
