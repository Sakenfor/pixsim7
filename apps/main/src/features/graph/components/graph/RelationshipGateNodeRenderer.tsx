import type { NodeRendererProps } from '../../lib/editor/nodeRendererRegistry';

/**
 * Relationship Gate Node Renderer
 *
 * Visual summary of a relationship gate:
 * - Gate name and required relationship tier
 * - Routing info for passed/failed targets
 * - Simple status chips for validation issues
 */
function RelationshipGateNodeRenderer({ node, hasErrors, isSelected }: NodeRendererProps) {
  const data = node.data as any;
  const gate = data?.gate ?? {};
  const name = gate.name ?? 'Relationship Gate';
  const requiredTier = gate.requiredTier ?? 'friend';
  const passedTargetNodeId = data?.passedTargetNodeId || '';
  const failedTargetNodeId = data?.failedTargetNodeId || '';

  return (
    <div className="px-3 py-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-rose-500 dark:text-rose-300 text-xl">♥</span>
          <div className="text-xs font-semibold text-rose-700 dark:text-rose-300">
            {name}
          </div>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">
          Tier: {requiredTier}
        </span>
      </div>

      {/* Routing info */}
      {(passedTargetNodeId || failedTargetNodeId) && (
        <div className="space-y-1 text-[11px] text-neutral-600 dark:text-neutral-300">
          <div className="flex items-center gap-1">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-[10px]">
              ✓ Passed
            </span>
            <span className="truncate">
              {passedTargetNodeId || 'Not connected'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px]">
              ✕ Failed
            </span>
            <span className="truncate">
              {failedTargetNodeId || 'Not connected'}
            </span>
          </div>
        </div>
      )}

      {/* Status chips */}
      <div className="flex items-center gap-2 flex-wrap mt-1">
        {isSelected && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-medium">
            ● Selected
          </span>
        )}
        {hasErrors && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] font-medium">
            ! Has validation issues
          </span>
        )}
      </div>
    </div>
  );
}

export default RelationshipGateNodeRenderer;
