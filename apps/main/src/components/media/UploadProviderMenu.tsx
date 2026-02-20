/**
 * UploadProviderMenu
 *
 * Floating context menu for choosing which provider to upload a local asset to.
 * Generic positioned dropdown — no feature-layer dependencies.
 *
 * `onSelect(providerId)` where providerId === 'library' means library-only upload.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@lib/icons';

export interface UploadProviderMenuProps {
  x: number;
  y: number;
  providers: Array<{ id: string; name: string }>;
  onSelect: (providerId: string) => void;
  onClose: () => void;
  extraItems?: Array<{ id: string; label: string; icon: string; onClick: () => void }>;
}

export function UploadProviderMenu({
  x,
  y,
  providers,
  onSelect,
  onClose,
  extraItems,
}: UploadProviderMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click-outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Clamp position to viewport
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) {
      el.style.left = `${Math.max(4, vw - rect.width - 4)}px`;
    }
    if (rect.bottom > vh) {
      el.style.top = `${Math.max(4, vh - rect.height - 4)}px`;
    }
  }, []);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed min-w-[180px] bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1 z-popover"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div className="px-3 py-1.5 text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
        Upload to
      </div>

      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={() => { onSelect(provider.id); onClose(); }}
          className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors text-neutral-700 dark:text-neutral-300"
        >
          <Icon name="upload" size={12} className="shrink-0" />
          <span className="truncate">{provider.name}</span>
        </button>
      ))}

      <div className="border-t border-neutral-100 dark:border-neutral-700 my-0.5" />

      <button
        type="button"
        onClick={() => { onSelect('library'); onClose(); }}
        className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors text-neutral-700 dark:text-neutral-300"
      >
        <Icon name="database" size={12} className="shrink-0" />
        <span className="truncate">Library only</span>
      </button>

      {extraItems && extraItems.length > 0 && (
        <>
          <div className="border-t border-neutral-100 dark:border-neutral-700 my-0.5" />
          {extraItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { item.onClick(); onClose(); }}
              className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors text-neutral-700 dark:text-neutral-300"
            >
              <Icon name={item.icon} size={12} className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </>
      )}
    </div>,
    document.body,
  );
}
