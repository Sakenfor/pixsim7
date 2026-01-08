import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import { registerContextMenuActions } from '@lib/dockview'

import { registerQuickGenerateComponentSettings } from '@features/controlCenter/lib/registerQuickGenerateComponentSettings'
import { registerGenerationScopes } from '@features/generation'
import { registerPreviewScopes } from '@features/preview'

import { moduleRegistry } from '@app/modules'

import App from './App.tsx'
import { registerFrontendMiniGames } from './components/minigames/registry'
import { registerBrainTools } from './features/brainTools/lib/registerBrainTools'
import { registerGallerySurfaces } from './features/gallery/lib/core/registerGallerySurfaces'
import { registerDevTools } from './lib/dev/devtools/registerDevTools'
import { initWebLogger, logEvent } from './lib/utils/logging'

import { registerBuiltInMiniGames } from '@pixsim7/game.components'

import '@features/providers/lib/plugins' // Register provider generation UI plugins
import '@lib/dockview' // Register auto-context menu presets
import { registerGalleryTools } from './features/gallery/lib/core/registerGalleryTools'
import { registerWorldTools } from './features/worldTools/lib/registerWorldTools'
import { registerGizmoSurfaces } from './features/gizmos'
import { DevToolProvider } from './lib/dev/devtools/devToolContext'
import { registerPromptCompanion } from './plugins/ui/prompt-companion'

import './lib/debugControlCenterPersistence' // Debug utility for persistence issues
import './lib/utils/debugFlags' // Debug flags system for toggleable logging
import { initializeConsole } from './lib/dev/console'

// Initialize web logging for frontend
initWebLogger('frontend')
logEvent('INFO', 'frontend_app_started')

// Register mini-games
registerBuiltInMiniGames()
registerFrontendMiniGames()

// Register dev tools
registerDevTools()

// Register gallery surfaces and tools
registerGallerySurfaces()
registerGalleryTools()

// Register brain and world tools
registerBrainTools()
registerWorldTools()

// Register gizmo surfaces
registerGizmoSurfaces()

// Register prompt companion plugin
registerPromptCompanion()

// Register scope definitions
registerGenerationScopes()
registerPreviewScopes()

// Register Quick Generate component settings
registerQuickGenerateComponentSettings()

// Initialize console namespace (pixsim.*)
initializeConsole()

// Initialize modules and context menu actions outside React to avoid StrictMode re-runs
moduleRegistry.initializeAll()
registerContextMenuActions()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DevToolProvider>
      <App />
    </DevToolProvider>
  </StrictMode>,
)
