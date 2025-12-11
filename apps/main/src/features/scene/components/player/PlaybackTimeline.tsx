import { Badge } from '@pixsim7/shared.ui';

/**
 * Playback event for timeline tracking
 */
export interface PlaybackEvent {
  /** Node ID that was executed */
  nodeId: string;
  /** Type of node */
  nodeType: string;
  /** Node label or display name */
  label?: string;
  /** Timestamp of execution */
  timestamp: number;
  /** Optional choice made (for choice nodes) */
  choice?: string;
  /** Optional condition result (for condition nodes) */
  conditionResult?: boolean;
}

export interface PlaybackTimelineProps {
  /** Array of playback events */
  events: PlaybackEvent[];
}

/**
 * Visual timeline showing scene execution path
 *
 * Displays a chronological list of nodes that were executed during playback,
 * helping debug scene flow and understand branching logic.
 */
export function PlaybackTimeline({ events }: PlaybackTimelineProps) {
  /**
   * Get color scheme based on node type
   */
  const getNodeTypeColor = (nodeType: string): string => {
    switch (nodeType) {
      case 'video':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'choice':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'condition':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case 'scene_call':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300';
      case 'return':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      case 'end':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      default:
        return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300';
    }
  };

  /**
   * Format timestamp as time
   */
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  /**
   * Get elapsed time since first event
   */
  const getElapsedTime = (timestamp: number): string => {
    if (events.length === 0) return '0s';
    const firstTimestamp = events[0].timestamp;
    const elapsed = (timestamp - firstTimestamp) / 1000;
    return `+${elapsed.toFixed(1)}s`;
  };

  if (events.length === 0) {
    return (
      <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
        <p className="text-4xl mb-2">📋</p>
        <p className="text-sm">No execution events yet</p>
        <p className="text-xs mt-1">Timeline will appear once you start playback</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Execution Path
        </h3>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {events.map((event, i) => (
          <div
            key={`${event.nodeId}-${i}`}
            className="flex items-start gap-3 p-3 bg-neutral-50 dark:bg-neutral-900/50 rounded-lg border border-neutral-200 dark:border-neutral-700"
          >
            {/* Step number */}
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center font-semibold">
              {i + 1}
            </div>

            {/* Event details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge className={getNodeTypeColor(event.nodeType)}>{event.nodeType}</Badge>
                <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
                  {event.nodeId}
                </span>
              </div>

              {event.label && (
                <div className="text-sm text-neutral-700 dark:text-neutral-300 mb-1">
                  {event.label}
                </div>
              )}

              {/* Additional context */}
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span>{formatTime(event.timestamp)}</span>
                <span>•</span>
                <span>{getElapsedTime(event.timestamp)}</span>

                {event.choice && (
                  <>
                    <span>•</span>
                    <span className="text-purple-600 dark:text-purple-400">
                      Choice: {event.choice}
                    </span>
                  </>
                )}

                {event.conditionResult !== undefined && (
                  <>
                    <span>•</span>
                    <span
                      className={
                        event.conditionResult
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }
                    >
                      Condition: {event.conditionResult ? 'True' : 'False'}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Connector line (except for last item) */}
            {i < events.length - 1 && (
              <div className="absolute left-6 top-12 w-0.5 h-6 bg-neutral-300 dark:bg-neutral-600" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
