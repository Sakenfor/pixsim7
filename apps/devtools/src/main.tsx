import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@devtools/mainApp/styles';

import { registerContextMenuActions } from '@devtools/mainApp/dockview';
import { registerModules, moduleRegistry } from '@devtools/mainApp/modules';

import { initializeConsole } from '@devtools/mainApp/devConsole';
import { initWebLogger, logEvent } from '@devtools/mainApp/logging';
import { DevToolProvider } from '@devtools/mainApp/devToolContext';

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
