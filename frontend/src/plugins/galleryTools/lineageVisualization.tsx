/**
 * Lineage Visualization Gallery Tool
 *
 * Displays asset lineage/provenance as a visual graph.
 * Shows how assets are related (e.g., original -> edited versions, source -> derivatives)
 */

import { useState } from 'react';
import type { GalleryToolPlugin, GalleryToolContext } from '../../lib/gallery/types';
import { Button } from '@pixsim7/ui';

/**
 * Lineage visualization tool component
 */
function LineageVisualizationTool({ context }: { context: GalleryToolContext }) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(false);

  const handleShowLineage = (assetId: string) => {
    setSelectedAssetId(assetId);
    setShowGraph(true);
  };

  const selectedAsset = context.selectedAssets[0];

  return (
    <div className="p-4 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">🌳</span>
        <div>
          <h3 className="font-semibold text-sm">Asset Lineage</h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            View asset relationships and provenance
          </p>
        </div>
      </div>

      {context.selectedAssets.length === 0 ? (
        <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2">
          Select an asset to view its lineage
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-neutral-600 dark:text-neutral-400">
            Selected: {selectedAsset?.id}
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleShowLineage(selectedAsset.id)}
          >
            Show Lineage Graph
          </Button>

          {showGraph && selectedAssetId && (
            <div className="mt-3 p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                Lineage Graph Preview (placeholder)
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>Original: {selectedAssetId}</span>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>Derivative 1</span>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>Derivative 2</span>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowGraph(false)}
                className="mt-2"
              >
                Close
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Register the lineage visualization tool
 */
export function registerLineageVisualizationTool() {
  const { galleryToolRegistry } = require('../../lib/gallery/types');

  const lineageTool: GalleryToolPlugin = {
    id: 'lineage-visualization',
    name: 'Lineage Visualization',
    description: 'View asset relationships and provenance as a graph',
    icon: '🌳',
    category: 'visualization',

    // Only show when at least one asset is selected
    whenVisible: (context) => context.selectedAssets.length > 0,

    render: (context) => <LineageVisualizationTool context={context} />,
  };

  galleryToolRegistry.register(lineageTool);
}
