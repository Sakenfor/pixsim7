/**
 * WebSocket Message Envelope Types
 *
 * Defines the structure of messages sent over WebSocket connections.
 * Part of Phase 31.2 - WebSocket Contract & Keep-Alive Tests.
 */

/**
 * Base message envelope for all JSON messages over WebSocket.
 *
 * Plain text messages (ping/pong) bypass this envelope.
 */
export interface WebSocketMessage<T = unknown> {
  /** Message type identifier (e.g., 'connected', 'job:status', 'generation:update') */
  type: string;

  /** Optional message payload */
  payload?: T;

  /** Optional additional data (deprecated - use payload) */
  data?: T;

  /** Optional error information */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Connection established message
 */
export interface ConnectedMessage extends WebSocketMessage<void> {
  type: 'connected';
  message?: string;
  user_id?: number;
}

/**
 * Generation status update message
 */
export interface GenerationStatusMessage<T = any> extends WebSocketMessage<T> {
  type: 'job:created' | 'job:processing' | 'job:completed' | 'job:failed';
  generation_id?: number;
  status?: string;
  user_id?: number;
  data?: T;
}

/**
 * Error message
 */
export interface ErrorMessage extends WebSocketMessage<void> {
  type: 'error';
  error: {
    code: string;
    message: string;
  };
}

/**
 * Type guard to check if a message is a valid WebSocketMessage
 */
export function isWebSocketMessage(data: unknown): data is WebSocketMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as any).type === 'string'
  );
}

/**
 * Parse WebSocket message with validation.
 *
 * Returns null for plain text messages (ping/pong keep-alives).
 * Returns parsed message for JSON messages.
 * Throws for invalid JSON or messages without a type field.
 */
export function parseWebSocketMessage(
  raw: string | MessageEvent
): WebSocketMessage | null {
  const data = typeof raw === 'string' ? raw : raw.data;

  // Handle plain text keep-alive messages
  if (data === 'pong' || data === 'ping') {
    return null;
  }

  try {
    const parsed = JSON.parse(data);

    if (!isWebSocketMessage(parsed)) {
      throw new Error('Message missing required "type" field');
    }

    return parsed;
  } catch (err) {
    console.error('[WebSocket] Failed to parse message:', err, 'Raw:', data);
    throw err;
  }
}
