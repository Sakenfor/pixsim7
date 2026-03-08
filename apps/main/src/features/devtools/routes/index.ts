import { lazy } from 'react';

import type { ActionDefinition } from '@pixsim7/shared.types';

import type { Module } from '@app/modules/types';

const CodegenDevPage = lazy(() => import('./pages/CodegenDevPage').then(m => ({ default: m.CodegenDevPage })));
const DevPromptImporterPage = lazy(() => import('./pages/DevPromptImporterPage').then(m => ({ default: m.DevPromptImporterPage })));
const BlockFitDevPage = lazy(() => import('./pages/BlockFitDevPage').then(m => ({ default: m.BlockFitDevPage })));

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

export const healthModule: Module = {
  id: 'health',
  name: 'Health Monitor',
  page: {
    route: '/health',
    icon: 'heart',
    iconColor: 'text-red-500',
    description: 'Monitor system health and job status',
    category: 'management',
    featureId: 'health',
    hidden: true,
  },
};

export const codegenPageModule: Module = {
  id: 'codegen-page',
  name: 'Developer Tasks',
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
};

export const promptImporterPageModule: Module = {
  id: 'prompt-importer-page',
  name: 'Prompt Importer',
  page: {
    route: '/dev/prompt-importer',
    icon: 'upload',
    description: 'Import prompts from external sources',
    category: 'development',
    featureId: 'prompt-importer',
    hidden: true,
    component: DevPromptImporterPage,
  },
};

export const blockFitPageModule: Module = {
  id: 'block-fit-page',
  name: 'Block Fit Inspector',
  page: {
    route: '/dev/block-fit',
    icon: 'target',
    description: 'Inspect and rate how well ActionBlocks fit specific assets',
    category: 'development',
    featureId: 'block-fit',
    hidden: true,
    component: BlockFitDevPage,
  },
};
