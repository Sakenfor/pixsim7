/**
 * Centralized Route Constants
 *
 * Single source of truth for app routes. Use these constants instead of
 * hardcoding paths throughout the app.
 */

/**
 * Core app routes
 */
export const ROUTES = {
  // Assets
  ASSETS: '/assets',
  ASSET_DETAIL: '/assets/:id',

  // Workspace
  WORKSPACE: '/workspace',

  // Generation
  GENERATE: '/generate',

  // Game
  GAME_WORLD: '/game-world',
  GAME_2D: '/game-2d',
  NPC_PORTRAITS: '/npc-portraits',
  NPC_BRAIN_LAB: '/npc-brain-lab',

  // Automation
  AUTOMATION: '/automation',

  // Plugins
  PLUGINS: '/plugins',

  // Graph
  ARC_GRAPH: '/arc-graph',
  GRAPH_DETAIL: '/graph/:id',

  // Interactions
  INTERACTION_STUDIO: '/interaction-studio',

  // Gizmos
  GIZMO_LAB: '/gizmo-lab',
} as const;

/**
 * Build dynamic route with parameters
 * @example buildRoute(ROUTES.ASSET_DETAIL, { id: '123' }) -> '/assets/123'
 */
export function buildRoute(template: string, params: Record<string, string>): string {
  let route = template;
  for (const [key, value] of Object.entries(params)) {
    route = route.replace(`:${key}`, value);
  }
  return route;
}

/**
 * Navigate to a route (helper)
 */
export function navigateTo(route: string) {
  window.location.href = route;
}
