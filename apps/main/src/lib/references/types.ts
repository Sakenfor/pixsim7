/**
 * Reference system types — shared across panels that support @mentions.
 *
 * Types are open-ended (string) because features register dynamically.
 * Built-in types: 'plan', 'contract', 'world', 'project'.
 */

/** Open type key — any feature can register a new one. */
export type ReferenceType = string;

export interface ReferenceItem {
  type: ReferenceType;
  id: string;
  label: string;
  detail?: string;
  /** Optional CSS color class for the detail text (e.g. status color). */
  detailColor?: string;
  /** Nesting depth for hierarchical display (0 = top-level, 1 = child, etc.). */
  indent?: number;
  /**
   * Optional plain-text to insert when this item is picked. When present,
   * the picker inserts this literal string at the caret instead of the
   * default `@{type}:{id}` token. Used by vocabulary sources (anatomy,
   * phrases) where the text itself is the payload.
   */
  insertText?: string;
}

export interface ReferenceSource {
  type: ReferenceType;
  fetch: () => Promise<ReferenceItem[]>;
}
