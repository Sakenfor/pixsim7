/**
 * Gating Plugin System - Types and Interfaces
 *
 * Defines the plugin architecture for content gating systems.
 * Allows worlds to use different gating strategies (intimacy, trust, reputation, etc.)
 * while keeping the core system flexible and extensible.
 *
 * @see claude-tasks/109-intimacy-and-content-gating-stat-integration.md
 */

/**
 * Relationship state for gating checks
 *
 * This is a stat-backed view for one NPC's relationship state.
 * The plugin receives this normalized view regardless of how stats are stored.
 */
export interface RelationshipState {
  /** Which stat definition this state is from (e.g., "relationships", "trust_system") */
  statDefinitionId: string;

  /** Stat axes with their current values */
  axes: {
    affinity?: number;
    trust?: number;
    chemistry?: number;
    tension?: number;
    [axis: string]: number | undefined;
  };

  /** Tier ID from stat normalization (e.g., "close_friend") */
  tierId?: string;

  /** Level ID from stat normalization (e.g., "intimate", "very_intimate") */
  levelId?: string;

  /** Additional metadata the plugin might need */
  meta?: Record<string, unknown>;
}

/**
 * Result of a gating check
 *
 * Indicates whether content is allowed and provides helpful feedback
 */
export interface GatingResult {
  /** Whether the content/interaction is allowed */
  allowed: boolean;

  /** Human-readable reason for denial (if not allowed) */
  reason?: string;

  /** Suggested minimum values to unlock this gate */
  suggestedMinimums?: Partial<Record<string, number>>;
}

/**
 * Requirements for a specific gate type
 *
 * Used for showing users what they need to unlock content
 */
export interface GateRequirements {
  /** Required level IDs (e.g., ["deep_flirt", "intimate"]) */
  requiredLevelIds?: string[];

  /** Axis thresholds (e.g., { affinity: 60, chemistry: 50 }) */
  axisThresholds?: Partial<Record<string, number>>;

  /** Human-readable description of requirements */
  description?: string;
}

/**
 * Gating Plugin Interface
 *
 * Plugins implement this interface to provide custom gating logic.
 * Examples:
 * - intimacy.default: Romance/intimacy gating based on affinity/chemistry
 * - trust.corporate: Business/professional trust-based gating
 * - reputation.social: Social standing and reputation gating
 */
export interface GatingPlugin {
  /** Unique plugin ID (e.g., "intimacy.default", "trust.corporate") */
  id: string;

  /** Display name for UI/debugging */
  name: string;

  /** Plugin version for compatibility tracking */
  version: string;

  /** Which stat definitions this plugin expects to work with */
  requiredStatDefinitions: string[];

  /** Known gate types this plugin supports (optional, for inspection/UIs) */
  supportedGateTypes?: string[];

  /**
   * Check if content with a given gateType is allowed for the current state
   *
   * @param state - Current relationship state from stat system
   * @param gateType - Type of gate to check (e.g., "romantic", "mature", "restricted")
   * @param config - Plugin-specific configuration (optional)
   * @returns Result with allowed status and helpful feedback
   */
  checkContentGate(
    state: RelationshipState,
    gateType: string,
    config?: any
  ): GatingResult;

  /**
   * Get requirements for a given gateType
   *
   * Used for showing users what they need to unlock content in editors/UIs
   *
   * @param gateType - Type of gate to get requirements for
   * @param config - Plugin-specific configuration (optional)
   * @returns Requirements needed to pass this gate
   */
  getGateRequirements(
    gateType: string,
    config?: any
  ): GateRequirements;
}

/**
 * Plugin metadata for registration
 *
 * Extends Identifiable for BaseRegistry compatibility.
 * The id is derived from the wrapped plugin's id.
 */
export interface GatingPluginMeta {
  /** Unique ID (same as plugin.id, for BaseRegistry compatibility) */
  id: string;

  /** Plugin implementation */
  plugin: GatingPlugin;

  /** When this plugin was registered */
  registeredAt: Date;

  /** Optional category for organization */
  category?: string;

  /** Optional tags for discovery */
  tags?: string[];
}
