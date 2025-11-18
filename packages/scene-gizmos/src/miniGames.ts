/**
 * Mini-Game System - Core Types and Registry
 * Pure TypeScript types for mini-game configuration and registration
 */

// ============================================================================
// Core Mini-Game Types
// ============================================================================

/**
 * Standardized mini-game result types
 *
 * All mini-games should return one of these result types to ensure
 * consistent handling in ScenePlayer and other consuming components.
 */
export type MiniGameResult =
  | { type: 'stat'; stat: string; value: number; operation?: 'add' | 'set' | 'multiply' }
  | { type: 'segment'; segmentId: string; intensity?: number; transition?: 'smooth' | 'cut' | 'fade' }
  | { type: 'flag'; key: string; value: any }
  | { type: 'flags'; flags: Record<string, any> }
  | { type: 'none' }
  | { type: 'error'; error: string; message?: string };

/**
 * Helper type for mini-games that return custom result types
 * (backwards compatibility - prefer using MiniGameResult)
 */
export type CustomMiniGameResult<T = any> = T;

/**
 * Base interface for all mini-game components
 */
export interface MiniGameComponentProps<TConfig = any, TResult = any> {
  /** Configuration for this mini-game instance */
  config: TConfig;

  /** Callback when mini-game completes */
  onResult: (result: TResult) => void;

  /** Optional video element for video-synced mini-games */
  videoElement?: HTMLVideoElement;

  /** Optional game state flags */
  gameState?: Record<string, any>;
}

/**
 * Mini-game definition - describes a registered mini-game type
 */
export interface MiniGameDefinition<TConfig = any, TResult = any> {
  /** Unique identifier for this mini-game type */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this mini-game does */
  description?: string;

  /** Icon identifier (optional) */
  icon?: string;

  /** Default configuration when creating a new instance */
  defaultConfig: TConfig;

  /** Component to render - generic to avoid React dependency */
  component: ComponentType<MiniGameComponentProps<TConfig, TResult>>;

  /** Optional config validation function - returns error message if invalid, null if valid */
  validate?: (config: TConfig) => string | null;

  /** Metadata */
  category?: 'timing' | 'spatial' | 'memory' | 'puzzle' | 'other';
  tags?: string[];
  preview?: string; // Preview image/video URL
  author?: string;
}

// Generic component type to avoid direct React dependency
// Compatible with React.ComponentType and React.FC
export type ComponentType<P = any> =
  | ((props: P) => any)
  | { new (props: P): any };

// ============================================================================
// Registry Storage
// ============================================================================

const miniGames = new Map<string, MiniGameDefinition>();
const categories = new Map<string, Set<string>>();

// ============================================================================
// Registry Functions
// ============================================================================

/**
 * Register a mini-game definition
 */
export function registerMiniGame<TConfig = any, TResult = any>(
  def: MiniGameDefinition<TConfig, TResult>
): void {
  miniGames.set(def.id, def);

  if (def.category) {
    if (!categories.has(def.category)) {
      categories.set(def.category, new Set());
    }
    categories.get(def.category)!.add(def.id);
  }

  // Logging disabled by default (enable in dev tools if needed)
  // console.log(`[MiniGameRegistry] Registered mini-game: ${def.name} (${def.id})`);
}

/**
 * Get a mini-game definition by ID
 */
export function getMiniGame(id: string): MiniGameDefinition | undefined {
  return miniGames.get(id);
}

/**
 * Get all mini-games in a category
 */
export function getMiniGamesByCategory(category: string): MiniGameDefinition[] {
  const ids = categories.get(category) || new Set();
  return Array.from(ids)
    .map(id => miniGames.get(id))
    .filter((g): g is MiniGameDefinition => g !== undefined);
}

/**
 * Get all registered mini-games
 */
export function getAllMiniGames(): MiniGameDefinition[] {
  return Array.from(miniGames.values());
}

/**
 * Check if a mini-game is registered
 */
export function hasMiniGame(id: string): boolean {
  return miniGames.has(id);
}

/**
 * Clear all registered mini-games (useful for testing)
 */
export function clearMiniGameRegistry(): void {
  miniGames.clear();
  categories.clear();
}
