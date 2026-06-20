/**
 * Dev Tool Plugin Definitions
 *
 * `defineDevTool` is the lightweight lane for dev-only catalog entries —
 * typically route-based utilities or hybrid route+panel pages that don't
 * belong in the full workspace panel system.
 *
 * Convention:
 *   - Workspace surface users might dock/float → `definePanel({ category: 'dev' })`
 *     (registers a real panel; automatically surfaces in DevToolsPanel catalog)
 *   - Dev-only route or throwaway utility → `defineDevTool({ ... })` here
 *
 * DevToolsPanel reads panels with `category: 'dev'` AND entries defined
 * here, merging them for display. Keep ids distinct across the two lanes
 * (the plugin catalog is keyed by id).
 */

import { defineDevTool } from '@pixsim7/shared.devtools.core';
import { lazy } from 'react';

// Lazy-loaded dev tool components — only fetched when a dev tool is actually opened
const CodegenDevPage = lazy(() => import('../routes/pages/CodegenDevPage').then(m => ({ default: m.CodegenDevPage })));

// ============================================================================
// Prompt Tools
// ============================================================================

export const promptImporterTool = defineDevTool({
  id: 'prompt-importer',
  label: 'Prompt Importer',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for prompt import workflow.',
  featureHighlights: ['Route-based prompt import utility for external prompt sources.'],
  description: 'Import prompts from external sources',
  icon: 'fileText',
  category: 'prompts',
  routePath: '/dev/prompt-importer',
  tags: ['prompts', 'import', 'library'],
});

export const blockFitTool = defineDevTool({
  id: 'block-fit',
  label: 'Block Fit Inspector',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for block-fit diagnostic tool.',
  featureHighlights: ['Asset-to-action-block fit scoring and diagnostics.'],
  description: 'Inspect and rate how well ActionBlocks fit specific assets',
  icon: 'target',
  category: 'prompts',
  routePath: '/dev/block-fit',
  tags: ['action-blocks', 'assets', 'fit', 'feedback'],
});

// ============================================================================
// Launcher
// ============================================================================

export const launcherWebTool = defineDevTool({
  id: 'launcher-web',
  label: 'Open Launcher',
  updatedAt: '2026-06-19T00:00:00Z',
  changeNote: 'Shortcut from the main app to the launcher web UI.',
  featureHighlights: ['Opens the launcher service web UI in a new browser tab.'],
  description: 'Open the launcher service web UI (services, logs, codegen, DB tools) in a new tab',
  icon: 'rocket',
  category: 'debug',
  // Dev: launcher Vite server on :3100. Prod build: launcher API serves the
  // bundle on :8100. The panel rewrites `localhost` to the current hostname so
  // it survives LAN/ZeroTier access.
  externalUrl: import.meta.env.PROD ? 'http://localhost:8100' : 'http://localhost:3100',
  tags: ['launcher', 'services', 'logs', 'devops'],
  safeForNonDev: true,
});

// ============================================================================
// Codegen Tools
// ============================================================================

export const codegenTool = defineDevTool({
  id: 'codegen',
  label: 'Developer Tasks',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for developer task workspace.',
  featureHighlights: ['Codegen and migration utility surface with persisted settings.'],
  description: 'Code generation, database migrations, and other developer tasks',
  icon: 'code',
  category: 'debug',
  panelComponent: CodegenDevPage,
  routePath: '/dev/developer-tasks',
  tags: ['codegen', 'types', 'schema', 'generation', 'typescript', 'migrations', 'database'],
  safeForNonDev: true,
  settings: [
    {
      type: 'boolean',
      key: 'includeAllPlugins',
      label: 'Include All Plugins',
      description: 'Include all plugin vocabularies in generated types (default: only marked plugins)',
      defaultValue: false,
    },
  ],
});
