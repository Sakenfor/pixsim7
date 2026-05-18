/**
 * GameObject behavior composition layer
 *
 * Object-core refactor (plan `gameobject-runtime-refactor-v1`, checkpoint
 * `genre_extensibility_behaviors`). Multi-genre object logic without
 * `switch (kind)`: behaviors are matched by *capability* / *component*
 * (entity-agnostic), so any kind opts into logic by declaring capabilities -
 * an NPC, a vehicle, or a user-defined kind are all equal here.
 *
 * Additive: nothing in the runtime dispatches through this yet. The seam is
 * `GameObjectEntity.dispatch(registry, intent, ctx?)`.
 */

import type { GameObjectEntity } from './GameObjectEntity';

export interface BehaviorIntent {
  /** Action verb, e.g. 'interact' | 'use' | 'talk' | custom. */
  type: string;
  payload?: Record<string, unknown>;
}

export interface BehaviorContext {
  entity: GameObjectEntity;
  intent: BehaviorIntent;
  /** Opaque host context (the engine passes its session/runtime when wired). */
  host?: unknown;
}

export type BehaviorOutcome =
  | { handled: true; result?: unknown }
  | { handled: false };

export const NOT_HANDLED: BehaviorOutcome = { handled: false };

export interface BehaviorHandler {
  /** Stable id (also the dedupe / unregister key). */
  id: string;
  /** Match when the entity has this capability (enabled). */
  capability?: string;
  /** Match when the entity has this component (enabled). */
  component?: string;
  /** Optional further narrowing by intent verb. */
  intent?: string;
  /** Higher wins. Equal priority falls back to registration order. Default 0. */
  priority?: number;
  handle(ctx: BehaviorContext): BehaviorOutcome | Promise<BehaviorOutcome>;
}

function handlerMatches(
  handler: BehaviorHandler,
  entity: GameObjectEntity,
  intent: BehaviorIntent
): boolean {
  if (handler.intent !== undefined && handler.intent !== intent.type) {
    return false;
  }
  if (handler.capability !== undefined && !entity.hasCapability(handler.capability)) {
    return false;
  }
  if (handler.component !== undefined && !entity.hasComponent(handler.component)) {
    return false;
  }
  // A handler with no capability/component/intent constraint is a global
  // fallback (matches every entity) - allowed but should be rare.
  return true;
}

/**
 * Capability/component-keyed behavior registry with chain-of-responsibility
 * dispatch. Resolution is purely by declared capabilities/components, never by
 * `kind` - that is what makes it multi-genre.
 */
export class GameObjectBehaviorRegistry {
  private readonly handlers: BehaviorHandler[] = [];
  private seq = 0;
  private readonly order = new Map<string, number>();

  register(handler: BehaviorHandler): this {
    if (!handler.id) {
      throw new Error('BehaviorHandler.id is required');
    }
    this.unregister(handler.id);
    this.handlers.push(handler);
    this.order.set(handler.id, this.seq++);
    return this;
  }

  unregister(id: string): this {
    const idx = this.handlers.findIndex((h) => h.id === id);
    if (idx >= 0) {
      this.handlers.splice(idx, 1);
      this.order.delete(id);
    }
    return this;
  }

  has(id: string): boolean {
    return this.order.has(id);
  }

  /**
   * All handlers applicable to `entity` for `intent`, ordered by priority
   * (desc) then registration order (asc) - i.e. override precedence.
   */
  resolve(entity: GameObjectEntity, intent: BehaviorIntent): BehaviorHandler[] {
    return this.handlers
      .filter((h) => handlerMatches(h, entity, intent))
      .sort((a, b) => {
        const pa = a.priority ?? 0;
        const pb = b.priority ?? 0;
        if (pa !== pb) return pb - pa;
        return (this.order.get(a.id) ?? 0) - (this.order.get(b.id) ?? 0);
      });
  }

  /**
   * Run matching handlers in precedence order until one reports
   * `{ handled: true }`. A handler returning `{ handled: false }` defers to
   * the next (lower-precedence) handler.
   */
  async dispatch(ctx: BehaviorContext): Promise<BehaviorOutcome> {
    for (const handler of this.resolve(ctx.entity, ctx.intent)) {
      const outcome = await handler.handle(ctx);
      if (outcome.handled) return outcome;
    }
    return NOT_HANDLED;
  }
}
