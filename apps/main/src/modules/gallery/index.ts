import type { Module } from '../types';
import type { Asset } from '../../types';
import { logEvent } from '@lib/utils';
import { GalleryModule as GalleryModuleComponent } from '@features/controlCenter/components/modules/GalleryModule';
import type { CCPanelId } from '@features/controlCenter/lib/ccPanelRegistry';

/**
 * Gallery Module
 *
 * Handles display and management of media assets (images, videos, audio)
 *
 * Note: Core gallery functionality is implemented in AssetsRoute.tsx
 * This module provides programmatic access to gallery features for other modules.
 */

export interface GalleryModule extends Module {
  // Future API methods
  getAssets?: (filters?: Record<string, any>) => Promise<Asset[]>;
  selectAsset?: (assetId: string) => void;
  uploadAsset?: (file: File) => Promise<Asset>;
}

export const galleryModule: GalleryModule = {
  id: 'gallery',
  name: 'Gallery Module',

  initialize: async () => {
    logEvent('INFO', 'gallery_module_ready', { status: 'not_implemented' });
  },

  isReady: () => true,

  // Auto-register Control Center panel
  controlCenterPanels: [
    {
      id: 'gallery' as CCPanelId,
      title: 'Gallery',
      icon: '🖼️',
      component: GalleryModuleComponent,
      category: 'tools',
      order: 50,
      enabledByDefault: true,
      description: 'Gallery controls and asset management',
      tags: ['gallery', 'assets', 'media'],
    },
  ],

  // Placeholder methods - to be implemented
  getAssets: async () => {
    throw new Error('Gallery module not yet implemented');
  },

  selectAsset: () => {
    throw new Error('Gallery module not yet implemented');
  },

  uploadAsset: async () => {
    throw new Error('Gallery module not yet implemented');
  },
};
