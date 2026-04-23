/**
 * Asset Viewer Layout
 *
 * Wrapper component that provides side-push layout for asset viewing.
 * Wraps gallery/folder content and shows the viewer panel when an asset is open.
 */

import { ResizeDivider, useResizeHandle } from '@pixsim7/shared.ui';
import { ReactNode, useCallback, useRef } from 'react';

import { useAssetViewerStore, selectIsViewerOpen } from '@features/assets';
import { useIsMobileViewport } from '@features/panels/components/host/useIsMobileViewport';

import { AssetViewerPanel } from './AssetViewerPanel';

interface AssetViewerLayoutProps {
  children: ReactNode;
}

export function AssetViewerLayout({ children }: AssetViewerLayoutProps) {
  const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);
  const mode = useAssetViewerStore((s) => s.mode);
  const settings = useAssetViewerStore((s) => s.settings);
  const updateSettings = useAssetViewerStore((s) => s.updateSettings);
  const isMobile = useIsMobileViewport();

  const containerRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback(
    ({ position }: { position: number }) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const mouseX = position - containerRect.left;

      // Calculate panel width as percentage (from right edge)
      const newPanelWidth = ((containerWidth - mouseX) / containerWidth) * 100;

      // Constrain to 20-60%
      const constrainedWidth = Math.min(Math.max(newPanelWidth, 20), 60);

      updateSettings({ panelWidth: constrainedWidth });
    },
    [updateSettings]
  );

  const { isDragging, handleMouseDown } = useResizeHandle({
    onResize: handleResize,
    orientation: 'vertical',
  });

  // In fullscreen mode, don't modify layout - panel handles its own positioning
  if (mode === 'fullscreen') {
    return (
      <>
        <div className="h-full">{children}</div>
        <AssetViewerPanel />
      </>
    );
  }

  // On mobile, collapse the side-push into a toggle: viewer full-screen when
  // open, gallery full-screen when closed. Skips the resize divider entirely.
  if (isMobile) {
    if (isViewerOpen) {
      return (
        <div className="h-full">
          <AssetViewerPanel />
        </div>
      );
    }
    return <div className="h-full">{children}</div>;
  }

  // Side-push layout
  if (isViewerOpen && mode === 'side') {
    return (
      <div className="h-full flex" ref={containerRef}>
        {/* Main content - shrinks to make room for viewer */}
        <div
          className="h-full overflow-hidden"
          style={{ width: `${100 - settings.panelWidth}%` }}
        >
          {children}
        </div>

        {/* Resize handle */}
        <ResizeDivider
          onMouseDown={handleMouseDown}
          isDragging={isDragging}
          orientation="vertical"
        />

        {/* Viewer panel */}
        <div
          className="h-full flex-shrink-0"
          style={{ width: `${settings.panelWidth}%` }}
        >
          <AssetViewerPanel />
        </div>
      </div>
    );
  }

  // Closed - full width content
  return <div className="h-full">{children}</div>;
}
