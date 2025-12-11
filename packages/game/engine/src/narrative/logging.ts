/**
 * Structured Logging for Narrative/Scene/Generation Systems
 *
 * Provides consistent, structured logging with context (programId, npcId, sceneId)
 * to aid diagnostics and debugging.
 *
 * @example
 * ```ts
 * const log = createNarrativeLogger('NarrativeController');
 *
 * // Log with structured context
 * log.info('Starting narrative', { programId: 'intro', npcId: 1 });
 * log.debug('Processing node', { nodeId: 'n1', nodeType: 'dialogue' });
 * log.warn('Pool content not found', { sceneId: 'scene_1' });
 * log.error('Generation failed', { error: err, strategy: 'extend_video' });
 * ```
 */

// =============================================================================
// Log Level and Types
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log context fields.
 * Common fields used across narrative/scene/generation systems.
 */
export interface NarrativeLogContext {
  // Core identifiers
  programId?: string;
  npcId?: number;
  sceneId?: string;
  nodeId?: string;
  nodeType?: string;

  // Session/state
  sessionId?: number;
  userId?: number;

  // Generation-specific
  strategy?: string;
  jobId?: string;
  contentType?: string;

  // Scene-specific
  edgeId?: string;
  playbackState?: string;

  // Timing
  durationMs?: number;

  // Error info
  error?: Error | string;
  errorCode?: string;

  // Custom fields
  [key: string]: unknown;
}

/**
 * Structured log entry.
 */
export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
  context: NarrativeLogContext;
}

// =============================================================================
// Logger Configuration
// =============================================================================

export interface LoggerConfig {
  /** Minimum log level to output */
  minLevel?: LogLevel;
  /** Enable/disable logging */
  enabled?: boolean;
  /** Custom log handler (for testing or external logging) */
  handler?: (entry: LogEntry) => void;
  /** Include timestamps in console output */
  includeTimestamp?: boolean;
  /** Format context as JSON */
  formatAsJson?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Global config (can be modified at runtime)
let globalConfig: LoggerConfig = {
  minLevel: 'info',
  enabled: true,
  includeTimestamp: false,
  formatAsJson: false,
};

/**
 * Configure global logging settings.
 */
export function configureLogging(config: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Enable debug logging for all narrative loggers.
 */
export function enableDebugLogging(): void {
  globalConfig.minLevel = 'debug';
}

/**
 * Disable all logging.
 */
export function disableLogging(): void {
  globalConfig.enabled = false;
}

// =============================================================================
// Logger Implementation
// =============================================================================

/**
 * Narrative logger with structured context support.
 */
export interface NarrativeLogger {
  debug(message: string, context?: NarrativeLogContext): void;
  info(message: string, context?: NarrativeLogContext): void;
  warn(message: string, context?: NarrativeLogContext): void;
  error(message: string, context?: NarrativeLogContext): void;
  child(additionalContext: NarrativeLogContext): NarrativeLogger;
}

/**
 * Create a structured logger for narrative/scene/generation systems.
 *
 * @param source - Logger source name (e.g., 'NarrativeController', 'SceneIntegration')
 * @param baseContext - Base context to include in all log entries
 * @returns Logger instance
 *
 * @example
 * ```ts
 * const log = createNarrativeLogger('GenerationBridge', { npcId: 1 });
 * log.info('Resolving content', { programId: 'intro', strategy: 'pool_fallback' });
 * ```
 */
export function createNarrativeLogger(
  source: string,
  baseContext?: NarrativeLogContext
): NarrativeLogger {
  const log = (level: LogLevel, message: string, context?: NarrativeLogContext): void => {
    if (!globalConfig.enabled) return;
    if (LOG_LEVELS[level] < LOG_LEVELS[globalConfig.minLevel || 'info']) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      source,
      message,
      context: { ...baseContext, ...context },
    };

    // Use custom handler if provided
    if (globalConfig.handler) {
      globalConfig.handler(entry);
      return;
    }

    // Format output
    const output = formatLogEntry(entry);

    // Output to console
    switch (level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  };

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
    child: (additionalContext) =>
      createNarrativeLogger(source, { ...baseContext, ...additionalContext }),
  };
}

/**
 * Format a log entry for console output.
 */
function formatLogEntry(entry: LogEntry): string {
  const { level, source, message, context, timestamp } = entry;

  // Build prefix
  const levelIcon = getLevelIcon(level);
  const timeStr = globalConfig.includeTimestamp
    ? `[${new Date(timestamp).toISOString().slice(11, 23)}] `
    : '';

  // Build context string
  let contextStr = '';
  if (Object.keys(context).length > 0) {
    // Filter out undefined values
    const cleanContext: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined) {
        // Handle errors specially
        if (key === 'error' && value instanceof Error) {
          cleanContext[key] = value.message;
          cleanContext.errorStack = value.stack;
        } else {
          cleanContext[key] = value;
        }
      }
    }

    if (Object.keys(cleanContext).length > 0) {
      if (globalConfig.formatAsJson) {
        contextStr = ` ${JSON.stringify(cleanContext)}`;
      } else {
        contextStr = ` ${formatContextCompact(cleanContext)}`;
      }
    }
  }

  return `${timeStr}${levelIcon} [${source}] ${message}${contextStr}`;
}

/**
 * Get icon for log level.
 */
function getLevelIcon(level: LogLevel): string {
  switch (level) {
    case 'debug':
      return '🔍';
    case 'info':
      return 'ℹ️';
    case 'warn':
      return '⚠️';
    case 'error':
      return '❌';
  }
}

/**
 * Format context as compact key=value pairs.
 */
function formatContextCompact(context: Record<string, unknown>): string {
  const parts: string[] = [];

  // Priority keys to show first
  const priorityKeys = ['programId', 'npcId', 'sceneId', 'nodeId', 'strategy'];

  for (const key of priorityKeys) {
    if (key in context) {
      parts.push(`${key}=${formatValue(context[key])}`);
    }
  }

  // Other keys
  for (const [key, value] of Object.entries(context)) {
    if (!priorityKeys.includes(key) && key !== 'errorStack') {
      parts.push(`${key}=${formatValue(value)}`);
    }
  }

  return `(${parts.join(', ')})`;
}

/**
 * Format a single value for logging.
 */
function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value.length > 50 ? `"${value.slice(0, 47)}..."` : `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return `{${Object.keys(value as object).length} keys}`;
  return String(value);
}

// =============================================================================
// Pre-configured Loggers
// =============================================================================

/**
 * Logger for NarrativeController.
 */
export const narrativeLog = createNarrativeLogger('Narrative');

/**
 * Logger for ScenePlaybackController.
 */
export const sceneLog = createNarrativeLogger('Scene');

/**
 * Logger for GenerationBridge.
 */
export const generationLog = createNarrativeLogger('Generation');

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a timing utility for measuring operation duration.
 *
 * @example
 * ```ts
 * const timer = startTimer();
 * // ... do work ...
 * log.info('Operation complete', { durationMs: timer() });
 * ```
 */
export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

/**
 * Wrap a function to log its execution time.
 */
export function withTiming<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  logger: NarrativeLogger,
  operationName: string
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const timer = startTimer();
    try {
      const result = await fn(...args);
      logger.debug(`${operationName} completed`, { durationMs: timer() });
      return result;
    } catch (error) {
      logger.error(`${operationName} failed`, { durationMs: timer(), error: error as Error });
      throw error;
    }
  }) as T;
}
