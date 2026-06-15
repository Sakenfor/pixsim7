/**
 * variableTransforms — frontend mirror of the backend transform registry
 * (services/prompt/variable_transforms.py). Applied by resolvePromptVariables to
 * a variable's resolved value for the "resolved preview"; the backend is
 * authoritative on the outbound generation path. A parity test keeps the two
 * registries in lockstep (same ids, same outputs) — keep them in sync.
 *
 * Spec format: `id` or `id:arg` — the first `:` separates the transform id from
 * a single free-text argument (e.g. the separator for `spaced`). Unknown ids are
 * a no-op at resolve time.
 */

export type TransformFn = (value: string, arg: string | null) => string;

const spaced: TransformFn = (value, arg) => {
  const separator = arg !== null && arg !== '' ? arg : ' ';
  // Iterate by code point (not UTF-16 code unit) so astral chars (emoji) aren't
  // torn between their surrogate halves — matches Python's `separator.join(value)`.
  return Array.from(value).join(separator);
};

const upper: TransformFn = (value) => value.toUpperCase();
const lower: TransformFn = (value) => value.toLowerCase();

/** id → fn. Seed set; extend here (and in the Python mirror) to add transforms. */
export const TRANSFORMS: Record<string, TransformFn> = {
  spaced,
  upper,
  lower,
};

/** Split a spec into `[id, arg]`; arg is null when absent. */
export function parseTransformSpec(spec: string): [string, string | null] {
  const idx = spec.indexOf(':');
  if (idx === -1) return [spec.trim().toLowerCase(), null];
  return [spec.slice(0, idx).trim().toLowerCase(), spec.slice(idx + 1)];
}

/** Whether a spec's id resolves to a registered transform. */
export function isKnownTransform(spec: string): boolean {
  const [id] = parseTransformSpec(spec);
  return Object.prototype.hasOwnProperty.call(TRANSFORMS, id);
}

/**
 * Apply the transform named by `spec` to `value`. No-op when `spec` is empty or
 * its id is not registered, matching the backend's graceful degradation.
 */
export function applyTransform(spec: string | null | undefined, value: string): string {
  if (!spec) return value;
  const [id, arg] = parseTransformSpec(spec);
  // Own-property lookup only — a raw `TRANSFORMS[id]` walks the prototype chain,
  // so an id like `__proto__`/`constructor` would resolve to an Object.prototype
  // member and throw or mis-run. Matches Python's `.get()` no-op and the
  // hasOwnProperty check already used by isKnownTransform.
  const fn = Object.prototype.hasOwnProperty.call(TRANSFORMS, id) ? TRANSFORMS[id] : undefined;
  return fn ? fn(value, arg) : value;
}

/** UI metadata for the transform picker — kept beside the registry so labels and
 *  the arg affordance can't drift from the functions they describe. */
export interface TransformOption {
  id: string;
  label: string;
  /** When true the transform takes a single arg (the part after `:` in the spec). */
  takesArg?: boolean;
  argLabel?: string;
  argPlaceholder?: string;
  /** Pre-filled arg when the option is first selected. */
  argDefault?: string;
}

export const TRANSFORM_OPTIONS: TransformOption[] = [
  {
    id: 'spaced',
    label: 'Spaced',
    takesArg: true,
    argLabel: 'Separator',
    argPlaceholder: '__',
    argDefault: '__',
  },
  { id: 'upper', label: 'UPPER' },
  { id: 'lower', label: 'lower' },
];

/** Build a spec string from a picker selection; null when no transform is chosen. */
export function buildTransformSpec(id: string, arg: string | null): string | null {
  if (!id) return null;
  const opt = TRANSFORM_OPTIONS.find((o) => o.id === id);
  if (opt?.takesArg && arg) return `${id}:${arg}`;
  return id;
}
