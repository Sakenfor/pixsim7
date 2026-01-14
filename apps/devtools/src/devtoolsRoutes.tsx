import { lazy } from 'react';
import type { ReactNode } from 'react';

export interface DevtoolsRoute {
  path: string;
  label: string;
  description?: string;
  element: ReactNode;
  hideFromHome?: boolean;
}

const AppMapDev = lazy(() => import('@/routes/AppMapDev').then(m => ({ default: m.AppMapDev })));
const TemplateAnalyticsDev = lazy(() => import('@/routes/TemplateAnalyticsDev').then(m => ({ default: m.TemplateAnalyticsDev })));
const ModulesDev = lazy(() => import('@/routes/ModulesDev').then(m => ({ default: m.ModulesDev })));
const PromptInspectorDev = lazy(() => import('@/routes/PromptInspectorDev').then(m => ({ default: m.PromptInspectorDev })));
const DevPromptImporter = lazy(() => import('@/routes/DevPromptImporter').then(m => ({ default: m.DevPromptImporter })));
const PromptLabDev = lazy(() => import('@/routes/PromptLabDev').then(m => ({ default: m.PromptLabDev })));
const ActionBlockGraphDev = lazy(() => import('@/routes/ActionBlockGraphDev').then(m => ({ default: m.ActionBlockGraphDev })));
const BlockFitDev = lazy(() => import('@/routes/BlockFitDev').then(m => ({ default: m.BlockFitDev })));
const WidgetBuilderRoute = lazy(() => import('@/routes/WidgetBuilderRoute').then(m => ({ default: m.WidgetBuilderRoute })));
const PluginWorkspaceRoute = lazy(() => import('@/routes/PluginWorkspace').then(m => ({ default: m.PluginWorkspaceRoute })));

export const devtoolsRoutes: DevtoolsRoute[] = [
  {
    path: '/app-map',
    label: 'App Map',
    description: 'Visualize application structure and plugin architecture.',
    element: <AppMapDev />,
  },
  {
    path: '/template-analytics',
    label: 'Template Analytics',
    description: 'Analyze template usage and performance metrics.',
    element: <TemplateAnalyticsDev />,
  },
  {
    path: '/dev/modules',
    label: 'Modules Overview',
    description: 'Inspect registered modules and their status.',
    element: <ModulesDev />,
  },
  {
    path: '/dev/prompt-inspector',
    label: 'Prompt Inspector',
    description: 'Inspect and debug prompts sent to providers.',
    element: <PromptInspectorDev />,
  },
  {
    path: '/dev/prompt-importer',
    label: 'Prompt Importer',
    description: 'Import prompts from external sources.',
    element: <DevPromptImporter />,
  },
  {
    path: '/dev/prompt-lab',
    label: 'Prompt Lab',
    description: 'Analyze, import, and browse prompts.',
    element: <PromptLabDev />,
  },
  {
    path: '/dev/action-block-graph',
    label: 'Action Block Graph',
    description: 'Visualize ActionBlock dependencies and compatibility.',
    element: <ActionBlockGraphDev />,
  },
  {
    path: '/dev/block-fit',
    label: 'Block Fit',
    description: 'Inspect and rate ActionBlock fit against assets.',
    element: <BlockFitDev />,
  },
  {
    path: '/dev/widget-builder',
    label: 'Widget Builder',
    description: 'Build and preview overlay widgets and surfaces.',
    element: <WidgetBuilderRoute />,
  },
  {
    path: '/plugin-workspace',
    label: 'Plugin Workspace',
    description: 'Develop and test plugins with the workspace tooling.',
    element: <PluginWorkspaceRoute />,
  },
  {
    path: '/dev/plugins',
    label: 'Plugin Workspace (Alias)',
    element: <PluginWorkspaceRoute />,
    hideFromHome: true,
  },
];
