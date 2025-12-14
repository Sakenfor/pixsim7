/**
 * Bulk Tag Gallery Tool
 *
 * Demonstrates a gallery tool with surface support.
 * Available on default and curator surfaces, but not review.
 */

import { useState } from 'react';
import { Button } from '@pixsim7/shared.ui';
import type { GalleryToolPlugin, GalleryToolContext } from '../lib/core/types';

function BulkTagToolUI({ context }: { context: GalleryToolContext }) {
  const [tagInput, setTagInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAddTags = async () => {
    if (!tagInput.trim() || context.selectedAssets.length === 0) return;

    setIsProcessing(true);
    try {
      const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);

      // TODO: Implement actual API call to add tags
      console.log('Adding tags:', tags, 'to assets:', context.selectedAssets.map(a => a.id));

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setTagInput('');
      context.refresh();
    } catch (error) {
      console.error('Failed to add tags:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        Add tags to {context.selectedAssets.length} selected asset{context.selectedAssets.length !== 1 ? 's' : ''}
      </div>

      <div className="space-y-2">
        <input
          type="text"
          className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded text-sm"
          placeholder="Enter tags (comma-separated)"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddTags()}
        />

        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={handleAddTags}
            disabled={!tagInput.trim() || isProcessing}
            className="flex-1 text-sm"
          >
            {isProcessing ? '⏳ Adding...' : '+ Add Tags'}
          </Button>
        </div>
      </div>

      {/* Quick tag buttons */}
      <div className="space-y-2">
        <div className="text-xs text-neutral-500 dark:text-neutral-400">Quick tags:</div>
        <div className="flex flex-wrap gap-1">
          {['favorite', 'approved', 'needs-review', 'high-quality', 'draft'].map(tag => (
            <button
              key={tag}
              onClick={() => setTagInput(prev => prev ? `${prev}, ${tag}` : tag)}
              className="px-2 py-1 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
        💡 Tip: Select multiple assets with Ctrl+Click
      </div>
    </div>
  );
}

/**
 * Bulk Tag Tool Definition
 */
export const bulkTagTool: GalleryToolPlugin = {
  id: 'bulk-tag',
  name: 'Bulk Tag',
  description: 'Add tags to multiple assets at once',
  icon: '🏷️',
  category: 'automation',

  // This tool supports default and curator surfaces, but NOT review
  supportedSurfaces: ['assets-default', 'assets-curator'],

  // Only show when assets are selected
  whenVisible: (context) => context.selectedAssets.length > 0,

  render: (context) => <BulkTagToolUI context={context} />,
};
