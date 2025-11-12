import type { Module } from '../types';
import type { Asset } from '../../types';

/**
 * Gallery Module
 *
 * Handles display and management of media assets (images, videos, audio)
 *
 * TODO: Implement actual functionality
 * - Asset browsing and filtering
 * - Upload functionality
 * - Asset preview
 * - Asset selection for other modules
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
    console.log('Gallery module ready (not implemented yet)');
  },

  isReady: () => true,

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
