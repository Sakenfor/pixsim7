import { useMemo } from 'react';
import { useGraphStore, type GraphState } from '../../stores/graphStore';

/**
 * Breadcrumbs Component
 *
 * Shows navigation trail when zoomed into groups
 * Allows clicking to jump back to parent levels
 */
export function Breadcrumbs() {
  const zoomOut = useGraphStore((s: GraphState) => s.zoomOut);
  const zoomToRoot = useGraphStore((s: GraphState) => s.zoomToRoot);
  const zoomIntoGroup = useGraphStore((s: GraphState) => s.zoomIntoGroup);

  // Select primitive values that trigger re-computation when changed
  const currentSceneId = useGraphStore((s: GraphState) => s.currentSceneId);
  const navigationStack = useGraphStore((s: GraphState) => s.navigationStack);
  const sceneTitle = useGraphStore((s: GraphState) =>
    s.currentSceneId ? s.scenes[s.currentSceneId]?.title : null
  );

  // Only recompute when dependencies change (not on every store update)
  const breadcrumbs = useMemo(() => {
    if (!currentSceneId) return [];

    // Access store directly to get current scene data
    const state = useGraphStore.getState();
    const scene = state.scenes[currentSceneId];
    if (!scene) return [];

    const result: Array<{ id: string; label: string }> = [];

    // Root level
    result.push({
      id: 'root',
      label: scene.title || 'Scene',
    });

    // Add each group in the navigation stack
    navigationStack.forEach((groupId) => {
      const groupNode = scene.nodes.find((n) => n.id === groupId);
      if (groupNode) {
        result.push({
          id: groupId,
          label: groupNode.metadata?.label || groupId,
        });
      }
    });

    return result;
  }, [currentSceneId, navigationStack, sceneTitle]);

  if (breadcrumbs.length <= 1) {
    // At root level, no breadcrumbs needed
    return null;
  }

  const handleClick = (index: number) => {
    if (index === 0) {
      // Clicked root - zoom all the way out
      zoomToRoot();
    } else {
      // Clicked intermediate breadcrumb - zoom to that level
      // First zoom to root, then navigate to target
      zoomToRoot();
      for (let i = 1; i <= index; i++) {
        zoomIntoGroup(breadcrumbs[i].id);
      }
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
      {/* Back button */}
      <button
        onClick={() => zoomOut()}
        className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-medium transition-colors"
        title="Zoom out (back)"
      >
        ← Back
      </button>

      {/* Breadcrumb trail */}
      <div className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.id} className="flex items-center gap-1">
            {index > 0 && (
              <span className="text-neutral-400 dark:text-neutral-500">›</span>
            )}
            <button
              onClick={() => handleClick(index)}
              className={`
                px-2 py-1 rounded transition-colors
                ${
                  index === breadcrumbs.length - 1
                    ? 'bg-blue-500 text-white font-semibold'
                    : 'hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300'
                }
              `}
              title={index === 0 ? 'Go to root' : `Jump to ${crumb.label}`}
            >
              {crumb.label}
            </button>
          </div>
        ))}
      </div>

      {/* Zoom level indicator */}
      <div className="ml-auto text-xs text-blue-600 dark:text-blue-400">
        📍 Level {breadcrumbs.length - 1}
      </div>
    </div>
  );
}
