/**
 * MediaCard overlay-widget identity + per-instance visibility control.
 *
 * Kept out of MediaCard.tsx so that file stays component-only (the
 * `react-refresh/only-export-components` rule errors on a value export beside a
 * component). Import these from here; import the `MediaCard` component itself
 * from `./MediaCard`.
 */

/**
 * Known runtime overlay-widget ids MediaCard injects by default. Handy as a
 * reference when using {@link MediaCardWidgetVisibility} to trim the badge set.
 * Custom widget ids (via `customWidgets`) and picker ids also work — this list
 * is the built-in runtime set, not an exhaustive allow-list.
 */
export const MEDIA_CARD_WIDGET_IDS = {
  primaryIcon: 'primary-icon',
  statusMenu: 'status-menu',
  favoriteToggle: 'favorite-toggle',
  quickTag: 'quick-tag',
  queueStatus: 'queue-status',
  selectionStatus: 'selection-status',
  duration: 'duration',
  videoScrubber: 'video-scrubber',
  generationActionModeBadge: 'generation-action-mode-badge',
  generationButtonGroup: 'generation-button-group',
  versionBadge: 'version',
  archivedBadge: 'archived',
  warningsBadge: 'warnings',
  similarityBadge: 'similarity',
} as const;

/**
 * Per-instance control over which overlay widgets a card renders. MediaCard
 * injects a full runtime badge set by default; a surface that wants a lean card
 * (e.g. a reference tile showing only the scrubber + duration) declares it here
 * instead of fighting the preset/visibility-store machinery.
 *
 * Applied as the FINAL say over the merged preset + runtime + custom widget set,
 * keyed by widget id (see {@link MEDIA_CARD_WIDGET_IDS}).
 */
export interface MediaCardWidgetVisibility {
  /**
   * Allow-list: when set, ONLY these widget ids render. This also re-includes
   * runtime widgets that `compact` density would normally drop (e.g. the video
   * scrubber), so you can get a scrubbing preview on a small card.
   */
  only?: readonly string[];
  /** Deny-list: hide these widget ids. Applied after `only`. */
  hide?: readonly string[];
}
