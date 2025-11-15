import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { useControlCubeStore, type CubeState } from '../../stores/controlCubeStore';
import { cubeExpansionRegistry, getExpansionSize } from '../../lib/cubeExpansionRegistry';

export interface CubeExpansionOverlayProps {
  cube: CubeState;
  cubeElement: HTMLElement;
  onClose?: () => void;
}

/**
 * Renders expansion overlay above a cube
 * Dynamically looks up and renders the appropriate expansion provider
 */
export function CubeExpansionOverlay({ cube, cubeElement, onClose }: CubeExpansionOverlayProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);

  // Determine which provider to use
  const providerId = cube.minimizedPanel?.panelId || cube.type;
  const provider = cubeExpansionRegistry.get(providerId);

  // If no provider, don't render
  if (!provider) return null;

  const ExpansionComponent = provider.component;
  const size = getExpansionSize(provider);

  // Calculate position relative to cube
  useEffect(() => {
    const updatePosition = () => {
      const cubeRect = cubeElement.getBoundingClientRect();
      const cubeSize = cubeRect.width;

      // Default: show above cube
      let top = cubeRect.top - size.height - 10;
      let left = cubeRect.left + cubeSize / 2 - size.width / 2;

      // Check if it goes off screen top
      if (top < 10) {
        // Show below instead
        top = cubeRect.bottom + 10;
      }

      // Check if it goes off screen left
      if (left < 10) {
        left = 10;
      }

      // Check if it goes off screen right
      if (left + size.width > window.innerWidth - 10) {
        left = window.innerWidth - size.width - 10;
      }

      // Check if it goes off screen bottom (if showing below)
      if (top + size.height > window.innerHeight - 10) {
        // Try showing above again
        top = cubeRect.top - size.height - 10;
        // If still doesn't fit, clamp to screen
        if (top < 10) {
          top = 10;
        }
      }

      setPosition({ top, left });
    };

    updatePosition();

    // Update on window resize
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [cubeElement, size.width, size.height]);

  // Render expansion as portal (above everything)
  return createPortal(
    <div
      ref={overlayRef}
      className={clsx(
        'fixed z-[10000] pointer-events-auto',
        'bg-gradient-to-br from-neutral-900/95 to-neutral-800/95',
        'backdrop-blur-lg rounded-lg shadow-2xl',
        'border border-white/20',
        'animate-in fade-in zoom-in-95 duration-200',
        'overflow-hidden'
      )}
      style={{
        top: position.top,
        left: position.left,
        width: size.width,
        height: size.height,
      }}
    >
      {/* Expansion content */}
      <div className="w-full h-full overflow-auto">
        <ExpansionComponent cubeId={cube.id} onClose={onClose} />
      </div>

      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/20 hover:bg-red-500/40 text-white/60 hover:text-white transition-colors flex items-center justify-center text-sm"
          title="Close"
        >
          ✕
        </button>
      )}

      {/* Type indicator badge */}
      <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-white/10 rounded text-[10px] text-white/40 uppercase tracking-wide">
        {provider.type}
      </div>
    </div>,
    document.body
  );
}
