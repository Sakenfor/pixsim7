/**
 * Cooldown Utilities
 *
 * Helper functions for calculating and formatting interaction cooldowns
 */

/**
 * Calculate remaining cooldown time in seconds
 */
export function getRemainingCooldown(
  lastUsedTimestamp: number | undefined,
  cooldownSeconds: number | undefined,
  currentTime: number = Math.floor(Date.now() / 1000)
): number {
  if (!lastUsedTimestamp || !cooldownSeconds) {
    return 0;
  }

  const elapsed = currentTime - lastUsedTimestamp;
  const remaining = cooldownSeconds - elapsed;

  return Math.max(0, remaining);
}

/**
 * Check if an interaction is on cooldown
 */
export function isOnCooldown(
  lastUsedTimestamp: number | undefined,
  cooldownSeconds: number | undefined,
  currentTime: number = Math.floor(Date.now() / 1000)
): boolean {
  return getRemainingCooldown(lastUsedTimestamp, cooldownSeconds, currentTime) > 0;
}

/**
 * Format cooldown time as human-readable string
 */
export function formatCooldown(seconds: number): string {
  if (seconds <= 0) {
    return 'Ready';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }

  return `${secs}s`;
}

/**
 * Format cooldown time with precision based on remaining time
 */
export function formatCooldownSmart(seconds: number): string {
  if (seconds <= 0) {
    return 'Ready';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  // For long cooldowns, show only hours/minutes
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  // For medium cooldowns, show minutes/seconds
  if (minutes > 5) {
    return `${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }

  // For short cooldowns, show seconds only
  return `${secs}s`;
}

/**
 * Get cooldown progress percentage (0-100)
 */
export function getCooldownProgress(
  lastUsedTimestamp: number | undefined,
  cooldownSeconds: number | undefined,
  currentTime: number = Math.floor(Date.now() / 1000)
): number {
  if (!lastUsedTimestamp || !cooldownSeconds) {
    return 100; // Fully ready
  }

  const elapsed = currentTime - lastUsedTimestamp;
  const progress = Math.min(100, (elapsed / cooldownSeconds) * 100);

  return Math.floor(progress);
}

/**
 * Get next available timestamp for an interaction
 */
export function getNextAvailableTime(
  lastUsedTimestamp: number | undefined,
  cooldownSeconds: number | undefined
): number | null {
  if (!lastUsedTimestamp || !cooldownSeconds) {
    return null;
  }

  return lastUsedTimestamp + cooldownSeconds;
}

/**
 * Calculate cooldown from session data for a target ref
 */
export function getCooldownFromSession(
  interactionId: string,
  entityRef: string,
  sessionFlags: Record<string, any>
): { lastUsed: number | undefined; remaining: number } {
  const interactions = sessionFlags?.interactions || {};
  const targetData = interactions[entityRef] || {};
  const lastUsedMap = targetData.lastUsedAt || {};
  const lastUsed = lastUsedMap[interactionId];

  return {
    lastUsed,
    remaining: 0, // Will be calculated with cooldownSeconds from definition
  };
}

/**
 * Extract all cooldown data for a target ref from session
 */
export function getAllCooldownsForTarget(
  entityRef: string,
  sessionFlags: Record<string, any>
): Record<string, number> {
  const interactions = sessionFlags?.interactions || {};
  const targetData = interactions[entityRef] || {};
  const lastUsedMap = targetData.lastUsedAt || {};

  return lastUsedMap;
}
