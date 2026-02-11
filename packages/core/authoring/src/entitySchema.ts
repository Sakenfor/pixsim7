/**
 * Entity Schema - field-level completeness, defined where the field lives.
 *
 * Instead of registering check functions separately, you declare
 * checkable fields directly in the entity definition:
 *
 * ```typescript
 * import { entity, field } from '@pixsim7/core.authoring';
 *
 * export const npcSchema = entity<NpcAuthoringInput>('npc', {
 *   name:            field.string('Has a name', 'NPC needs a name'),
 *   portraitAssetId: field.ref('Has a portrait', 'Assign a portrait image'),
 *   expressions:     field.array('Has expressions', 'Add at least one expression'),
 *   schedule:        field.custom('Has a schedule', npc => ..., 'Define a schedule'),
 * });
 *
 * const checks = npcSchema.check(someNpc);
 *
 * // Features can extend in-place (mutable)
 * npcSchema.add('greetingDialogue', field.ref('Has greeting', 'Add a greeting'));
 *
 * // Or build an isolated schema (immutable-style)
 * const pluginSchema = npcSchema.extended({
 *   greetingDialogue: field.ref('Has greeting', 'Add a greeting'),
 * });
 * ```
 *
 * @module entitySchema
 */

import type { CompletenessCheck } from './types';

// ---------------------------------------------------------------------------
// Field definition
// ---------------------------------------------------------------------------

type FieldType = 'string' | 'ref' | 'array' | 'custom';
type Severity = 'required' | 'recommended';
export type FieldResult = boolean | 'skip';
export type FieldDetail<T = unknown> = string | ((entity: T) => string | undefined);

/**
 * A field definition produced by the `field` builders.
 *
 * Carries the check metadata for one entity field. Call `.warn()` to
 * downgrade from hard requirement to recommendation.
 */
export class FieldDef<T = unknown> {
  constructor(
    /** @internal */ readonly _fieldType: FieldType,
    /** @internal */ readonly _label: string,
    /** @internal */ readonly _detail: FieldDetail<T> | undefined,
    /** @internal */ readonly _test: ((entity: T) => FieldResult) | undefined,
    /** @internal */ readonly _severity: Severity = 'required',
    /** @internal */ readonly _id: string | undefined = undefined,
  ) {}

  /** Mark this check as a warning rather than a hard requirement. */
  warn(): FieldDef<T> {
    return new FieldDef(
      this._fieldType,
      this._label,
      this._detail,
      this._test,
      'recommended',
      this._id,
    );
  }

  /** Set a stable check id (otherwise defaults to `<entityType>.<fieldName>`). */
  id(checkId: string): FieldDef<T> {
    return new FieldDef(
      this._fieldType,
      this._label,
      this._detail,
      this._test,
      this._severity,
      checkId,
    );
  }
}

// ---------------------------------------------------------------------------
// Field builders
// ---------------------------------------------------------------------------

/**
 * Field builders for entity schemas.
 *
 * Each builder auto-generates a sensible test based on the field type:
 * - `field.string` -> non-empty after trim
 * - `field.ref`    -> not null/undefined
 * - `field.array`  -> length > 0
 * - `field.custom` -> your test function
 *
 * All default to `required` severity. Chain `.warn()` for recommendations.
 */
export const field = {
  /** String field - passes when non-empty after trim. */
  string<T = unknown>(label: string, detail?: FieldDetail<T>): FieldDef<T> {
    return new FieldDef<T>('string', label, detail, undefined, 'required');
  },

  /** Reference/FK field - passes when not null/undefined. */
  ref<T = unknown>(label: string, detail?: FieldDetail<T>): FieldDef<T> {
    return new FieldDef<T>('ref', label, detail, undefined, 'required');
  },

  /** Array field - passes when length > 0. */
  array<T = unknown>(label: string, detail?: FieldDetail<T>): FieldDef<T> {
    return new FieldDef<T>('array', label, detail, undefined, 'required');
  },

  /**
   * Custom check - you provide the test function over the whole entity.
   *
   * Return `'skip'` when the check is not applicable for that entity.
   */
  custom<T = unknown>(
    label: string,
    test: (entity: T) => FieldResult,
    detail?: FieldDetail<T>,
  ): FieldDef<T> {
    return new FieldDef<T>('custom', label, detail, test, 'required');
  },
} as const;

// ---------------------------------------------------------------------------
// Resolved field (internal - after binding to a key)
// ---------------------------------------------------------------------------

interface ResolvedField<T> {
  id: string;
  label: string;
  detail: FieldDetail<T> | undefined;
  severity: Severity;
  test: (entity: T) => FieldResult;
}

// ---------------------------------------------------------------------------
// Entity Schema
// ---------------------------------------------------------------------------

/**
 * An entity schema: the single source of truth for an entity type's
 * checkable fields.
 *
 * Created via the `entity()` factory.
 */
export class EntitySchema<T = unknown> {
  readonly entityType: string;
  /** @internal */
  private _fields: Map<string, ResolvedField<T>>;

  constructor(entityType: string, fields: Record<string, FieldDef<T>>) {
    this.entityType = entityType;
    this._fields = new Map();
    for (const [key, def] of Object.entries(fields)) {
      this._fields.set(key, this._resolve(key, def));
    }
  }

  // ---- Core API -----------------------------------------------------------

  /** Run all field checks against an entity instance. */
  check(entity: T): CompletenessCheck[] {
    const checks: CompletenessCheck[] = [];
    for (const f of this._fields.values()) {
      const outcome = f.test(entity);
      if (outcome === 'skip') continue;
      const passes = outcome;
      checks.push({
        id: f.id,
        label: f.label,
        status: passes ? 'complete' : f.severity === 'required' ? 'incomplete' : 'warning',
        detail: passes
          ? undefined
          : typeof f.detail === 'function'
            ? f.detail(entity)
            : f.detail,
      });
    }
    return checks;
  }

  // ---- Mutable extension API ---------------------------------------------

  /** Add a checkable field. Replaces if the key already exists. */
  add(fieldName: string, def: FieldDef<T>): this {
    this._fields.set(fieldName, this._resolve(fieldName, def));
    return this;
  }

  /** Remove a field check (e.g. a feature replaces a core check). */
  remove(fieldName: string): this {
    this._fields.delete(fieldName);
    return this;
  }

  /** Whether a field is defined. */
  has(fieldName: string): boolean {
    return this._fields.has(fieldName);
  }

  /** All defined field names. */
  get fieldNames(): string[] {
    return [...this._fields.keys()];
  }

  // ---- Immutable-style composition API -----------------------------------

  /** Clone this schema so extensions can avoid mutating shared singletons. */
  clone(): EntitySchema<T> {
    const clone = new EntitySchema<T>(this.entityType, {});
    clone._fields = new Map(this._fields);
    return clone;
  }

  /** Return a new schema with additional/replaced fields. */
  extended(fields: Record<string, FieldDef<T>>): EntitySchema<T> {
    const next = this.clone();
    for (const [key, def] of Object.entries(fields)) {
      next.add(key, def);
    }
    return next;
  }

  /** Return a new schema with one field removed. */
  without(fieldName: string): EntitySchema<T> {
    const next = this.clone();
    next.remove(fieldName);
    return next;
  }

  // ---- Internal -----------------------------------------------------------

  /** @internal */
  private _resolve(key: string, def: FieldDef<T>): ResolvedField<T> {
    const id = def._id ?? `${this.entityType}.${key}`;
    let test: (entity: T) => FieldResult;

    if (def._test) {
      test = def._test;
    } else {
      switch (def._fieldType) {
        case 'string':
          test = (e) => {
            const value = (e as Record<string, unknown>)[key];
            return typeof value === 'string' && value.trim().length > 0;
          };
          break;
        case 'ref':
          test = (e) => (e as Record<string, unknown>)[key] != null;
          break;
        case 'array':
          test = (e) => {
            const value = (e as Record<string, unknown>)[key];
            return Array.isArray(value) && value.length > 0;
          };
          break;
        default:
          test = () => true;
      }
    }

    return { id, label: def._label, detail: def._detail, severity: def._severity, test };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Define an entity schema.
 *
 * ```typescript
 * export const npcSchema = entity<NpcAuthoringInput>('npc', {
 *   name: field.string('Has a name', 'NPC needs a name'),
 * });
 * ```
 */
export function entity<T = unknown>(
  entityType: string,
  fields: Record<string, FieldDef<T>>,
): EntitySchema<T> {
  return new EntitySchema<T>(entityType, fields);
}

// ---------------------------------------------------------------------------
// Type helper
// ---------------------------------------------------------------------------

/**
 * Extract the entity type parameter from a schema.
 *
 * ```typescript
 * type NpcInput = Infer<typeof npcSchema>;
 * ```
 */
export type Infer<S> = S extends EntitySchema<infer T> ? T : never;
