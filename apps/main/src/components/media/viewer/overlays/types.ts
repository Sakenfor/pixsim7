import type { ComponentType } from 'react';
import type { Identifiable } from '@lib/core/BaseRegistry';
import type { ViewerAsset } from '@features/assets';
import type { ViewerSettings } from '../types';
import type { AssetViewerOverlayMode } from '@features/mediaViewer';

export type MediaOverlayId = Exclude<AssetViewerOverlayMode, 'none'>;

export interface MediaOverlayComponentProps {
  asset: ViewerAsset;
  settings: ViewerSettings;
}

export type MediaOverlayTone = 'green' | 'purple' | 'blue' | 'amber';

export interface MediaOverlayTool extends Identifiable {
  id: MediaOverlayId;
  label: string;
  description?: string;
  shortcut?: string;
  priority?: number;
  tone?: MediaOverlayTone;
  Main: ComponentType<MediaOverlayComponentProps>;
  Toolbar?: ComponentType<MediaOverlayComponentProps>;
  Sidebar?: ComponentType<MediaOverlayComponentProps>;
}
