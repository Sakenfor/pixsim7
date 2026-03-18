import { Icon } from '@lib/icons';
import { createBadgeWidget, BADGE_SLOT, BADGE_PRIORITY, buildRemoveWidget, type OverlayWidget } from '@lib/ui/overlay';

export interface CompactAssetCardLocalWidgetsOptions {
  showRemoveButton: boolean;
  isLocalOnly: boolean;
  isVideo: boolean;
  hasLockedFrame: boolean;
  lockedTimestamp?: number;
  onRemove?: () => void;
  onGenerate?: () => void;
  generating?: boolean;
  onUploadToProvider?: () => void | Promise<void>;
  skipped?: boolean;
  onToggleSkip?: () => void;
}

/**
 * Build compact-card-only local widgets (outside the shared configurable policy):
 * - remove button
 * - local-only status indicator
 * - locked-frame timestamp
 * - compact generate button
 */
export function buildCompactAssetCardLocalWidgets({
  showRemoveButton,
  isLocalOnly,
  isVideo,
  hasLockedFrame,
  lockedTimestamp,
  onRemove,
  onGenerate,
  generating = false,
  onUploadToProvider,
  skipped,
  onToggleSkip,
}: CompactAssetCardLocalWidgetsOptions): OverlayWidget[] {
  const widgets: OverlayWidget[] = [];

  if (showRemoveButton && onRemove) {
    widgets.push(buildRemoveWidget(onRemove, {
      id: 'remove-asset',
      tooltip: 'Remove',
      visibility: { trigger: 'always' },
      className: '!bg-red-600 hover:!bg-red-700 !text-white opacity-70 hover:opacity-100',
    }));
  }

  if (onToggleSkip) {
    widgets.push(createBadgeWidget({
      id: 'skip-toggle',
      ...BADGE_SLOT.topRight,
      visibility: { trigger: skipped ? 'always' : 'hover-container' },
      variant: 'icon',
      icon: 'eyeOff',
      color: 'gray',
      shape: 'circle',
      tooltip: skipped ? 'Include in generation' : 'Skip in generation',
      onClick: onToggleSkip,
      className: skipped
        ? '!bg-amber-500 hover:!bg-amber-600 !text-white'
        : '!bg-white/80 dark:!bg-neutral-800/80 !text-neutral-400 hover:!text-amber-500 backdrop-blur-sm opacity-70 hover:opacity-100',
      priority: BADGE_PRIORITY.important,
    }));
  }

  if (isLocalOnly) {
    widgets.push(createBadgeWidget({
      id: 'local-only-status',
      ...BADGE_SLOT.topRight,
      variant: 'icon',
      icon: 'alertTriangle',
      color: 'orange',
      shape: 'circle',
      tooltip: 'Local only - not synced to provider',
      className: 'cq-btn-md !bg-amber-500/80',
      priority: BADGE_PRIORITY.interactive,
    }));
  }

  if (isVideo && hasLockedFrame) {
    widgets.push({
      id: 'locked-frame',
      type: 'custom',
      ...BADGE_SLOT.topLeft,
      priority: BADGE_PRIORITY.status,
      render: () => (
        <div className="cq-badge-xs bg-accent/90 text-accent-text rounded whitespace-nowrap flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
          {lockedTimestamp?.toFixed(1)}s
        </div>
      ),
    });
  }

  if (!onUploadToProvider && onGenerate) {
    widgets.push({
      id: 'generate-button',
      type: 'custom',
      ...BADGE_SLOT.bottomLeft,
      visibility: { trigger: 'hover-container' },
      interactive: true,
      handlesOwnInteraction: true,
      priority: BADGE_PRIORITY.interactive,
      render: () => (
        <button
          onClick={(e) => { e.stopPropagation(); onGenerate(); }}
          className="cq-btn-sm rounded-full bg-accent hover:bg-accent/80 flex items-center justify-center transition-all disabled:opacity-30 hover:animate-hover-pop"
          title="Generate"
          disabled={generating}
        >
          <Icon name="play" size={10} variant="default" className="text-accent-text ml-px" />
        </button>
      ),
    });
  }

  return widgets;
}

