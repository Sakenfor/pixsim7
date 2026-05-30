/**
 * GameObjectEntity - runtime object-core wrapper
 *
 * Object-core architecture (decision 2026-05-18, plan `gameobject-runtime-refactor-v1`):
 * a `GameObject` is a plain serializable POJO at every storage / DTO / API edge
 * (`session.flags.gameObjects`, link resolver, authoring API). `GameObjectEntity`
 * is the *runtime-only* core that carries behavior. It NEVER serializes or persists
 * - `toPOJO()` is the only bridge back to the edge shape.
 *
 * Phase 1: this class is purely additive (no runtime path constructs it yet) and
 * mirrors the existing `gameObjectStore` helpers exactly, so later adoption is
 * behavior-preserving.
 */

import type {
  EntityRef,
  GameObject,
  GameObjectBinding,
  GameObjectCapability,
  GameObjectCapabilityId,
  GameObjectComponent,
  GameObjectId,
  Transform,
} from '@pixsim7/shared.types';
import { buildEntityRefForKind } from './entityRefStrategy';
import type {
  BehaviorContext,
  BehaviorIntent,
  BehaviorOutcome,
  GameObjectBehaviorRegistry,
} from './gameObjectBehavior';
import type { GameObjectQuery } from './gameObjectStore';

function deepClone<T>(value: T): T {
  // GameObject is a pure-data POJO contract, so structuredClone is faithful.
  return structuredClone(value);
}

/**
 * Runtime wrapper around a single `GameObject` POJO.
 *
 * Holds an isolated snapshot of the object's data - mutating the source POJO
 * after construction does not affect the entity, and the entity never mutates
 * the source. This keeps the POJO edge and the runtime core decoupled.
 */
export class GameObjectEntity {
  private readonly obj: GameObject;

  private constructor(obj: GameObject) {
    this.obj = obj;
  }

  /** Wrap a POJO as a runtime entity (takes an isolated snapshot). */
  static fromPOJO(obj: GameObject): GameObjectEntity {
    return new GameObjectEntity(deepClone(obj));
  }

  /** Wrap many POJOs. */
  static fromPOJOs(objects: readonly GameObject[]): GameObjectEntity[] {
    return objects.map((obj) => GameObjectEntity.fromPOJO(obj));
  }

  // --- Edge bridge -------------------------------------------------------

  /**
   * Project back to the plain POJO edge shape. Returns an isolated clone so
   * callers cannot reach into entity-internal state.
   */
  toPOJO(): GameObject {
    return deepClone(this.obj);
  }

  /**
   * Build this object's canonical `EntityRef` via the shared per-kind ref
   * strategy, using `runtimeKind` + `id`.
   *
   * Note: this applies the same trim / id-normalization as
   * `GameRuntime.buildEntityRef` but NOT runtime-kind *alias* mapping (that
   * depends on the runtime config map and stays a `GameRuntime` concern). Use
   * `GameRuntime.buildEntityRef` when alias resolution is required.
   */
  toEntityRef(): EntityRef | undefined {
    const kind = this.runtimeKind.trim();
    if (!kind) return undefined;
    const rawId = this.obj.id;
    const normalizedId =
      typeof rawId === 'number'
        ? Number.isFinite(rawId)
          ? String(rawId)
          : ''
        : rawId.trim();
    if (!normalizedId) return undefined;
    const numeric = Number(normalizedId);
    return buildEntityRefForKind(
      kind,
      normalizedId,
      numeric,
      Number.isFinite(numeric)
    );
  }

  // --- Identity / field accessors ---------------------------------------

  get kind(): string {
    return this.obj.kind;
  }

  get id(): GameObjectId {
    return this.obj.id;
  }

  get ref(): string {
    return typeof this.obj.ref === 'string' ? this.obj.ref : `${this.obj.kind}:${this.obj.id}`;
  }

  get name(): string {
    return this.obj.name;
  }

  /** Runtime kind for link/template resolution. Defaults to `kind` when unset (store parity). */
  get runtimeKind(): string {
    const explicit =
      typeof this.obj.runtimeKind === 'string' ? this.obj.runtimeKind.trim() : '';
    return explicit.length > 0 ? explicit : this.obj.kind;
  }

  get transform(): Transform {
    return this.obj.transform;
  }

  get tags(): readonly string[] {
    return this.obj.tags ?? [];
  }

  get capabilities(): readonly GameObjectCapability[] {
    return this.obj.capabilities ?? [];
  }

  get components(): readonly GameObjectComponent[] {
    return this.obj.components ?? [];
  }

  get binding(): GameObjectBinding | undefined {
    return this.obj.binding;
  }

  get kindData(): Record<string, unknown> | undefined {
    return this.obj.kindData;
  }

  get meta(): Record<string, unknown> | undefined {
    return this.obj.meta;
  }

  isKind(kind: string): boolean {
    return this.obj.kind === kind;
  }

  // --- Capabilities ------------------------------------------------------

  getCapability(
    id: GameObjectCapabilityId | string
  ): GameObjectCapability | undefined {
    const required = typeof id === 'string' ? id.trim() : '';
    if (!required) return undefined;
    return (this.obj.capabilities ?? []).find((cap) => cap.id === required);
  }

  /**
   * Strict capability check: requires a non-empty id that is present and not
   * explicitly disabled (`enabled !== false`).
   */
  hasCapability(id: GameObjectCapabilityId | string): boolean {
    const cap = this.getCapability(id);
    return cap !== undefined && cap.enabled !== false;
  }

  // --- Components --------------------------------------------------------

  getComponent(type: string): GameObjectComponent | undefined {
    const required = typeof type === 'string' ? type.trim() : '';
    if (!required) return undefined;
    return (this.obj.components ?? []).find((comp) => comp.type === required);
  }

  hasComponent(type: string): boolean {
    const comp = this.getComponent(type);
    return comp !== undefined && comp.enabled !== false;
  }

  /**
   * Read a component's `data` payload by type. Returns undefined when the
   * component is absent or explicitly disabled (`enabled === false`).
   */
  getComponentData(type: string): Record<string, unknown> | undefined {
    const comp = this.getComponent(type);
    if (!comp || comp.enabled === false) return undefined;
    return comp.data;
  }

  // --- Tags --------------------------------------------------------------

  hasTag(tag: string): boolean {
    const needle = tag.toLowerCase();
    return (this.obj.tags ?? []).some((t) => t.toLowerCase() === needle);
  }

  hasAllTags(tags: readonly string[]): boolean {
    if (tags.length === 0) return true;
    const owned = new Set((this.obj.tags ?? []).map((t) => t.toLowerCase()));
    return tags.every((t) => owned.has(t.toLowerCase()));
  }

  // --- Query parity ------------------------------------------------------

  /**
   * Exact parity with `gameObjectStore`'s internal `matchesQuery`, so adopting
   * the entity in list/get paths is behavior-preserving. Note the loose
   * capability semantics: an empty/whitespace `query.capability` matches all
   * (it means "no capability filter").
   */
  matches(query: GameObjectQuery): boolean {
    if (query.kind && this.obj.kind !== query.kind) {
      return false;
    }
    if (query.locationId != null) {
      const locationId = this.obj.transform?.locationId;
      if (locationId !== query.locationId) {
        return false;
      }
    }
    if (query.capability) {
      const required = query.capability.trim();
      if (required) {
        const ok = (this.obj.capabilities ?? []).some(
          (cap) => cap.id === required && cap.enabled !== false
        );
        if (!ok) return false;
      }
    }
    if (query.tags && !this.hasAllTags(query.tags)) {
      return false;
    }
    return true;
  }

  // --- Behavior dispatch seam -------------------------------------------

  /**
   * Dispatch an intent through a behavior registry. Behavior is resolved by
   * this object's capabilities/components (never by `kind`), so any genre of
   * object participates uniformly. Returns `{ handled: false }` when no
   * registered behavior applies.
   */
  dispatch(
    registry: GameObjectBehaviorRegistry,
    intent: BehaviorIntent,
    host?: unknown
  ): Promise<BehaviorOutcome> {
    const ctx: BehaviorContext = { entity: this, intent, host };
    return registry.dispatch(ctx);
  }
}
