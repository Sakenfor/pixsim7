/**
 * Utilities for formatting log entries for display
 */

import type { LogEntry } from '$lib/api/client';

/**
 * Format a machine-readable message into human-readable text
 */
export function formatLogMessage(log: LogEntry): string {
  // Use legacy message field if available (for old logs)
  if (log.message) {
    return log.message;
  }

  const msg = log.msg || '';

  // Common event message mappings
  const messageMap: Record<string, string> = {
    // Pipeline events
    'pipeline:start': 'Pipeline started',
    'pipeline:artifact': 'Artifact created',
    'pipeline:complete': 'Pipeline completed',
    'pipeline:error': 'Pipeline error',

    // Provider events
    'provider:map_params': 'Mapped parameters for provider',
    'provider:submit': 'Submitted to provider',
    'provider:status': 'Checked provider status',
    'provider:complete': 'Provider job completed',
    'provider:error': 'Provider error',
    'provider:timeout': 'Provider timeout',

    // Job events
    'job_submitted_to_provider': 'Job submitted to provider',
    'job_status_updated': 'Job status updated',
    'job_completed': 'Job completed',
    'job_failed': 'Job failed',
    'job_created': 'Job created',

    // Artifact events
    'artifact_created': 'Artifact created',
    'artifact_uploaded': 'Artifact uploaded',
    'artifact_download_started': 'Started downloading artifact',
    'artifact_download_complete': 'Artifact downloaded',

    // Retry events
    'retry:decision': 'Retry decision evaluated',
    'retry:scheduled': 'Retry scheduled',
    'retry:executing': 'Executing retry',

    // General events
    'request_received': 'Request received',
    'request_complete': 'Request completed',
    'validation_error': 'Validation error',
    'authentication_failed': 'Authentication failed',
  };

  // Direct mapping
  if (messageMap[msg]) {
    return messageMap[msg];
  }

  // Pattern-based formatting
  if (msg.includes('_')) {
    // Convert snake_case to Title Case
    return msg
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Fallback: return original message
  return msg;
}

/**
 * Format stage name with icon and readable label
 */
export function formatStage(stage: string | null | undefined): { icon: string; label: string; rawStage: string } | null {
  if (!stage) return null;

  const stageMap: Record<string, { icon: string; label: string }> = {
    'pipeline:start': { icon: '▶️', label: 'Pipeline Start' },
    'pipeline:artifact': { icon: '📦', label: 'Artifact Created' },
    'pipeline:complete': { icon: '✅', label: 'Pipeline Complete' },
    'pipeline:error': { icon: '❌', label: 'Pipeline Error' },

    'provider:map_params': { icon: '🔄', label: 'Parameter Mapping' },
    'provider:submit': { icon: '🚀', label: 'Provider Submit' },
    'provider:status': { icon: '🔍', label: 'Status Check' },
    'provider:complete': { icon: '✅', label: 'Provider Complete' },
    'provider:error': { icon: '❌', label: 'Provider Error' },
    'provider:timeout': { icon: '⏱️', label: 'Provider Timeout' },

    'retry:decision': { icon: '🤔', label: 'Retry Decision' },
    'retry:scheduled': { icon: '⏰', label: 'Retry Scheduled' },
    'retry:executing': { icon: '🔁', label: 'Retrying' },
  };

  const mapped = stageMap[stage];
  if (mapped) {
    return { ...mapped, rawStage: stage };
  }

  // Pattern-based formatting for unknown stages
  if (stage.includes(':')) {
    const [category, action] = stage.split(':');
    const icon = category === 'pipeline' ? '⚙️' : category === 'provider' ? '🔌' : '📋';
    const label = `${capitalize(category)}: ${capitalize(action)}`;
    return { icon, label, rawStage: stage };
  }

  return { icon: '📋', label: capitalize(stage), rawStage: stage };
}

/**
 * Format duration in milliseconds to human-readable format
 */
export function formatDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null;

  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Format operation type for display
 */
export function formatOperationType(opType: string | null | undefined): string | null {
  if (!opType) return null;

  const typeMap: Record<string, string> = {
    'text_to_video': 'Text → Video',
    'image_to_video': 'Image → Video',
    'video_to_video': 'Video → Video',
    'text_to_image': 'Text → Image',
  };

  return typeMap[opType] || capitalize(opType.replace(/_/g, ' '));
}

/**
 * Get a display-friendly provider name
 */
export function formatProviderName(providerId: string | null | undefined): string | null {
  if (!providerId) return null;

  const providerMap: Record<string, string> = {
    'pixverse': 'Pixverse',
    'sora': 'Sora',
    'runway': 'Runway',
    'pika': 'Pika',
    'haiper': 'Haiper',
  };

  return providerMap[providerId] || capitalize(providerId);
}

/**
 * Capitalize first letter of a string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get color class for operation type badge
 */
export function getOperationTypeColor(opType: string | null | undefined): string {
  if (!opType) return 'bg-gray-700 text-gray-300';

  if (opType.includes('video')) {
    return 'bg-purple-900/50 text-purple-300';
  } else if (opType.includes('image')) {
    return 'bg-blue-900/50 text-blue-300';
  }

  return 'bg-gray-700 text-gray-300';
}

/**
 * Get color class for provider badge
 */
export function getProviderColor(providerId: string | null | undefined): string {
  if (!providerId) return 'bg-gray-700 text-gray-300';

  const colorMap: Record<string, string> = {
    'pixverse': 'bg-pink-900/50 text-pink-300',
    'sora': 'bg-green-900/50 text-green-300',
    'runway': 'bg-blue-900/50 text-blue-300',
    'pika': 'bg-yellow-900/50 text-yellow-300',
    'haiper': 'bg-indigo-900/50 text-indigo-300',
  };

  return colorMap[providerId] || 'bg-gray-700 text-gray-300';
}

/**
 * Get the primary display text for a log entry
 * Combines formatted message with contextual information
 */
export function getLogDisplayText(log: LogEntry): string {
  const baseMessage = formatLogMessage(log);
  const parts: string[] = [baseMessage];

  // Add provider context if available
  if (log.provider_id && !baseMessage.toLowerCase().includes('provider')) {
    parts.push(`(${formatProviderName(log.provider_id)})`);
  }

  // Add error type if this is an error
  if (log.error_type && log.level === 'ERROR') {
    parts.push(`[${log.error_type}]`);
  }

  return parts.join(' ');
}

/**
 * Determine if a log entry represents an error or warning state
 */
export function isErrorOrWarning(log: LogEntry): boolean {
  return log.level === 'ERROR' || log.level === 'WARNING' || log.level === 'CRITICAL';
}

/**
 * Get a summary line for expanded log view
 */
export function getLogSummary(log: LogEntry): string {
  const parts: string[] = [];

  if (log.service) parts.push(`Service: ${log.service}`);
  if (log.env) parts.push(`Env: ${log.env}`);
  if (log.stage) {
    const formatted = formatStage(log.stage);
    if (formatted) parts.push(`Stage: ${formatted.label}`);
  }

  return parts.join(' • ');
}
