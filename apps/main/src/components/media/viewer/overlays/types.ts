import type { ComponentType } from 'react';

import type { Identifiable } from '@lib/core/BaseRegistry';

import type { ViewerAsset } from '@features/assets';

import type { CaptureAction } from '../panels/hooks/useFrameCapture';
import type { ViewerSettings } from '../types';

export type MediaOverlayId = string;

export interface MediaOverlayComponentProps {
  asset: ViewerAsset;
  settings: ViewerSettings;
  onCaptureFrame?: (action?: CaptureAction) => void;
  captureDisabled?: boolean;
  /** Media dimensions (for capture region display) */
  mediaDimensions?: { width: number; height: number };
  /** Current viewer viewport state (zoom 1-based, pan in px) */
  viewState?: { zoom: number; pan: { x: number; y: number }; fitMode: string };
  /** Called when the overlay changes zoom/pan (so host can sync) */
  onViewStateChange?: (viewState: { zoom: number; pan: { x: number; y: number } }) => void;
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
