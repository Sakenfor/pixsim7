import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import { registerContextMenuActions, configurePanelLookup } from '@lib/dockview'
import { panelSelectors } from '@lib/plugins/catalogSelectors'

import { registerModules, moduleRegistry } from '@app/modules'

import App from './App.tsx'
import { initializeConsole } from './lib/dev/console'
import { DevToolProvider } from './lib/dev/devtools/devToolContext'
import { initWebLogger, logEvent } from './lib/utils/logging'

import '@lib/dockview' // Register auto-context menu presets

// Initialize web logging for frontend
initWebLogger('frontend')
logEvent('INFO', 'frontend_app_started')

// Initialize console namespace (pixsim.*)
initializeConsole()

// Register and initialize modules outside React to avoid StrictMode re-runs
registerModules()

registerContextMenuActions()
configurePanelLookup(panelSelectors)

async function initializeDevDiagnostics() {
  if (!import.meta.env.DEV) {
    return
  }

  await Promise.all([
    import('./lib/debugControlCenterPersistence'), // Debug utility for persistence issues
    import('./lib/dev/guardPerformanceMeasure'),
  ])
}

async function bootstrapApp() {
  await initializeDevDiagnostics()

  // Initialize only critical infrastructure before first paint.
  await moduleRegistry.initializeByPriority(75)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DevToolProvider>
        <App />
      </DevToolProvider>
    </StrictMode>,
  )
}

void bootstrapApp()
