import type { ComponentType } from 'react';

import type { Identifiable } from '@lib/core/BaseRegistry';

import type { ViewerAsset } from '@features/assets';

import type { ViewerSettings } from '../types';

export type MediaOverlayId = string;

export interface MediaOverlayComponentProps {
  asset: ViewerAsset;
  settings: ViewerSettings;
  onCaptureFrame?: () => void;
  captureDisabled?: boolean;
  /** Media dimensions (for capture region display) */
  mediaDimensions?: { width: number; height: number };
}

export type MediaOverlayTone = 'green' | 'purple' | 'blue' | 'amber';

export interface MediaOverlayTool extends Identifiable {
  id: MediaOverlayId;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  priority?: number;
  tone?: MediaOverlayTone;
  isAvailable?: (asset: ViewerAsset) => boolean;
  Main: ComponentType<MediaOverlayComponentProps>;
  Toolbar?: ComponentType<MediaOverlayComponentProps>;
  Sidebar?: ComponentType<MediaOverlayComponentProps>;
}
