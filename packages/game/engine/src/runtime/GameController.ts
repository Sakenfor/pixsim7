/**
 * GameController implementation
 *
 * Translates UI input into runtime actions. Provides a clean interface for UIs
 * without exposing runtime internals.
 */

import type {
  GameController as IGameController,
  GameRuntime,
  GameInputIntent,
  InteractionIntent,
} from './types';

/**
 * GameController implementation
 */
export class GameController implements IGameController {
  private runtime: GameRuntime | null = null;

  /**
   * Attach a runtime instance to this controller
   */
  attachRuntime(runtime: GameRuntime): void {
    if (this.runtime) {
      console.warn('[GameController] Replacing existing runtime');
    }
    this.runtime = runtime;
  }

  /**
   * Detach the current runtime
   */
  detachRuntime(): void {
    this.runtime = null;
  }

  /**
   * Get the attached runtime (read-only)
   */
  getRuntime(): GameRuntime | null {
    return this.runtime;
  }

  /**
   * Handle a user input intent
   */
  async handleInput(intent: GameInputIntent): Promise<void> {
    if (!this.runtime) {
      throw new Error('No runtime attached to controller');
    }

    switch (intent.type) {
      case 'interact':
        await this.handleInteract(intent);
        break;

      case 'selectOption':
        await this.handleSelectOption(intent);
        break;

      case 'advanceTime':
        await this.handleAdvanceTime(intent);
        break;

      case 'loadSession':
        await this.handleLoadSession(intent);
        break;

      case 'saveSession':
        await this.handleSaveSession();
        break;

      default:
        throw new Error(`Unknown input intent type: ${(intent as any).type}`);
    }
  }

  /**
   * Check if controller is ready (has runtime attached)
   */
  isReady(): boolean {
    return this.runtime !== null;
  }

  // ============================================
  // Private Intent Handlers
  // ============================================

  private async handleInteract(intent: Extract<GameInputIntent, { type: 'interact' }>): Promise<void> {
    if (!this.runtime) return;

    const session = this.runtime.getSession();
    const world = this.runtime.getWorld();
    if (!session) {
      throw new Error('No session loaded');
    }

    const interactionIntent: InteractionIntent = {
      interactionId: intent.interactionId,
      npcId: intent.npcId,
      worldId: world?.id ?? 0,
      sessionId: session.id,
      hotspotId: intent.hotspotId,
      playerInput: intent.playerInput,
      context: intent.context,
    };

    await this.runtime.applyInteraction(interactionIntent);
  }

  private async handleSelectOption(
    intent: Extract<GameInputIntent, { type: 'selectOption' }>
  ): Promise<void> {
    if (!this.runtime) return;

    const session = this.runtime.getSession();
    const world = this.runtime.getWorld();
    if (!session) {
      throw new Error('No session loaded');
    }

    // Select option is essentially an interaction with a choice
    const interactionIntent: InteractionIntent = {
      interactionId: intent.interactionId,
      npcId: intent.npcId,
      worldId: world?.id ?? 0,
      sessionId: session.id,
      playerInput: intent.choiceText,
      context: {
        choiceId: intent.choiceId,
      },
    };

    await this.runtime.applyInteraction(interactionIntent);
  }

  private async handleAdvanceTime(
    intent: Extract<GameInputIntent, { type: 'advanceTime' }>
  ): Promise<void> {
    if (!this.runtime) return;

    await this.runtime.advanceWorldTime(intent.deltaSeconds);
  }

  private async handleLoadSession(
    intent: Extract<GameInputIntent, { type: 'loadSession' }>
  ): Promise<void> {
    if (!this.runtime) return;

    await this.runtime.loadSession(intent.sessionId, intent.loadWorld);
  }

  private async handleSaveSession(): Promise<void> {
    if (!this.runtime) return;

    await this.runtime.saveSession();
  }
}

/**
 * Factory function to create a GameController instance
 */
export function createGameController(): IGameController {
  return new GameController();
}
