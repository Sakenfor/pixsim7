/**
 * Stack Group Utilities
 *
 * Partitions overlay widgets into auto-stacked flex groups and ungrouped widgets.
 * Widgets with the same `stackGroup` + `anchor` are grouped together and rendered
 * in a flex container, eliminating hard-coded position offsets.
 */

import type { OverlayWidget, OverlayAnchor, OverlayPosition } from '../types';
import { isOverlayPosition } from '../types';

export interface StackGroupInfo {
  /** Composite key: `${stackGroup}:${anchor}` */
  key: string;
  /** The stack group name */
  stackGroup: string;
  /** Shared anchor position */
  anchor: OverlayAnchor;
  /** Base offset from the highest-priority widget */
  offset: { x: number | string; y: number | string };
  /** Flex direction for stacking */
  flexDirection: 'column' | 'row';
  /** Align-items value for the flex container */
  alignItems: 'flex-start' | 'flex-end' | 'center';
  /** Widgets sorted by priority descending (highest priority first = closest to anchor) */
  widgets: OverlayWidget[];
  /** Max priority among children (used for z-index) */
  maxPriority: number;
}

export interface PartitionResult {
  stackGroups: StackGroupInfo[];
  ungrouped: OverlayWidget[];
}

/**
 * Determine flex direction based on anchor position.
 * Corner and top/bottom anchors stack vertically; center-left/center-right stack horizontally.
 */
function getFlexDirection(anchor: OverlayAnchor): 'column' | 'row' {
  if (anchor === 'center-left' || anchor === 'center-right') {
    return 'row';
  }
  return 'column';
}

/**
 * Determine align-items based on anchor position.
 * Right-side anchors align to flex-end, left-side to flex-start, center to center.
 */
function getAlignItems(anchor: OverlayAnchor): 'flex-start' | 'flex-end' | 'center' {
  if (anchor.includes('right')) return 'flex-end';
  if (anchor.includes('left')) return 'flex-start';
  return 'center';
}

function alignmentToFlexAlign(
  alignment?: OverlayPosition['alignment'],
): 'flex-start' | 'flex-end' | 'center' | undefined {
  if (alignment === 'start') return 'flex-start';
  if (alignment === 'end') return 'flex-end';
  if (alignment === 'center') return 'center';
  return undefined;
}

/**
 * Partition widgets into stack groups and ungrouped widgets.
 *
 * Widgets with a `stackGroup` AND an anchor-based position are grouped by
 * `stackGroup + anchor`. Each group is sorted by priority descending so the
 * highest-priority widget renders first (closest to the anchor edge).
 *
 * The base offset for the flex container comes from the highest-priority widget.
 */
export function partitionByStackGroup(widgets: OverlayWidget[]): PartitionResult {
  const groupMap = new Map<string, { anchor: OverlayAnchor; stackGroup: string; widgets: OverlayWidget[] }>();
  const ungrouped: OverlayWidget[] = [];

  for (const widget of widgets) {
    if (!widget.stackGroup || !isOverlayPosition(widget.position)) {
      ungrouped.push(widget);
      continue;
    }

    const anchor = widget.position.anchor;
    const key = `${widget.stackGroup}:${anchor}`;

    let group = groupMap.get(key);
    if (!group) {
      group = { anchor, stackGroup: widget.stackGroup, widgets: [] };
      groupMap.set(key, group);
    }
    group.widgets.push(widget);
  }

  const stackGroups: StackGroupInfo[] = [];

  for (const [key, group] of groupMap) {
    // Sort by priority descending — highest priority is closest to anchor
    group.widgets.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // Base offset from the highest-priority widget
    const leader = group.widgets[0];
    const leaderPos = leader.position as { anchor: OverlayAnchor; offset?: { x: number | string; y: number | string } };
    const offset = leaderPos.offset ?? { x: 0, y: 0 };

    const maxPriority = Math.max(...group.widgets.map((w) => w.priority ?? 0));

    const leaderAlignment = isOverlayPosition(leader.position)
      ? alignmentToFlexAlign(leader.position.alignment)
      : undefined;

    stackGroups.push({
      key,
      stackGroup: group.stackGroup,
      anchor: group.anchor,
      offset,
      flexDirection: getFlexDirection(group.anchor),
      alignItems: leaderAlignment ?? getAlignItems(group.anchor),
      widgets: group.widgets,
      maxPriority,
    });
  }

  return { stackGroups, ungrouped };
}
