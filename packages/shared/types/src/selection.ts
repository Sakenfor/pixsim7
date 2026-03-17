/**
 * Base Selection Interface for Game Engine
 *
 * Provides a shared selection contract that sits underneath interactions/gizmos.
 * Any GameObject can opt into selection via the Selectable interface.
 *
 * Flow: click → select → (optionally) interact
 *
 * Design:
 * - Types only — no runtime logic, no store, no rendering
 * - Composition-based: Selectable is an optional component on GameObjectBase
 * - Uses EntityRef and SpatialObjectKind from existing type system
 * - SelectionAction is a discriminated union matching GameInputIntent pattern
 */

import type { EntityRef } from './ids';
import type { SpatialObjectKind } from './game';

// =============================================================================
// Selectable Protocol
// =============================================================================

/**
 * Visual feedback hints for selection rendering.
 * Data only — renderers interpret these however they want.
 */
export interface SelectionVisualHints {
  /** Outline/highlight color (hex) */
  outlineColor?: string;
  /** Effect type when selected */
  highlightEffect?: 'outline' | 'glow' | 'pulse';
  /** Scale multiplier when selected (e.g. 1.05 for subtle pop) */
  selectedScale?: number;
}

/**
 * Opt-in selection protocol for game objects.
 *
 * Add to any GameObjectBase via `selection?: Selectable`.
 * Objects without this field (or with `selectable: false`) are not selectable.
 *
 * @example
 * const npc: NpcObject = {
 *   kind: 'npc',
 *   id: NpcId(1),
 *   name: 'Alex',
 *   transform: { worldId: WorldId(1), position: { x: 0, y: 0 } },
 *   selection: {
 *     selectable: true,
 *     selectionPriority: 10,
 *     selectionVisual: { highlightEffect: 'outline', outlineColor: '#ffcc00' },
 *   },
 * };
 */
export interface Selectable {
  /** Whether this entity can currently be selected (default: true if present) */
  selectable?: boolean;
  /** Selection priority — higher wins when overlapping (default: 0) */
  selectionPriority?: number;
  /** Group ID for multi-select constraints (e.g. "npcs", "items") */
  selectionGroup?: string;
  /** Visual feedback hints for renderers */
  selectionVisual?: SelectionVisualHints;
}

// =============================================================================
// Selection Entry (a reference to a selected entity)
// =============================================================================

/**
 * Lightweight reference to a selected entity.
 * Contains just enough info to identify and filter without holding the full object.
 */
export interface SelectionEntry {
  /** Canonical entity reference (e.g. "npc:123") */
  ref: EntityRef;
  /** Object kind for filtering */
  kind: SpatialObjectKind;
  /** Numeric entity ID */
  id: number;
  /** When this entity was selected (monotonic timestamp, ms) */
  selectedAt: number;
}

// =============================================================================
// Selection State
// =============================================================================

/**
 * Runtime selection state — what is currently selected/hovered.
 *
 * This is the shape that a selection store or manager would hold.
 * Kept as a plain interface so it can be used with Zustand, Redux, or plain state.
 */
export interface SelectionState {
  /** Primary (most recently) selected entity, or null */
  primary: SelectionEntry | null;
  /** All selected entities (multi-select). Includes primary. */
  entries: SelectionEntry[];
  /** Currently hovered entity (pointer over, not yet selected) */
  hovered: SelectionEntry | null;
}

// =============================================================================
// Selection Constraints
// =============================================================================

/**
 * Rules that govern what can be selected.
 * Applied by the selection manager/store before accepting a selection.
 */
export interface SelectionConstraints {
  /** Only allow these kinds to be selected */
  allowedKinds?: SpatialObjectKind[];
  /** Block these kinds from selection */
  blockedKinds?: SpatialObjectKind[];
  /** Max simultaneous selections (1 = single-select mode) */
  maxSelections?: number;
  /** Max distance from player/camera for selection (world units) */
  maxDistance?: number;
  /** Custom filter predicate ID (resolved by runtime/plugin) */
  customFilterId?: string;
}

// =============================================================================
// Selection Actions (input intents)
// =============================================================================

/**
 * Discriminated union of selection intents.
 * Follows the same pattern as GameInputIntent.
 *
 * UI layers emit these; the selection manager/store reduces them into state.
 */
export type SelectionAction =
  | { type: 'select'; entry: SelectionEntry }
  | { type: 'deselect'; ref: EntityRef }
  | { type: 'toggle'; entry: SelectionEntry }
  | { type: 'set_hover'; entry: SelectionEntry | null }
  | { type: 'clear_all' }
  | { type: 'select_multiple'; entries: SelectionEntry[] };

// =============================================================================
// Selection Events (emitted by the system)
// =============================================================================

/**
 * Events emitted when selection state changes.
 * Consumers (UI, interaction system, camera) subscribe to these.
 */
export type SelectionEvent =
  | { type: 'selected'; entry: SelectionEntry; previous: SelectionEntry | null }
  | { type: 'deselected'; entry: SelectionEntry }
  | { type: 'hover_changed'; entry: SelectionEntry | null; previous: SelectionEntry | null }
  | { type: 'cleared' };
