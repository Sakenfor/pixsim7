/**
 * Preview Bridge - PostMessage Utility
 *
 * Handles communication between the Scene Editor and Game Player iframe.
 */

import type { Scene } from '@/lib/registries';
import type {
  EditorToGameMessage,
  GameToEditorMessage,
  LoadSceneMessage,
  PlaySceneMessage,
  PauseSceneMessage,
  StopSceneMessage,
  SeekToNodeMessage,
  SetAuthTokenMessage,
} from './messageTypes';
import { isGameToEditorMessage } from './messageTypes';
import { logEvent } from '@lib/utils/logging';

export class PreviewBridge {
  private iframe: HTMLIFrameElement | null = null;
  private targetOrigin: string;
  private messageHandlers: Map<string, ((message: GameToEditorMessage) => void)[]> = new Map();

  constructor(targetOrigin: string = '*') {
    this.targetOrigin = targetOrigin;
    this.setupMessageListener();
  }

  /**
   * Set the target iframe element
   */
  setIframe(iframe: HTMLIFrameElement | null) {
    this.iframe = iframe;
  }

  /**
   * Get the iframe's content window
   */
  private getContentWindow(): Window | null {
    return this.iframe?.contentWindow || null;
  }

  /**
   * Send a message to the game iframe
   */
  private sendMessage(message: EditorToGameMessage): boolean {
    const contentWindow = this.getContentWindow();
    if (!contentWindow) {
      console.warn('[PreviewBridge] No iframe content window available');
      return false;
    }

    try {
      logEvent('DEBUG', 'preview_bridge_send', { type: message.type });
      contentWindow.postMessage(message, this.targetOrigin);
      return true;
    } catch (error) {
      console.error('[PreviewBridge] Failed to send message:', error);
      return false;
    }
  }

  /**
   * Setup listener for messages from the game iframe
   */
  private setupMessageListener() {
    window.addEventListener('message', (event) => {
      // Validate origin if needed
      // if (event.origin !== expectedOrigin) return;

      const message = event.data;
      if (!isGameToEditorMessage(message)) {
        return; // Not a game message
      }

      logEvent('DEBUG', 'preview_bridge_receive', { type: message.type });

      // Notify all handlers for this message type
      const handlers = this.messageHandlers.get(message.type) || [];
      handlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error('[PreviewBridge] Handler error:', error);
        }
      });

      // Notify wildcard handlers
      const wildcardHandlers = this.messageHandlers.get('*') || [];
      wildcardHandlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error('[PreviewBridge] Wildcard handler error:', error);
        }
      });
    });
  }

  /**
   * Subscribe to messages from the game
   */
  on(messageType: string, handler: (message: GameToEditorMessage) => void): () => void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    this.messageHandlers.get(messageType)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(messageType);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  // ============================================================================
  // Public API - Send commands to game
  // ============================================================================

  /**
   * Load a scene into the game player
   */
  loadScene(scene: Scene, autoPlay: boolean = true): boolean {
    const message: LoadSceneMessage = {
      type: 'load-scene',
      payload: { scene, autoPlay },
    };
    return this.sendMessage(message);
  }

  /**
   * Start/resume playback
   */
  play(): boolean {
    const message: PlaySceneMessage = {
      type: 'play-scene',
    };
    return this.sendMessage(message);
  }

  /**
   * Pause playback
   */
  pause(): boolean {
    const message: PauseSceneMessage = {
      type: 'pause-scene',
    };
    return this.sendMessage(message);
  }

  /**
   * Stop playback and reset
   */
  stop(): boolean {
    const message: StopSceneMessage = {
      type: 'stop-scene',
    };
    return this.sendMessage(message);
  }

  /**
   * Jump to a specific node
   */
  seekToNode(nodeId: string): boolean {
    const message: SeekToNodeMessage = {
      type: 'seek-to-node',
      payload: { nodeId },
    };
    return this.sendMessage(message);
  }

  /**
   * Send auth token to game iframe
   */
  sendAuthToken(token: string | null): boolean {
    const message: SetAuthTokenMessage = {
      type: 'set-auth-token',
      payload: { token },
    };
    return this.sendMessage(message);
  }
}

// Singleton instance
export const previewBridge = new PreviewBridge();
