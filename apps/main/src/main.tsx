import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import { registerContextMenuActions, configurePanelLookup } from '@lib/dockview'
import { panelSelectors } from '@lib/plugins/catalogSelectors'
import { pruneOrphans as pruneStoreOrphans } from '@lib/stores'

// Side-effect imports: feature-level store registry declarations (deprecated
// patterns, managed prefixes). Imported eagerly so pruneStoreOrphans() at
// bootstrap sees them. Keep these modules tiny — no React / heavy deps.
import '@features/generation/stores.registrations'

import { configureKVStorage } from '@pixsim7/game.engine'

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

// Register video scrubber keyboard actions as capabilities (configurable).
import('./components/media/scrubberCapabilityActions').then(({ registerScrubberCapabilityActions }) => {
  registerScrubberCapabilityActions()
})

// Register media-card generation shortcuts (Extend/Regenerate/Quick-Gen/…).
import('./components/media/mediaCardCapabilityActions').then(({ registerMediaCardCapabilityActions }) => {
  registerMediaCardCapabilityActions()
})

// Register asset viewer panel shortcuts (Esc/←/→/F/I).
import('./components/media/viewerPanelCapabilityActions').then(({ registerViewerPanelCapabilityActions }) => {
  registerViewerPanelCapabilityActions()
})

try {
  if (typeof window !== 'undefined' && window.localStorage) {
    configureKVStorage(window.localStorage)
  }
} catch {
  // Ignore storage access errors (e.g. restricted browser contexts).
}

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

  // Purge deprecated + orphan localStorage entries declared via the store
  // registry. Runs after top-level imports so module-level registrations
  // have already fired, before React mounts so stores hydrate from a clean
  // slate.
  const pruneResult = pruneStoreOrphans()
  if (pruneResult.removed.length > 0) {
    logEvent('INFO', 'store_registry_pruned', {
      deprecated: pruneResult.deprecatedRemoved,
      orphans: pruneResult.orphansRemoved,
    })
  }

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
