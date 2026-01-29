import type { NodeRendererProps } from '../../lib/editor/nodeRendererRegistry';

/**
 * Intimacy Generation Node Renderer
 *
 * Shows a compact summary of generation type and social context,
 * mirroring the style of other custom node renderers.
 */
function IntimacyGenerationNodeRenderer({ node, hasErrors, isSelected }: NodeRendererProps) {
  const data = node.metadata as {
    generationType?: string;
    semanticType?: string;
    purpose?: string;
    strategy?: string;
    socialContext?: {
      intimacyBand?: string;
      contentRating?: string;
    };
  } | undefined;
  const generationType = data?.generationType ?? 'text_to_video';
  const semanticType = data?.semanticType;
  const displayType = semanticType ? `${semanticType} • ${generationType}` : generationType;
  const purpose = data?.purpose ?? 'adaptive';
  const strategy = data?.strategy ?? 'per_playthrough';
  const intimacyBand = data?.socialContext?.intimacyBand ?? 'light';
  const contentRating = data?.socialContext?.contentRating ?? 'romantic';

  return (
    <div className="px-3 py-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-fuchsia-500 dark:text-fuchsia-300 text-xl">✧</span>
          <div className="text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">
            Intimacy Generation
          </div>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300">
          {displayType}
        </span>
      </div>

      {/* Social context */}
      <div className="flex flex-wrap gap-1 text-[10px]">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
          Band: <span className="font-semibold">{intimacyBand}</span>
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
          Rating: <span className="font-semibold">{contentRating}</span>
        </span>
      </div>

      {/* Purpose / strategy */}
      <div className="flex flex-wrap gap-1 text-[10px] text-neutral-600 dark:text-neutral-300">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
          Purpose: <span className="font-medium">{purpose}</span>
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
          Strategy: <span className="font-medium">{strategy}</span>
        </span>
      </div>

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

export default IntimacyGenerationNodeRenderer;
