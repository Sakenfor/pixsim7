import type { NodeRendererProps } from '@/lib/graph/nodeRendererRegistry';

/**
 * Stub renderer for Intimacy Scene nodes.
 *
 * Currently uses a minimal layout; replace with a richer renderer
 * as the intimacy scene editor UX evolves.
 */
function IntimacySceneNodeRenderer({ node, isSelected, hasErrors }: NodeRendererProps) {
  const data = node.data as any;
  const sceneType = data?.sceneType ?? 'intimacy_scene';
  const intensity = data?.intensity ?? 'light';

  return (
    <div className="px-3 py-3 space-y-1">
      <div className="text-xs font-semibold text-pink-700 dark:text-pink-300">
        Intimacy Scene
      </div>
      <div className="text-[11px] text-neutral-600 dark:text-neutral-300">
        Type: <span className="font-medium">{sceneType}</span>
      </div>
      <div className="text-[11px] text-neutral-600 dark:text-neutral-300">
        Intensity: <span className="font-medium">{intensity}</span>
      </div>
      {hasErrors && (
        <div className="text-[10px] text-red-500 mt-1">
          Has validation issues
        </div>
      )}
      {isSelected && (
        <div className="text-[10px] text-pink-600 dark:text-pink-200 mt-1">
          Selected
        </div>
      )}
    </div>
  );
}

export default IntimacySceneNodeRenderer;

