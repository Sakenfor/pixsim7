/**
 * Asset Viewer Layout
 *
 * Wrapper component that provides side-push layout for asset viewing.
 * Wraps gallery/folder content and shows the viewer panel when an asset is open.
 */

import { ReactNode, useCallback, useRef } from 'react';
import { useAssetViewerStore, selectIsViewerOpen } from '@features/assets';
import { AssetViewerPanel } from './AssetViewerPanel';
import { ResizeDivider, useResizeHandle } from '@pixsim7/shared.ui';

interface AssetViewerLayoutProps {
  children: ReactNode;
}

export function AssetViewerLayout({ children }: AssetViewerLayoutProps) {
  const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);
  const mode = useAssetViewerStore((s) => s.mode);
  const settings = useAssetViewerStore((s) => s.settings);
  const updateSettings = useAssetViewerStore((s) => s.updateSettings);

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
