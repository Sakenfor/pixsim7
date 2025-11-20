/**
 * AI Tagging Assistant Gallery Tool
 *
 * Uses AI to suggest tags for assets based on their content.
 * Can analyze images/videos and suggest relevant tags.
 */

import { useState } from 'react';
import type { GalleryToolPlugin, GalleryToolContext } from '../../lib/gallery/types';
import { Button } from '@pixsim7/shared.ui';

/**
 * AI tagging assistant component
 */
function AITaggingTool({ context }: { context: GalleryToolContext }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const selectedAsset = context.selectedAssets[0];

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setSuggestions([]);

    // Simulate AI analysis (replace with actual API call)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mock suggestions based on media type
    const mockSuggestions = selectedAsset?.media_type === 'image'
      ? ['portrait', 'outdoor', 'daytime', 'landscape', 'nature']
      : ['video', 'cinematic', 'motion', 'edited', 'short'];

    setSuggestions(mockSuggestions);
    setAnalyzing(false);
  };

  const toggleTag = (tag: string) => {
    const newSelected = new Set(selectedTags);
    if (newSelected.has(tag)) {
      newSelected.delete(tag);
    } else {
      newSelected.add(tag);
    }
    setSelectedTags(newSelected);
  };

  const handleApplyTags = () => {
    // TODO: Implement actual tag application API call
    const tags = Array.from(selectedTags);
    alert(`Applying tags: ${tags.join(', ')}`);
    setSuggestions([]);
    setSelectedTags(new Set());
  };

  return (
    <div className="p-4 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">🤖</span>
        <div>
          <h3 className="font-semibold text-sm">AI Tagging Assistant</h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Automatically suggest tags using AI
          </p>
        </div>
      </div>

      {context.selectedAssets.length === 0 ? (
        <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2">
          Select an asset to analyze and suggest tags
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-neutral-600 dark:text-neutral-400">
            Asset: {selectedAsset?.id}
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? '🔄 Analyzing...' : '🔍 Analyze & Suggest Tags'}
          </Button>

          {suggestions.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Suggested Tags:
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      selectedTags.has(tag)
                        ? 'bg-blue-500 text-white border-blue-600'
                        : 'bg-neutral-100 dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 hover:bg-neutral-200 dark:hover:bg-neutral-600'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {selectedTags.size > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleApplyTags}
                >
                  Apply {selectedTags.size} Selected Tag{selectedTags.size !== 1 ? 's' : ''}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Register the AI tagging tool
 */
export function registerAITaggingTool() {
  const { galleryToolRegistry } = require('../../lib/gallery/types');

  const aiTaggingTool: GalleryToolPlugin = {
    id: 'ai-tagging',
    name: 'AI Tagging Assistant',
    description: 'Automatically suggest tags using AI analysis',
    icon: '🤖',
    category: 'automation',

    // Only show when exactly one asset is selected
    whenVisible: (context) => context.selectedAssets.length === 1,

    render: (context) => <AITaggingTool context={context} />,
  };

  galleryToolRegistry.register(aiTaggingTool);
}
