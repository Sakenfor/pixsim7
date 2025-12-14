/**
 * Gallery Tool Plugin Registry
 *
 * Central registry for gallery tools.
 * Import and register your custom tools here.
 */

import { galleryToolRegistry } from './core/types';
import { builtInGalleryTools } from '../plugins';

// Export the singleton registry
export { galleryToolRegistry };

// Register built-in gallery tools
builtInGalleryTools.forEach(tool => {
  galleryToolRegistry.register(tool);
});
