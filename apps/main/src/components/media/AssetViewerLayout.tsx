/**
 * Asset Viewer Layout
 *
 * Wrapper component that provides side-push layout for asset viewing.
 * Wraps gallery/folder content and shows the viewer panel when an asset is open.
 */

import { ReactNode } from 'react';
import { useAssetViewerStore, selectIsViewerOpen } from '@/stores/assetViewerStore';
import { AssetViewerPanel } from './AssetViewerPanel';

interface AssetViewerLayoutProps {
  children: ReactNode;
}

export function AssetViewerLayout({ children }: AssetViewerLayoutProps) {
  const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);
  const mode = useAssetViewerStore((s) => s.mode);
  const settings = useAssetViewerStore((s) => s.settings);

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
      <div className="h-full flex">
        {/* Main content - shrinks to make room for viewer */}
        <div
          className="h-full overflow-hidden transition-all duration-300 ease-in-out"
          style={{ width: `${100 - settings.panelWidth}%` }}
        >
          {children}
        </div>

        {/* Viewer panel */}
        <div
          className="h-full flex-shrink-0 transition-all duration-300 ease-in-out"
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
