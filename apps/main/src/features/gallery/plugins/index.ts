/**
 * Gallery Tool Plugins Index
 *
 * Central place to import and export all gallery tool plugins.
 * Register your custom gallery tools here.
 */

import { bulkTagTool } from './bulkTagTool';

// Export all plugins individually
export { bulkTagTool };

// Export array of built-in plugins for bulk registration
export const builtInGalleryTools = [
  bulkTagTool,
];
