/**
 * Builder form state types.
 *
 * These types mirror the subset of #PromptBlockPackV1 that the
 * Builder tab exposes as editable form fields. Anything outside
 * this subset is carried opaquely (in `extras` slots) so that
 * regenerating CUE from form state round-trips advanced data
 * (op, descriptors, tags, etc.) without the form having to
 * model it.
 *
 * Source of truth: tools/cue/prompt_packs/schema_v1.cue
 */

/** Raw key/value bag of unknown shape, preserved verbatim through codegen. */
export type CueLiteralBag = Record<string, unknown>;

export interface VariantForm {
  /** Stable id within parent block. Matches #SimpleId. */
  key: string;
  /** Optional variant text (text-mode blocks). */
  text?: string;
  /**
   * Fields not exposed in the form UI yet — preserved opaquely.
   * Includes: block_id, tags, op_id, op_modalities, op_args,
   * ref_bindings, descriptors, and any unknown keys from the
   * compiled JSON.
   */
  extras: CueLiteralBag;
}

export type BlockMode = 'surface' | 'hybrid' | 'op';

export interface BlockForm {
  /** Local block id within the pack. #PackBlockId / #SimpleId. */
  id: string;
  /** Optional group id. */
  group?: string;
  /** Required dotted id prefix. */
  idPrefix: string;
  /** Default "surface" if unset. */
  mode?: BlockMode;
  role?: string;
  category?: string;
  /** Block-level text template (may contain {variant}). */
  textTemplate?: string;
  variants: VariantForm[];
  /**
   * Block-level advanced fields preserved opaquely:
   * capabilities, descriptors, tags, op, defaults, etc.
   * Anything in #BlockSchema or #PackBlock the form doesn't model.
   */
  extras: CueLiteralBag;
}

export interface PackForm {
  /** From `package_name`. Sluggish identifier. */
  packageName: string;
  /** From `version`. */
  version: string;
  /**
   * Top-level pack fields not modeled in the form:
   * defaults, groups, and any unknown keys.
   */
  extras: CueLiteralBag;
  blocks: BlockForm[];
  /**
   * Verbatim text of the `manifest:` section in the original
   * source — preserved as-is on regeneration so that matrix
   * presets, manifest metadata, and any non-pack expressions
   * aren't silently rewritten by the Builder.
   *
   * When the source has no manifest section (or extraction
   * failed), this is null and the regenerated CUE omits the
   * manifest stanza.
   */
  manifestSource: string | null;
  /**
   * Anything between the package declaration and the `pack:`
   * expression (typically nothing, but preserved for safety).
   */
  preamble?: string;
}

/**
 * Reason the Builder may not be safely usable for a given source.
 * Surfaced to the user as a warning banner before regeneration.
 */
export interface BuilderCaveat {
  kind: 'cue-refs' | 'manifest-extract-failed' | 'compile-failed';
  message: string;
  /** Optional locations (1-based line numbers in the source). */
  lines?: number[];
}
