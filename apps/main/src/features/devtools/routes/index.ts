import type { ActionDefinition } from '@pixsim7/shared.types';
import { lazy } from 'react';


import { defineModule } from '@app/modules/types';

const CodegenDevPage = lazy(() => import('./pages/CodegenDevPage').then(m => ({ default: m.CodegenDevPage })));
const DevPromptImporterPage = lazy(() => import('./pages/DevPromptImporterPage').then(m => ({ default: m.DevPromptImporterPage })));
const BlockFitDevPage = lazy(() => import('./pages/BlockFitDevPage').then(m => ({ default: m.BlockFitDevPage })));
const DevToolsPage = lazy(() => import('./pages/DevToolsPage').then(m => ({ default: m.DevToolsPage })));

const openCodegenAction: ActionDefinition = {
  id: 'codegen.open',
  featureId: 'codegen',
  title: 'Open Developer Tasks',
  description: 'Code generation, database migrations, and other developer tasks',
  icon: 'code',
  route: '/dev/developer-tasks',
  contexts: ['background'],
  category: 'quick-add',
};

export const healthModule = defineModule({
  id: 'health',
  name: 'Health Monitor',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for health monitor route module.',
  featureHighlights: ['Health route module now participates in shared latest-update metadata.'],
  page: {
    route: '/health',
    icon: 'heart',
    iconColor: 'text-red-500',
    description: 'Monitor system health and job status',
    category: 'management',
    featureId: 'health',
    hidden: true,
  },
});

export const codegenPageModule = defineModule({
  id: 'codegen-page',
  name: 'Developer Tasks',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for developer tasks route module.',
  featureHighlights: ['Codegen route module now participates in shared latest-update metadata.'],
  page: {
    route: '/dev/developer-tasks',
    icon: 'code',
    iconColor: 'text-amber-500',
    description: 'Code generation, database migrations, and other developer tasks',
    category: 'development',
    featureId: 'codegen',
    hidden: true,
    component: CodegenDevPage,
    actions: [openCodegenAction],
  },
});

export const promptImporterPageModule = defineModule({
  id: 'prompt-importer-page',
  name: 'Prompt Importer',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for prompt importer route module.',
  featureHighlights: ['Prompt importer route module now participates in shared latest-update metadata.'],
  page: {
    route: '/dev/prompt-importer',
    icon: 'upload',
    description: 'Import prompts from external sources',
    category: 'development',
    featureId: 'prompt-importer',
    hidden: true,
    component: DevPromptImporterPage,
  },
});

export const devToolsPanelModule = defineModule({
  id: 'dev-tools-panel',
  name: 'Dev Tools',
  updatedAt: '2026-04-16T00:00:00Z',
  changeNote: 'DEV-group shortcut — renders DevToolsPanel inline as a full page, or via the SubNav float chip to overlay the current page.',
  featureHighlights: ['Full-page view at /dev-tools plus float-on-current-page via the SubNav flyout.'],
  page: {
    route: '/dev-tools',
    icon: 'flask',
    iconColor: 'text-orange-500',
    description: 'Browse developer tools and diagnostics',
    category: 'development',
    featureId: 'dev-tools',
    featurePrimary: true,
    component: DevToolsPage,
  },
});

export const blockFitPageModule = defineModule({
  id: 'block-fit-page',
  name: 'Block Fit Inspector',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for block-fit route module.',
  featureHighlights: ['Block-fit route module now participates in shared latest-update metadata.'],
  page: {
    route: '/dev/block-fit',
    icon: 'target',
    description: 'Inspect and rate how well ActionBlocks fit specific assets',
    category: 'development',
    featureId: 'block-fit',
    hidden: true,
    component: BlockFitDevPage,
  },
});
