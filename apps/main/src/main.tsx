import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import { registerContextMenuActions } from '@lib/dockview'

import { initializePanels } from '@features/panels'

import { registerModules, moduleRegistry } from '@app/modules'

import App from './App.tsx'
import { initializeConsole } from './lib/dev/console'
import { DevToolProvider } from './lib/dev/devtools/devToolContext'
import { initWebLogger, logEvent } from './lib/utils/logging'

import '@lib/dockview' // Register auto-context menu presets

import './lib/debugControlCenterPersistence' // Debug utility for persistence issues
import './lib/utils/debugFlags' // Debug flags system for toggleable logging
import './lib/dev/guardPerformanceMeasure'


// Initialize web logging for frontend
initWebLogger('frontend')
logEvent('INFO', 'frontend_app_started')

// Initialize console namespace (pixsim.*)
initializeConsole()

// Register and initialize modules outside React to avoid StrictMode re-runs
registerModules()

registerContextMenuActions()

async function bootstrapApp() {
  // Initialize infrastructure before rendering.
  await moduleRegistry.initializeAll()
  await initializePanels()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DevToolProvider>
        <App />
      </DevToolProvider>
    </StrictMode>,
  )
}

void bootstrapApp()
