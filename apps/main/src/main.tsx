import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import { registerContextMenuActions, configurePanelLookup } from '@lib/dockview'
import { panelSelectors } from '@lib/plugins/catalogSelectors'
import { pruneOrphans as pruneStoreOrphans } from '@lib/stores'

import { registerModules, moduleRegistry } from '@app/modules'

import App from './App.tsx'
import { sweepMaskOverlayDrafts } from './components/media/viewer/overlays/builtins/maskOverlayCleanup'

// Side-effect imports: feature-level store registry declarations (deprecated
// patterns, managed prefixes). Imported eagerly so pruneStoreOrphans() at
// bootstrap sees them. Keep these modules tiny — no React / heavy deps.
import '@features/generation/stores.registrations'

// Side-effect import: registers the per-panel skin store's persisted key
// with the stores registry. See plan `panel-skin-theming`.
import '@features/appearance/panelSkins.registrations'

// Side-effect import: registers built-in ticker sources (generations, etc.)
// before the first <Ticker /> mounts. See `stores-registry-canon`.
import '@features/ticker/sources.registrations'

// Side-effect import: declares ownership of per-panel useSidebarNav keys
// (active sidebar tab persistence). See `stores-registry-canon`.
import '@lib/stores/sidebarNav.registrations'

// Side-effect import: arms media instrumentation (object-URL / AudioContext /
// <video>-churn counters) from boot so the PerformancePanel memory report can
// attribute native-memory growth. See plan `frontend-memory`.
import '@lib/media/mediaInstrumentation'

// Side-effect import: attaches the asset-engagement view/play tracking
// subscriptions to the assetEvents bus at boot, so "played" signals are
// captured even before the Recent strip first mounts.
import '@features/assets/stores/assetEngagementStore'

// Side-effect import: registers the generation feature's WS routing
// listener (job:* / asset:*) against the shared lib-level wsManager.
// Must run before any subscriber opens the connection so messages are
// not delivered into a routing-less manager.
import '@features/generation/hooks/useGenerationWebSocket'

// Side-effect import: wires the bottom-right pause toast bridge (coalesced,
// per-generation, reason-aware). Must run after the WS routing import above so
// `job:paused` transitions are delivered into the store the bridge watches.
import '@features/generation/lib/pauseToast'

import { configureKVStorage, configureMetricPreviewApi } from '@pixsim7/game.engine'
import { getAuthTokenProvider } from '@pixsim7/shared.auth.core'


import { API_BASE_URL } from './lib/api/client'
import { initializeConsole } from './lib/dev/console'
import { DevToolProvider } from './lib/dev/devtools/devToolContext'
import { initCoarsePointerClass } from './lib/ui/coarsePointer'
import { initWebLogger, logEvent } from './lib/utils/logging'

import '@lib/dockview' // Register auto-context menu presets

// Initialize web logging for frontend
initWebLogger('frontend')
logEvent('INFO', 'frontend_app_started')

// Initialize console namespace (pixsim.*)
initializeConsole()

// Toggle the `coarse-pointer` root class for touch/stylus devices so the
// global hit-area expansion in index.css applies app-wide.
initCoarsePointerClass()

// Register and initialize modules outside React to avoid StrictMode re-runs
registerModules()

// Run module `cleanup` hooks (store unsubscribes, settings unregisters) before
// a dev full reload re-executes the bundle. Scoped to `vite:beforeFullReload`
// rather than `hot.dispose` on purpose: the registry is an hmrSingleton and
// registerModules() only runs at boot, so a partial-HMR teardown would leave
// the app de-registered. Inert in production (no hot, no full-reload event).
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', () => {
    void moduleRegistry.cleanupAll()
  })
}

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

// Wire the engine's metric preview helpers (previewUnifiedMood,
// previewReputationBand, etc.) to an authed fetch. Without this, callers like
// useUnifiedMood throw "fetch not configured".
configureMetricPreviewApi({
  baseUrl: API_BASE_URL,
  fetch: async (input, init) => {
    const token = await Promise.resolve(getAuthTokenProvider().getAccessToken())
    const headers = new Headers(init?.headers)
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    return fetch(input, { ...init, headers })
  },
})

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

  // Cap mask-overlay draft retention (LRU + age TTL). Drafts are 100-300 KB
  // each and there's no orphan signal for them — bounded retention is the
  // only mechanism keeping the prefix from exhausting localStorage quota.
  const maskSweepResult = sweepMaskOverlayDrafts()
  const maskRemoved =
    maskSweepResult.removedByAge + maskSweepResult.removedByCap + maskSweepResult.removedInvalid
  if (maskRemoved > 0) {
    logEvent('INFO', 'mask_overlay_drafts_pruned', {
      scanned: maskSweepResult.scanned,
      removed_by_age: maskSweepResult.removedByAge,
      removed_by_cap: maskSweepResult.removedByCap,
      removed_invalid: maskSweepResult.removedInvalid,
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
