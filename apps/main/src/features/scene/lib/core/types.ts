/**
 * Scene Playback Types
 *
 * Core types for scene execution and playback tracking.
 */

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
