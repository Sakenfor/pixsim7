import type { NodeRendererProps } from '../../lib/editor/nodeRendererRegistry';

/**
 * Stub renderer for Progression Stage nodes.
 *
 * Displays stage name and tier; intended as a starting point
 * for a richer progression visualization.
 */
function ProgressionStageNodeRenderer({ node, hasErrors }: NodeRendererProps) {
  const data = node.data as { stageName?: string; tier?: string } | undefined;
  const stageName = data?.stageName ?? 'Progression Stage';
  const tier = data?.tier ?? 'friend';

  return (
    <div className="px-3 py-3 space-y-1">
      <div className="text-xs font-semibold text-violet-700 dark:text-violet-300">
        {stageName}
      </div>
      <div className="text-[11px] text-neutral-600 dark:text-neutral-300">
        Tier: <span className="font-medium">{tier}</span>
      </div>
      {hasErrors && (
        <div className="text-[10px] text-red-500 mt-1">
          Has validation issues
        </div>
      )}
    </div>
  );
}

export default ProgressionStageNodeRenderer;
