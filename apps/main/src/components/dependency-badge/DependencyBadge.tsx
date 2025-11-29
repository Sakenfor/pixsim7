/**
 * Dependency Badge Component
 *
 * Displays a visual indicator showing how many other items reference
 * a given entity (scene, arc, collection, campaign).
 *
 * Features:
 * - Shows count of dependencies
 * - Hover tooltip with breakdown
 * - Only renders if dependencies exist
 * - Supports all entity types
 *
 * Usage:
 * ```tsx
 * <DependencyBadge type="scene" id={sceneId} />
 * ```
 */

import { useState } from 'react';
import { Badge } from '@pixsim7/shared.ui';
import { Tooltip } from '@pixsim7/shared.ui';
import { useDependencies } from '@/hooks/useDependencies';

export interface DependencyBadgeProps {
  /** Entity type */
  type: 'scene' | 'arc' | 'collection' | 'campaign';
  /** Entity ID */
  id: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show icon (default: true) */
  showIcon?: boolean;
}

/**
 * Dependency Badge - Shows usage count with hover details
 *
 * Displays a badge showing how many items reference the given entity.
 * Hovering shows a tooltip with a detailed breakdown.
 */
export function DependencyBadge({
  type,
  id,
  className,
  showIcon = true,
}: DependencyBadgeProps) {
  const deps = useDependencies(type, id);
  const [isHovered, setIsHovered] = useState(false);

  // Don't render if no dependencies
  if (deps.total === 0) return null;

  // Build tooltip content
  const tooltipContent = (
    <div className="space-y-1 text-xs">
      <div className="font-semibold">Used by:</div>
      {deps.arcNodes.length > 0 && (
        <div>• {deps.arcNodes.length} arc node{deps.arcNodes.length !== 1 ? 's' : ''}</div>
      )}
      {deps.collections.length > 0 && (
        <div>• {deps.collections.length} collection{deps.collections.length !== 1 ? 's' : ''}</div>
      )}
      {deps.campaigns.length > 0 && (
        <div>• {deps.campaigns.length} campaign{deps.campaigns.length !== 1 ? 's' : ''}</div>
      )}
    </div>
  );

  return (
    <div
      className={`relative inline-block ${className || ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Badge color="blue">
        {showIcon && '🔗 '}
        {deps.total}
      </Badge>
      <Tooltip
        content={tooltipContent}
        show={isHovered}
        position="top"
        variant="info"
      />
    </div>
  );
}

/**
 * Compact variant - Just shows count without icon
 */
export function DependencyBadgeCompact(props: DependencyBadgeProps) {
  return <DependencyBadge {...props} showIcon={false} />;
}

/**
 * Hook to get badge color based on dependency count
 *
 * This can be used to highlight heavily-used items.
 */
export function useDependencyBadgeColor(count: number): 'gray' | 'blue' | 'purple' | 'orange' {
  if (count === 0) return 'gray';
  if (count < 3) return 'blue';
  if (count < 10) return 'purple';
  return 'orange'; // Heavy usage
}
