import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/index.css';

import { registerContextMenuActions } from '@lib/dockview';
import { registerModules, moduleRegistry } from '@app/modules';

import { initializeConsole } from '@lib/dev/console';
import { initWebLogger, logEvent } from '@lib/utils/logging';
import { DevToolProvider } from '@lib/dev/devtools/devToolContext';

import '@lib/dockview';

import App from './App';

initWebLogger('frontend-devtools');
logEvent('INFO', 'devtools_app_started');

initializeConsole();

registerModules();
moduleRegistry.initializeAll();

registerContextMenuActions();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DevToolProvider>
      <App />
    </DevToolProvider>
  </StrictMode>,
);
