import { lazy } from 'react';
import type { ReactNode } from 'react';

export interface DevtoolsRoute {
  path: string;
  label: string;
  description?: string;
  element: ReactNode;
  hideFromHome?: boolean;
}

const CodegenDev = lazy(() => import('@devtools/mainApp/routes/CodegenDev').then(m => ({ default: m.CodegenDev })));
const DevPromptImporter = lazy(() => import('@devtools/mainApp/routes/DevPromptImporter').then(m => ({ default: m.DevPromptImporter })));
const BlockFitDev = lazy(() => import('@devtools/mainApp/routes/BlockFitDev').then(m => ({ default: m.BlockFitDev })));

export const devtoolsRoutes: DevtoolsRoute[] = [
  {
    path: '/dev/codegen',
    label: 'Codegen',
    description: 'Run and verify workspace code generation tasks.',
    element: <CodegenDev />,
  },
  {
    path: '/dev/prompt-importer',
    label: 'Prompt Importer',
    description: 'Import prompts from external sources.',
    element: <DevPromptImporter />,
  },
  {
    path: '/dev/block-fit',
    label: 'Block Fit',
    description: 'Inspect and rate ActionBlock fit against assets.',
    element: <BlockFitDev />,
  },
];
