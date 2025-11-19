/**
 * Character Identity Graph - Conceptual Model
 *
 * Unified graph representation connecting:
 * - Characters (templates and instances)
 * - NPCs (game entities)
 * - Scenes (game scenes and content scenes)
 * - Assets (media content)
 * - Generations (content creation jobs)
 * - Prompts and Action Blocks
 *
 * This provides a queryable abstraction over existing tables without requiring schema changes.
 */

// ============================================================================
// Node Types
// ============================================================================

export type CharacterGraphNodeType =
  | "character_template"
  | "character_instance"
  | "game_npc"
  | "scene"
  | "scene_role"
  | "asset"
  | "generation"
  | "prompt_version"
  | "action_block";

/**
 * Base node in the character identity graph
 */
export interface CharacterGraphNode {
  /** Node type discriminator */
  type: CharacterGraphNodeType;
  /** Unique identifier (combines type + id for global uniqueness) */
  id: string;
  /** Display label */
  label: string;
  /** Optional metadata */
  meta?: Record<string, any>;
}

/**
 * Character template node - reusable character definition
 */
export interface CharacterTemplateNode extends CharacterGraphNode {
  type: "character_template";
  /** UUID from characters.id */
  characterId: string;
  /** String ID like "gorilla_01" */
  characterStringId: string;
  name: string | null;
  displayName: string | null;
  category: string;
  species: string | null;
  archetype: string | null;
  tags: Record<string, any>;
  isActive: boolean;
  /** Number of world instances */
  instanceCount?: number;
  /** Number of linked NPCs (via instances) */
  npcCount?: number;
  /** Number of scenes where character appears */
  sceneCount?: number;
}

/**
 * Character instance node - world-specific version of character
 */
export interface CharacterInstanceNode extends CharacterGraphNode {
  type: "character_instance";
  /** UUID from character_instances.id */
  instanceId: string;
  /** Parent character template UUID */
  characterId: string;
  /** World this instance belongs to */
  worldId: number | null;
  characterVersion: number;
  instanceName: string | null;
  isActive: boolean;
  /** Visual/personality overrides from template */
  hasOverrides: boolean;
  /** Current state (health, mood, etc.) */
  currentState?: Record<string, any>;
}

/**
 * Game NPC node - interactive game entity
 */
export interface GameNPCNode extends CharacterGraphNode {
  type: "game_npc";
  /** Integer ID from game_npcs.id */
  npcId: number;
  name: string;
  homeLocationId: number | null;
  /** Number of linked character instances */
  characterInstanceCount?: number;
  /** Personality data */
  personality?: Record<string, any>;
}

/**
 * Scene node - game scene or content scene
 */
export interface SceneNode extends CharacterGraphNode {
  type: "scene";
  /** Scene ID (could be game_scenes.id or scenes.id) */
  sceneId: number;
  /** Scene type: "game_scene" or "content_scene" */
  sceneType: "game_scene" | "content_scene";
  title: string;
  description: string | null;
  /** Number of nodes/assets in scene */
  nodeCount?: number;
  /** Number of characters involved */
  characterCount?: number;
  /** Scene metadata */
  sceneMeta?: Record<string, any>;
}

/**
 * Scene role node - abstract role in a scene
 *
 * Represents roles like "protagonist", "love_interest", "antagonist"
 * that can be filled by different characters/NPCs in different contexts.
 */
export interface SceneRoleNode extends CharacterGraphNode {
  type: "scene_role";
  /** Role identifier: scene_id:role_name */
  roleId: string;
  /** Parent scene ID */
  sceneId: number;
  /** Role name (e.g., "protagonist", "love_interest") */
  roleName: string;
  /** Role importance: "primary", "secondary", "background" */
  importance?: string;
  /** Required capabilities for this role */
  requiredCapabilities?: string[];
}

/**
 * Asset node - media content (image, video, audio, 3D model)
 */
export interface AssetNode extends CharacterGraphNode {
  type: "asset";
  /** Integer ID from assets.id */
  assetId: number;
  mediaType: "video" | "image" | "audio" | "model";
  description: string | null;
  tags: string[];
  styleTags: string[];
  contentDomain: string;
  contentCategory: string | null;
  /** Source generation that created this asset */
  sourceGenerationId: number | null;
  /** Characters associated with this asset (derived) */
  characterIds?: string[];
  /** Scenes this asset appears in */
  sceneIds?: number[];
}

/**
 * Generation node - content creation job
 */
export interface GenerationNode extends CharacterGraphNode {
  type: "generation";
  /** Integer ID from generations.id */
  generationId: number;
  operationType: string;
  providerId: string;
  status: string;
  /** Prompt version used */
  promptVersionId: string | null;
  /** Final prompt text */
  finalPrompt: string | null;
  /** Result asset ID */
  assetId: number | null;
  /** Characters involved (from prompt variables/params) */
  characterIds?: string[];
  /** Scene this generation is for */
  sceneId?: number | null;
  createdAt: string;
}

/**
 * Prompt version node
 */
export interface PromptVersionNode extends CharacterGraphNode {
  type: "prompt_version";
  /** UUID from prompt_versions.id */
  versionId: string;
  name: string | null;
  /** Prompt template text */
  template: string;
  /** Variable names extracted from template */
  variables?: string[];
  /** Characters referenced in template */
  characterRefs?: string[];
}

/**
 * Action block node
 */
export interface ActionBlockNode extends CharacterGraphNode {
  type: "action_block";
  /** UUID from action_blocks.id */
  blockId: string;
  name: string | null;
  blockType: string;
  /** Characters involved in this action */
  characterIds?: string[];
}

/**
 * Union type of all node types
 */
export type CharacterGraphNodeUnion =
  | CharacterTemplateNode
  | CharacterInstanceNode
  | GameNPCNode
  | SceneNode
  | SceneRoleNode
  | AssetNode
  | GenerationNode
  | PromptVersionNode
  | ActionBlockNode;

// ============================================================================
// Edge Types
// ============================================================================

export type CharacterGraphEdgeType =
  | "instantiates" // template -> instance
  | "syncs_with" // instance -> npc (bidirectional sync)
  | "fills_role" // instance/template -> scene_role
  | "appears_in" // character -> scene
  | "contains_asset" // scene -> asset
  | "generated_by" // asset -> generation
  | "created_for" // generation -> scene
  | "uses_character" // prompt/action -> character
  | "references" // character -> character (relationship)
  | "has_capability" // character -> action_block
  | "uses_prompt" // generation -> prompt_version
  | "requires_character" // scene -> character (via manifest)
  | "expresses_as"; // npc -> asset (expression/portrait)

/**
 * Edge in the character identity graph
 */
export interface CharacterGraphEdge {
  /** Edge type */
  type: CharacterGraphEdgeType;
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Edge label (optional, for display) */
  label?: string;
  /** Edge metadata */
  meta?: Record<string, any>;
  /** Edge strength/weight (0-1, optional) */
  strength?: number;
  /** Is this edge bidirectional? */
  bidirectional?: boolean;
}

// ============================================================================
// Graph Structure
// ============================================================================

/**
 * Complete character identity graph
 */
export interface CharacterIdentityGraph {
  /** All nodes in the graph */
  nodes: CharacterGraphNodeUnion[];
  /** All edges in the graph */
  edges: CharacterGraphEdge[];
  /** Graph metadata */
  meta?: {
    /** When this graph was built */
    builtAt: string;
    /** Root node (if querying from a specific character) */
    rootNodeId?: string;
    /** Filters applied to build this graph */
    filters?: {
      worldId?: number;
      contentRating?: string;
      tags?: string[];
    };
    /** Graph statistics */
    stats?: {
      totalNodes: number;
      totalEdges: number;
      nodeCountsByType: Record<CharacterGraphNodeType, number>;
      edgeCountsByType: Record<CharacterGraphEdgeType, number>;
    };
  };
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Query options for building a character graph
 */
export interface CharacterGraphQueryOptions {
  /** Root character ID to start from */
  rootCharacterId?: string;
  /** Root character instance ID to start from */
  rootInstanceId?: string;
  /** Root scene ID to start from */
  rootSceneId?: number;
  /** Root NPC ID to start from */
  rootNpcId?: number;

  /** Include these node types in the graph */
  includeNodeTypes?: CharacterGraphNodeType[];
  /** Exclude these node types from the graph */
  excludeNodeTypes?: CharacterGraphNodeType[];

  /** Maximum depth to traverse from root */
  maxDepth?: number;

  /** Filter by world ID */
  worldId?: number;
  /** Filter by content rating */
  contentRating?: string;
  /** Filter by tags */
  tags?: string[];

  /** Include inactive nodes? */
  includeInactive?: boolean;
}

/**
 * Result of a character graph query
 */
export interface CharacterGraphQueryResult {
  /** The resulting graph */
  graph: CharacterIdentityGraph;
  /** Query that produced this result */
  query: CharacterGraphQueryOptions;
  /** Query execution metadata */
  executionMeta: {
    /** Query duration in milliseconds */
    durationMs: number;
    /** Number of database queries executed */
    queryCount?: number;
    /** Any warnings or notes */
    warnings?: string[];
  };
}

// ============================================================================
// Path Finding
// ============================================================================

/**
 * Path between two nodes in the graph
 */
export interface CharacterGraphPath {
  /** Start node */
  from: string;
  /** End node */
  to: string;
  /** Nodes along the path (includes from and to) */
  nodes: CharacterGraphNodeUnion[];
  /** Edges along the path */
  edges: CharacterGraphEdge[];
  /** Path length (number of edges) */
  length: number;
  /** Path description (e.g., "Character -> Instance -> NPC -> Scene") */
  description?: string;
}

/**
 * Find all paths between two nodes
 */
export interface CharacterGraphPathQuery {
  /** Start node ID */
  from: string;
  /** End node ID */
  to: string;
  /** Maximum path length to search */
  maxLength?: number;
  /** Edge types to traverse (if omitted, all edge types allowed) */
  allowedEdgeTypes?: CharacterGraphEdgeType[];
}

// ============================================================================
// Usage Analytics
// ============================================================================

/**
 * Usage statistics for a character
 */
export interface CharacterUsageStats {
  /** Character ID */
  characterId: string;
  /** Character name */
  characterName: string;

  /** Number of world instances */
  instanceCount: number;
  /** Number of linked NPCs */
  npcCount: number;
  /** Number of scenes where character appears */
  sceneCount: number;
  /** Number of assets featuring this character */
  assetCount: number;
  /** Number of generations involving this character */
  generationCount: number;
  /** Number of prompt versions using this character */
  promptVersionCount: number;
  /** Number of action blocks using this character */
  actionBlockCount: number;

  /** Worlds where character appears */
  worldIds: number[];
  /** Scenes where character appears */
  sceneIds: number[];
  /** Related characters (via relationships) */
  relatedCharacterIds: string[];

  /** Last time character was used */
  lastUsedAt?: string;
}

/**
 * Scene statistics
 */
export interface SceneUsageStats {
  /** Scene ID */
  sceneId: number;
  /** Scene title */
  sceneTitle: string;

  /** Characters involved */
  characterCount: number;
  /** NPCs involved */
  npcCount: number;
  /** Assets in scene */
  assetCount: number;
  /** Generations for this scene */
  generationCount: number;

  /** Character IDs involved */
  characterIds: string[];
  /** NPC IDs involved */
  npcIds: number[];

  /** Scene roles defined */
  roles?: string[];
  /** Role bindings (role -> character/npc) */
  roleBindings?: Record<string, string>;
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Node ID builder helpers
 */
export const CharacterGraphNodeId = {
  characterTemplate: (id: string) => `character:${id}`,
  characterInstance: (id: string) => `instance:${id}`,
  gameNpc: (id: number) => `npc:${id}`,
  scene: (id: number, type: "game" | "content" = "game") => `scene:${type}:${id}`,
  sceneRole: (sceneId: number, roleName: string) => `role:${sceneId}:${roleName}`,
  asset: (id: number) => `asset:${id}`,
  generation: (id: number) => `generation:${id}`,
  promptVersion: (id: string) => `prompt:${id}`,
  actionBlock: (id: string) => `action:${id}`,
};

/**
 * Parse a node ID back into its components
 */
export interface ParsedNodeId {
  type: CharacterGraphNodeType;
  id: string | number;
  subType?: string; // For scene type (game/content)
}

/**
 * Parse a character graph node ID
 */
export function parseCharacterGraphNodeId(nodeId: string): ParsedNodeId | null {
  const parts = nodeId.split(":");
  if (parts.length < 2) return null;

  const [typeStr, ...idParts] = parts;

  switch (typeStr) {
    case "character":
      return { type: "character_template", id: idParts.join(":") };
    case "instance":
      return { type: "character_instance", id: idParts.join(":") };
    case "npc":
      return { type: "game_npc", id: parseInt(idParts[0], 10) };
    case "scene":
      return {
        type: "scene",
        subType: idParts[0],
        id: parseInt(idParts[1], 10),
      };
    case "role":
      return {
        type: "scene_role",
        id: `${idParts[0]}:${idParts.slice(1).join(":")}`,
      };
    case "asset":
      return { type: "asset", id: parseInt(idParts[0], 10) };
    case "generation":
      return { type: "generation", id: parseInt(idParts[0], 10) };
    case "prompt":
      return { type: "prompt_version", id: idParts.join(":") };
    case "action":
      return { type: "action_block", id: idParts.join(":") };
    default:
      return null;
  }
}
