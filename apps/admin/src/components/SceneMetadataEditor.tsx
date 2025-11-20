import { useState, useEffect } from 'react';
import { Button, useToast } from '@pixsim7/shared.ui';
import { useGraphStore, type GraphState } from '../stores/graphStore';

/**
 * Scene Metadata Editor
 *
 * Edits scene-level metadata for story arcs and content organization.
 * Stores arc_id and tags in Scene.metadata following RELATIONSHIPS_AND_ARCS.md.
 */
export function SceneMetadataEditor() {
  const toast = useToast();
  const currentSceneId = useGraphStore((s: GraphState) => s.currentSceneId);
  const getCurrentScene = useGraphStore((s: GraphState) => s.getCurrentScene);
  const scenes = useGraphStore((s: GraphState) => s.scenes);

  const currentScene = getCurrentScene();

  const [arcId, setArcId] = useState<string>('');
  const [tags, setTags] = useState<string>('');

  // Load scene metadata when scene changes
  useEffect(() => {
    if (currentScene && currentScene.metadata) {
      setArcId(currentScene.metadata.arc_id || '');
      const sceneTags = currentScene.metadata.tags || [];
      setTags(Array.isArray(sceneTags) ? sceneTags.join(', ') : '');
    } else {
      setArcId('');
      setTags('');
    }
  }, [currentScene]);

  const handleSaveMetadata = () => {
    if (!currentSceneId || !currentScene) {
      toast.error('No scene selected');
      return;
    }

    try {
      const metadata = { ...currentScene.metadata };

      // Update arc_id
      if (arcId.trim()) {
        metadata.arc_id = arcId.trim();
      } else {
        delete metadata.arc_id;
      }

      // Update tags
      const tagArray = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (tagArray.length > 0) {
        metadata.tags = tagArray;
      } else {
        delete metadata.tags;
      }

      // Update the scene in the store
      // We need to directly update the scene since there's no dedicated method
      useGraphStore.setState((state) => {
        if (!state.currentSceneId) return state;

        const scene = state.scenes[state.currentSceneId];
        if (!scene) return state;

        return {
          scenes: {
            ...state.scenes,
            [state.currentSceneId]: {
              ...scene,
              metadata,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      });

      toast.success('Scene metadata updated');
    } catch (error) {
      toast.error(`Failed to update metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (!currentScene) {
    return (
      <div className="p-4 text-sm text-neutral-500">
        No active scene. Create or load a scene first.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Scene Metadata</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Configure story arc and content organization for this scene
        </p>
      </div>

      <div className="space-y-3">
        {/* Scene Title (read-only display) */}
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
          <div className="text-xs font-semibold text-blue-900 dark:text-blue-300">Current Scene</div>
          <div className="text-sm text-blue-700 dark:text-blue-400 mt-1">{currentScene.title}</div>
        </div>

        {/* Arc ID */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Arc ID
          </label>
          <input
            type="text"
            value={arcId}
            onChange={(e) => setArcId(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="e.g., main_romance_alex, intro_quest"
          />
          <p className="text-xs text-neutral-500 mt-1">
            Story arc identifier. Used to track progression across multiple scenes.
          </p>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Tags (comma-separated)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="e.g., arc:main_romance_alex, stage:2, location:cafe"
          />
          <p className="text-xs text-neutral-500 mt-1">
            Content tags for filtering and organization. Supports namespaced tags like "arc:", "stage:", "location:".
          </p>
        </div>

        {/* Save Button */}
        <Button
          variant="primary"
          onClick={handleSaveMetadata}
          className="w-full"
        >
          Save Metadata
        </Button>

        {/* Current Metadata Display */}
        {currentScene.metadata && Object.keys(currentScene.metadata).length > 0 && (
          <div className="border-t pt-3 dark:border-neutral-700">
            <h4 className="text-sm font-semibold mb-2">Current Metadata</h4>
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 border rounded dark:border-neutral-700">
              <pre className="text-xs font-mono whitespace-pre-wrap">
                {JSON.stringify(currentScene.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Documentation */}
        <div className="border-t pt-3 dark:border-neutral-700">
          <h4 className="text-sm font-semibold mb-2">About Scene Metadata</h4>
          <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-2">
            <p>
              <strong>Arc ID:</strong> Links this scene to a story arc. Progress is tracked in{' '}
              <code className="bg-neutral-200 dark:bg-neutral-700 px-1 rounded">GameSession.flags.arcs</code>.
            </p>
            <p>
              <strong>Tags:</strong> Enables filtering, search, and conditional content. Use namespaced tags
              for clarity (e.g., "arc:romance", "stage:2", "time:morning").
            </p>
            <p className="text-amber-600 dark:text-amber-400">
              Note: Arc progression is managed via edge effects. Use the Edge Effects Editor to configure
              how this scene updates arc state.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
