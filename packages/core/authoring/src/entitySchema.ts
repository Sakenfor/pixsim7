/**
 * Entity Schema — Field-level completeness, defined where the field lives.
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
 * // Run checks — no registry, no registration
 * const checks = npcSchema.check(someNpc);
 *
 * // Features extend in-place
 * npcSchema.add('greetingDialogue', field.ref('Has greeting', 'Add a greeting'));
 * ```
 *
 * Inspired by the Ref pattern: one definition carries both type semantics
 * and runtime behavior.
 *
 * @module entitySchema
 */

import type { CompletenessCheck } from './types';

// ---------------------------------------------------------------------------
// Field definition
// ---------------------------------------------------------------------------

type FieldType = 'string' | 'ref' | 'array' | 'custom';
type Severity = 'required' | 'recommended';

/**
 * A field definition produced by the `field` builders.
 *
 * Carries the check metadata for one entity field.  Call `.warn()` to
 * downgrade from hard requirement to recommendation.
 */
export class FieldDef {
  constructor(
    /** @internal */ readonly _fieldType: FieldType,
    /** @internal */ readonly _label: string,
    /** @internal */ readonly _detail: string | undefined,
    /** @internal */ readonly _test: ((entity: any) => boolean) | undefined,
    /** @internal */ readonly _severity: Severity = 'required',
  ) {}

  /** Mark this check as a warning rather than a hard requirement. */
  warn(): FieldDef {
    return new FieldDef(this._fieldType, this._label, this._detail, this._test, 'recommended');
  }
}

// ---------------------------------------------------------------------------
// Field builders
// ---------------------------------------------------------------------------

/**
 * Field builders for entity schemas.
 *
 * Each builder auto-generates a sensible test based on the field type:
 * - `field.string` → non-empty after trim
 * - `field.ref`    → not null/undefined
 * - `field.array`  → length > 0
 * - `field.custom`  → your test function
 *
 * All default to `required` severity. Chain `.warn()` for recommendations.
 */
export const field = {
  /** String field — passes when non-empty after trim. */
  string(label: string, detail?: string): FieldDef {
    return new FieldDef('string', label, detail, undefined, 'required');
  },

  /** Reference/FK field — passes when not null/undefined. */
  ref(label: string, detail?: string): FieldDef {
    return new FieldDef('ref', label, detail, undefined, 'required');
  },

  /** Array field — passes when length > 0. */
  array(label: string, detail?: string): FieldDef {
    return new FieldDef('array', label, detail, undefined, 'required');
  },

  /** Custom check — you provide the test function over the whole entity. */
  custom(label: string, test: (entity: any) => boolean, detail?: string): FieldDef {
    return new FieldDef('custom', label, detail, test, 'required');
  },
} as const;

// ---------------------------------------------------------------------------
// Resolved field (internal — after binding to a key)
// ---------------------------------------------------------------------------

interface ResolvedField {
  id: string;
  label: string;
  detail: string | undefined;
  severity: Severity;
  test: (entity: any) => boolean;
}

// ---------------------------------------------------------------------------
// Entity Schema
// ---------------------------------------------------------------------------

/**
 * An entity schema: the single source of truth for an entity type's
 * checkable fields.
 *
 * Created via the `entity()` factory. Features extend with `.add()`.
 * The manifest builder calls `.check()` directly — no registry needed.
 */
export class EntitySchema<T = unknown> {
  readonly entityType: string;
  /** @internal */
  private _fields: Map<string, ResolvedField>;

  constructor(entityType: string, fields: Record<string, FieldDef>) {
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
      const passes = f.test(entity);
      checks.push({
        id: f.id,
        label: f.label,
        status: passes ? 'complete' : f.severity === 'required' ? 'incomplete' : 'warning',
        detail: passes ? undefined : f.detail,
      });
    }
    return checks;
  }

  // ---- Extension API (for features) --------------------------------------

  /** Add a checkable field. Replaces if the key already exists. */
  add(fieldName: string, def: FieldDef): this {
    this._fields.set(fieldName, this._resolve(fieldName, def));
    return this;
  }

  /** Remove a field check (e.g. a feature replaces a core check). */
  remove(fieldName: string): this {
    this._fields.delete(fieldName);
    return this;
  }

  /** Whether a field is registered. */
  has(fieldName: string): boolean {
    return this._fields.has(fieldName);
  }

  /** All registered field names. */
  get fieldNames(): string[] {
    return [...this._fields.keys()];
  }

  // ---- Internal -----------------------------------------------------------

  /** @internal */
  private _resolve(key: string, def: FieldDef): ResolvedField {
    const id = `${this.entityType}.${key}`;
    let test: (entity: any) => boolean;

    if (def._test) {
      test = def._test;
    } else {
      switch (def._fieldType) {
        case 'string':
          test = (e) => ((e[key] as string) ?? '').trim().length > 0;
          break;
        case 'ref':
          test = (e) => e[key] != null;
          break;
        case 'array':
          test = (e) => (e[key]?.length ?? 0) > 0;
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
  fields: Record<string, FieldDef>,
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
