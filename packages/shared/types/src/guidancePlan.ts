/**
 * Guidance Plan v1 Types
 *
 * Structured non-text guidance inputs (character references, spatial regions,
 * masks, constraints) that flow alongside template-driven generation.
 *
 * Phase A delivers `references`. Regions, masks, and constraints are typed
 * upfront so future phases require no schema changes.
 */

// ---------------------------------------------------------------------------
// Enums & Literal Types
// ---------------------------------------------------------------------------

export type GuidanceReferenceKind =
  | 'identity'
  | 'style'
  | 'pose'
  | 'garment'
  | (string & {});

export type GuidanceCoordSpace =
  | 'normalized'
  | 'pixel'
  | (string & {});

export type GuidanceMaskFormat =
  | 'url'
  | 'base64'
  | 'asset_ref'
  | (string & {});

// ---------------------------------------------------------------------------
// Reference (Phase A — active)
// ---------------------------------------------------------------------------

export interface GuidanceReference {
  /** Asset ID (e.g. "asset:5" or numeric) */
  asset_id: string | number;
  /** Kind of reference */
  kind: GuidanceReferenceKind;
  /** Lower number = earlier provider image index */
  priority?: number;
  /** Camera view hint (e.g. "front", "profile") */
  view?: string;
  /** Pose hint (e.g. "standing", "sitting") */
  pose?: string;
  /** Human-readable label for legend text */
  label?: string;
}

// ---------------------------------------------------------------------------
// Region (Phase B — typed now, consumed later)
// ---------------------------------------------------------------------------

export interface GuidanceRegion {
  /** Normalized [x1, y1, x2, y2] bounding box, each in [0, 1] */
  box: [number, number, number, number];
  /** Binding key this region applies to */
  binding_key: string;
  /** Attention/influence strength, 0..1 */
  strength?: number;
  /** Optional label */
  label?: string;
}

// ---------------------------------------------------------------------------
// Mask (Phase C — typed now, consumed later)
// ---------------------------------------------------------------------------

export interface GuidanceMask {
  /** Format of the mask data */
  format: GuidanceMaskFormat;
  /** Mask data (URL, base64, or asset ref depending on format) */
  data: string;
  /** Channel to use if multi-channel mask */
  channel?: string;
  /** Whether to invert the mask */
  invert?: boolean;
}

// ---------------------------------------------------------------------------
// Constraints (Phase D — typed now, consumed later)
// ---------------------------------------------------------------------------

export interface GuidanceConstraints {
  /** Lock camera — prevent camera movement */
  lock_camera?: boolean;
  /** Lock pose — preserve character pose from reference */
  lock_pose?: boolean;
  /** Lock expression — preserve facial expression */
  lock_expression?: boolean;
  /** Lock garment — preserve clothing/outfit */
  lock_garment?: boolean;
  /** Style transfer strength, 0..1 */
  style_strength?: number;
  /** Identity preservation strength, 0..1 */
  identity_strength?: number;
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export interface GuidanceProvenance {
  /** Source that produced this plan (e.g. "template_builder", "narrative_runtime") */
  source?: string;
  /** Template ID if derived from a block template */
  template_id?: string;
  /** Timestamp of plan creation */
  created_at?: string;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Top-Level Plan
// ---------------------------------------------------------------------------

export interface GuidancePlanV1 {
  /** Schema version — always 1 */
  version: 1;
  /** Character/style references keyed by binding key */
  references?: Record<string, GuidanceReference>;
  /** Spatial attention regions keyed by binding key */
  regions?: Record<string, GuidanceRegion[]>;
  /** Named masks */
  masks?: Record<string, GuidanceMask>;
  /** Generation constraints */
  constraints?: GuidanceConstraints;
  /** Plan provenance/audit trail */
  provenance?: GuidanceProvenance;
}

// ---------------------------------------------------------------------------
// Validation Result
// ---------------------------------------------------------------------------

export interface GuidancePlanValidationResult {
  errors: string[];
  warnings: string[];
  is_valid: boolean;
}
