/**
 * Shared Ad Pill Renderer
 *
 * Centralized rendering logic for Pixverse ad watch task pills.
 * Used across popup and content scripts to ensure consistent display.
 */

/**
 * Render an ad watch task pill element
 *
 * @param {HTMLElement} pillEl - The pill element to render into
 * @param {Object} adTask - Ad task data from backend
 * @param {number} adTask.progress - Current progress count
 * @param {number} adTask.completed_counts - Completed count (preferred)
 * @param {number} adTask.total_counts - Total required count
 * @param {number} adTask.reward - Reward amount
 * @param {Object} options - Rendering options
 * @param {boolean} options.isStale - Whether data is stale
 * @param {boolean} options.includeReward - Include reward in tooltip
 * @param {string} options.fontSize - Font size (default: '10px')
 */
export function renderAdPill(pillEl, adTask, options = {}) {
  const {
    isStale = false,
    includeReward = false,
    fontSize = '10px',
  } = options;

  if (!pillEl) {
    console.warn('[AdPill] No pill element provided');
    return;
  }

  if (!adTask || typeof adTask !== 'object') {
    // Show 0/0 when no task data
    pillEl.textContent = 'Ads 0/0';
    pillEl.title = 'No ad watch task available';
    pillEl.style.fontSize = fontSize;
    pillEl.style.color = '#9ca3af';
    pillEl.style.opacity = '1';
    return;
  }

  // Prefer completed_counts (most accurate), fallback to progress
  const rawProgress = adTask.completed_counts ?? adTask.progress ?? 0;
  const total = adTask.total_counts ?? 0;
  const progress = Math.min(rawProgress, total); // Cap at total
  const reward = adTask.reward ?? 0;

  // Build display text
  const staleIndicator = isStale ? ' ⚠️' : '';
  pillEl.textContent = `Ads ${progress}/${total}${staleIndicator}`;

  // Build tooltip
  const rewardText = includeReward ? `, reward ${reward}` : '';
  const staleMsg = isStale ? ' (refreshing...)' : '';
  pillEl.title = `Watch-ad task: ${progress}/${total}${rewardText}${staleMsg}`;

  // Apply styling
  pillEl.style.fontSize = fontSize;
  pillEl.style.opacity = isStale ? '0.7' : '1';

  // Color logic: green if complete, gray if stale, normal otherwise
  if (progress >= total && total > 0) {
    pillEl.style.color = '#10b981'; // green (success)
  } else if (isStale) {
    pillEl.style.color = '#9ca3af'; // light gray
  } else {
    pillEl.style.color = '#6b7280'; // normal gray
  }
}

/**
 * Extract ad task from payload
 * Helper to normalize payload structure
 *
 * @param {Object} payload - Response payload (could be nested)
 * @returns {Object|null} - Ad task object or null
 */
export function extractAdTask(payload) {
  if (!payload) return null;
  return payload.ad_watch_task ?? null;
}
