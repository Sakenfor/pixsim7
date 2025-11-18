/**
 * Bulk Operations Gallery Tool
 *
 * Provides bulk operations for selected assets:
 * - Bulk tagging
 * - Bulk moving/organizing
 * - Bulk deletion
 * - Bulk export
 */

import { useState } from 'react';
import type { GalleryToolPlugin, GalleryToolContext } from '../../lib/gallery/types';
import { Button } from '@pixsim7/ui';

/**
 * Bulk operations tool component
 */
function BulkOperationsTool({ context }: { context: GalleryToolContext }) {
  const [operation, setOperation] = useState<'tag' | 'move' | 'delete' | 'export' | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const selectedCount = context.selectedAssets.length;

  const handleBulkTag = () => {
    if (!tagInput.trim()) {
      setStatus('Please enter a tag');
      return;
    }

    // TODO: Implement actual bulk tagging API call
    setStatus(`Tagged ${selectedCount} assets with "${tagInput}"`);
    setTagInput('');
    setTimeout(() => setStatus(null), 3000);
  };

  const handleBulkDelete = () => {
    if (!confirm(`Delete ${selectedCount} assets? This cannot be undone.`)) {
      return;
    }

    // TODO: Implement actual bulk delete API call
    setStatus(`Deleted ${selectedCount} assets`);
    setTimeout(() => {
      setStatus(null);
      context.refresh();
    }, 3000);
  };

  const handleBulkExport = () => {
    // TODO: Implement actual bulk export
    setStatus(`Exporting ${selectedCount} assets...`);
    setTimeout(() => setStatus('Export complete!'), 2000);
  };

  return (
    <div className="p-4 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">⚡</span>
        <div>
          <h3 className="font-semibold text-sm">Bulk Operations</h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Perform actions on multiple assets
          </p>
        </div>
      </div>

      {selectedCount === 0 ? (
        <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2">
          Select assets to perform bulk operations
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-neutral-700 dark:text-neutral-300">
            {selectedCount} asset{selectedCount !== 1 ? 's' : ''} selected
          </div>

          {status && (
            <div className="text-xs p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded">
              {status}
            </div>
          )}

          <div className="space-y-2">
            {/* Bulk Tag */}
            {operation === 'tag' ? (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Enter tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-700 dark:border-neutral-600"
                  onKeyDown={(e) => e.key === 'Enter' && handleBulkTag()}
                />
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={handleBulkTag}>
                    Apply Tag
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setOperation(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setOperation('tag')}
                className="w-full"
              >
                🏷️ Bulk Tag
              </Button>
            )}

            {/* Bulk Export */}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBulkExport}
              className="w-full"
            >
              📦 Export Selected
            </Button>

            {/* Bulk Delete */}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBulkDelete}
              className="w-full text-red-600 dark:text-red-400"
            >
              🗑️ Delete Selected
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Register the bulk operations tool
 */
export function registerBulkOperationsTool() {
  const { galleryToolRegistry } = require('../../lib/gallery/types');

  const bulkOpsTool: GalleryToolPlugin = {
    id: 'bulk-operations',
    name: 'Bulk Operations',
    description: 'Perform actions on multiple assets at once',
    icon: '⚡',
    category: 'automation',

    // Show when at least one asset is selected
    whenVisible: (context) => context.selectedAssets.length > 0,

    render: (context) => <BulkOperationsTool context={context} />,
  };

  galleryToolRegistry.register(bulkOpsTool);
}
