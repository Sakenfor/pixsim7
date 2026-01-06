/**
 * Core Capability Registration (Legacy)
 *
 * This file previously contained action registration functions for core features.
 *
 * As of Phase 1 action consolidation, all actions have been migrated to their
 * respective module page.actions definitions:
 *
 * - assets.* -> apps/main/src/features/assets/module.ts
 * - workspace.* -> apps/main/src/features/workspace/module.ts
 * - generation.* -> apps/main/src/features/generation/routes/index.ts
 * - game.* -> apps/main/src/features/worldTools/module.ts
 * - automation.* -> apps/main/src/features/automation/module.ts
 * - plugins.* -> apps/main/src/features/plugins/routes/index.ts
 * - app-map.* -> apps/main/src/features/devtools/routes/index.ts
 * - graph.* -> apps/main/src/features/graph/routes/index.ts
 * - interactions.* -> apps/main/src/features/interactions/routes/index.ts
 * - gizmos.* -> apps/main/src/features/gizmos/routes/index.ts
 *
 * State capabilities are registered in module initialize() functions.
 *
 * @see docs/architecture/reviews/2025-01-06-action-registration-consolidation-analysis.md
 */

// This file is intentionally kept for documentation purposes.
// No action registration functions remain after Phase 1 migration.
