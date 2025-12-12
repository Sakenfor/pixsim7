import { NodeRendererProps } from '../../lib/editor/nodeRendererRegistry';

/**
 * Custom renderer for video nodes - shows media thumbnail and playback info
 */
export function VideoNodeRenderer({ node, isSelected, isStart, hasErrors }: NodeRendererProps) {
  // Extract media info
  const mediaUrl = node.mediaUrl || node.media?.[0]?.url;
  const hasMedia = !!mediaUrl;
  const mediaCount = node.media?.length || 0;
  const playbackMode = node.playback?.kind || 'normal';
  const selectionMode = node.selection?.kind || 'ordered';

  // Check if it's a mini-game
  const isMiniGame = node.metadata?.isMiniGame;

  return (
    <div className="space-y-2">
      {/* Video Preview/Thumbnail */}
      <div className="relative">
        {hasMedia ? (
          <div className="aspect-video bg-black rounded overflow-hidden">
            <video
              src={mediaUrl}
              className="w-full h-full object-cover"
              preload="metadata"
              muted
            />
            {/* Overlay gradient for better text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
          </div>
        ) : (
          <div className="aspect-video bg-neutral-100 dark:bg-neutral-800 rounded flex items-center justify-center">
            <div className="text-center">
              <span className="text-4xl">{isMiniGame ? '🎮' : '🎬'}</span>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                No media
              </div>
            </div>
          </div>
        )}

        {/* Playback Mode Badge */}
        {playbackMode !== 'normal' && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-blue-500 text-white text-xs rounded shadow-md font-medium">
            {playbackMode === 'loopSegment' && '🔁 Loop'}
            {playbackMode === 'progression' && '📈 Progression'}
          </div>
        )}

        {/* Mini-Game Badge */}
        {isMiniGame && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-green-500 text-white text-xs rounded shadow-md font-medium">
            🎮 Mini-Game
          </div>
        )}

        {/* Media Count Badge */}
        {mediaCount > 1 && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 text-white text-xs rounded shadow-md font-medium">
            📚 {mediaCount} clips
          </div>
        )}
      </div>

      {/* Metadata Section */}
      <div className="px-3 py-2 space-y-1.5 text-xs">
        {/* Selection Strategy */}
        {mediaCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-neutral-500 dark:text-neutral-400">Selection:</span>
            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded font-medium">
              {selectionMode === 'ordered' && '📋 Ordered'}
              {selectionMode === 'random' && '🎲 Random'}
              {selectionMode === 'pool' && '🎯 Pool'}
            </span>
          </div>
        )}

        {/* NPC Metadata */}
        {(node.metadata?.speakerRole || node.metadata?.npc_id) && (
          <div className="flex flex-wrap gap-1">
            {node.metadata?.speakerRole && (
              <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded font-medium" title="Speaker Role">
                👤 {node.metadata.speakerRole}
              </span>
            )}
            {node.metadata?.npc_id && (
              <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded font-medium" title="NPC Binding">
                🔒 NPC #{node.metadata.npc_id}
              </span>
            )}
          </div>
        )}

        {/* Node ID */}
        <div className="text-neutral-500 dark:text-neutral-400">
          ID: {node.id}
        </div>
      </div>
    </div>
  );
}

// Default export for auto-wire system (import.meta.glob)
export default VideoNodeRenderer;
