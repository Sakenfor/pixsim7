/**
 * Dev Tool Plugin Definitions
 *
 * Defines all built-in developer tools that can be displayed
 * in the Dev Tools surface.
 *
 * These tools are registered with the plugin catalog on app startup.
 */

import { defineDevTool } from '@pixsim7/shared.devtools.core';
import { lazy } from 'react';

// Lazy-loaded dev tool components — only fetched when a dev tool is actually opened
const SessionStateViewer = lazy(() => import('@features/panels/components/dev/SessionStateViewer').then(m => ({ default: m.SessionStateViewer })));
const GenerationHealthView = lazy(() => import('@features/panels/components/dev/GenerationHealthView').then(m => ({ default: m.GenerationHealthView })));
const CapabilityTestingPanel = lazy(() => import('@features/panels/components/dev/CapabilityTestingPanel').then(m => ({ default: m.CapabilityTestingPanel })));
const AppMapPanel = lazy(() => import('@features/panels/components/dev/AppMapPanel').then(m => ({ default: m.AppMapPanel })));
const DocBrowserPanel = lazy(() => import('@features/panels/components/dev/DocBrowserPanel').then(m => ({ default: m.DocBrowserPanel })));
const GizmoSurfacesPanel = lazy(() => import('@features/panels/components/dev/GizmoSurfacesPanel').then(m => ({ default: m.GizmoSurfacesPanel })));
const TypesExplorerPanel = lazy(() => import('@features/panels/components/dev/TypesExplorerPanel').then(m => ({ default: m.TypesExplorerPanel })));
const SqlQueryExplorerPanel = lazy(() => import('@features/panels/components/dev/SqlQueryExplorerPanel').then(m => ({ default: m.SqlQueryExplorerPanel })));
const LogViewerPanel = lazy(() => import('@features/panels/components/dev/LogViewerPanel').then(m => ({ default: m.LogViewerPanel })));
const TestOverviewPanel = lazy(() => import('@features/panels/components/dev/TestOverviewPanel').then(m => ({ default: m.TestOverviewPanel })));
const CodegenDevPage = lazy(() => import('../routes/pages/CodegenDevPage').then(m => ({ default: m.CodegenDevPage })));

// ============================================================================
// Session & World State Tools
// ============================================================================

export const sessionStateViewerTool = defineDevTool({
  id: 'session-state-viewer',
  label: 'Session State Viewer',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for session state inspection tool.',
  featureHighlights: ['World/session flags and relationship inspection in one panel.'],
  description: 'Inspect GameSession flags, relationships, and world time',
  icon: 'globe',
  category: 'session',
  panelComponent: SessionStateViewer,
  tags: ['session', 'debug', 'state', 'world', 'relationships'],
});

export const generationHealthTool = defineDevTool({
  id: 'generation-health',
  label: 'Generation Health',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for generation diagnostics tool.',
  featureHighlights: ['Generation health and diagnostics visibility for content pipelines.'],
  description: 'Monitor content generation health and diagnostics',
  icon: 'heart',
  category: 'generation',
  panelComponent: GenerationHealthView,
  tags: ['generation', 'health', 'diagnostics', 'content'],
});

export const capabilityTestingTool = defineDevTool({
  id: 'capability-testing',
  label: 'Capability Testing',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for capability validation tool.',
  featureHighlights: ['Manual validation surface for capability registration and behavior.'],
  description: 'Test and validate system capabilities',
  icon: 'checkCircle',
  category: 'debug',
  panelComponent: CapabilityTestingPanel,
  tags: ['capabilities', 'testing', 'validation'],
});

// ============================================================================
// Architecture & Graph Tools
// ============================================================================

export const appMapTool = defineDevTool({
  id: 'app-map',
  label: 'App Map',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for architecture mapping tool.',
  featureHighlights: ['Live architecture map for features, registries, and plugin surfaces.'],
  description: 'Live map of features, plugins, registries, and architecture diagnostics',
  icon: 'graph',
  category: 'graph',
  panelComponent: AppMapPanel,
  tags: ['architecture', 'plugins', 'registries', 'capabilities', 'diagnostics'],
});

export const docBrowserTool = defineDevTool({
  id: 'doc-browser',
  label: 'Docs',
  updatedAt: '2026-03-13T00:00:00Z',
  changeNote: 'Standalone documentation browser extracted from App Map.',
  featureHighlights: ['Browse, search, and read project documentation with linked navigation.'],
  description: 'Browse and search project documentation',
  icon: 'fileText',
  category: 'graph',
  panelComponent: DocBrowserPanel,
  tags: ['docs', 'documentation', 'plans', 'architecture', 'search'],
});

// ============================================================================
// Analytics & Metrics Tools
// ============================================================================

// ============================================================================
// Gizmo & Surface Management
// ============================================================================

export const gizmoSurfacesTool = defineDevTool({
  id: 'gizmo-surfaces',
  label: 'Gizmo Surfaces',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for gizmo surface management tool.',
  featureHighlights: ['Centralized debugging surface for overlays and gizmo dashboards.'],
  description: 'Manage gizmo overlays and debug dashboard surfaces',
  icon: 'sliders',
  category: 'debug',
  panelComponent: GizmoSurfacesPanel,
  tags: ['gizmos', 'surfaces', 'overlays', 'dashboards', 'debug'],
});

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
// Types & Schema Tools
// ============================================================================

export const typesExplorerTool = defineDevTool({
  id: 'types-explorer',
  label: 'Types Explorer',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for generated-type explorer.',
  featureHighlights: ['One-stop browsing for generated OpenAPI and composition-role types.'],
  description: 'Browse generated types: composition roles, region labels, OpenAPI',
  icon: 'fileCode',
  category: 'debug',
  panelComponent: TypesExplorerPanel,
  tags: ['types', 'openapi', 'schema', 'generated', 'composition', 'roles', 'labels'],
  safeForNonDev: true,
});

// ============================================================================
// Database & Diagnostics Tools
// ============================================================================

export const sqlQueryExplorerTool = defineDevTool({
  id: 'sql-query-explorer',
  label: 'SQL Query Explorer',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for SQL diagnostics panel.',
  featureHighlights: ['Read-only SQL exploration for operational diagnostics.'],
  description: 'Run read-only SQL queries for diagnostics and data exploration',
  icon: 'database',
  category: 'debug',
  panelComponent: SqlQueryExplorerPanel,
  tags: ['sql', 'database', 'diagnostics', 'query', 'admin'],
  safeForNonDev: false, // Admin only
});

// ============================================================================
// Log Viewer
// ============================================================================

export const logViewerTool = defineDevTool({
  id: 'log-viewer',
  label: 'Log Viewer',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for structured log inspection tool.',
  featureHighlights: ['Trace and request-level backend log exploration UI.'],
  description: 'Query and inspect structured backend logs, trace jobs and requests',
  icon: 'fileText',
  category: 'debug',
  panelComponent: LogViewerPanel,
  tags: ['logs', 'trace', 'debug', 'worker', 'pipeline', 'jobs', 'requests', 'errors'],
  safeForNonDev: true,
});

// ============================================================================
// Testing Overview
// ============================================================================

export const testOverviewTool = defineDevTool({
  id: 'test-overview',
  label: 'Test Overview',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added canonical metadata baseline for local test overview tool.',
  featureHighlights: ['Test profile and suite coverage snapshots in one place.'],
  description: 'View test runner profiles, suite coverage, and local run snapshots.',
  icon: 'flask',
  category: 'debug',
  panelComponent: TestOverviewPanel,
  tags: ['tests', 'quality', 'profiles', 'pytest', 'vitest'],
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
