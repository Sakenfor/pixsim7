/**
 * Capability Badge Registry
 *
 * Maps panel setting scopes (and other capability markers) to small
 * icon badges rendered in dockview tab headers.  Data-driven — the
 * tab component just reads this registry, no per-capability code.
 *
 * To register a new badge:
 *   registerCapabilityBadge({ scopeId: 'analytics', icon: 'barChart', tooltip: 'Has analytics' });
 */

import type { IconName } from '@lib/icons';

export interface CapabilityBadge {
  /** Matches a value in the panel's settingScopes array */
  scopeId: string;
  /** Icon name from the icon set */
  icon: IconName;
  /** Tooltip shown on hover */
  tooltip: string;
  /** Optional ordering (lower = leftmost). Default 100. */
  order?: number;
}

const badges = new Map<string, CapabilityBadge>();

// -- Built-in badges -------------------------------------------------------

const BUILTIN_BADGES: CapabilityBadge[] = [
  {
    scopeId: 'generation',
    icon: 'zap',
    tooltip: 'Generation-capable',
    order: 10,
  },
];

for (const badge of BUILTIN_BADGES) {
  badges.set(badge.scopeId, badge);
}

// -- Public API -------------------------------------------------------------

export function registerCapabilityBadge(badge: CapabilityBadge): void {
  badges.set(badge.scopeId, badge);
}

export function unregisterCapabilityBadge(scopeId: string): void {
  badges.delete(scopeId);
}

/**
 * Resolve badges for a panel's declared scopes.
 * Returns badges sorted by order.
 */
export function resolveBadgesForScopes(
  settingScopes: string[] | undefined,
): CapabilityBadge[] {
  if (!settingScopes?.length) return [];

  const matched: CapabilityBadge[] = [];
  for (const scopeId of settingScopes) {
    const badge = badges.get(scopeId);
    if (badge) matched.push(badge);
  }

  matched.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  return matched;
}
