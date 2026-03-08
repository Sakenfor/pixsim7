import { lazy } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

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
    path: '/dev/developer-tasks',
    label: 'Developer Tasks',
    description: 'Code generation, database migrations, and other developer tasks.',
    element: <CodegenDev />,
  },
  {
    path: '/dev/codegen',
    label: 'Codegen (redirect)',
    element: <Navigate to="/dev/developer-tasks" replace />,
    hideFromHome: true,
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
