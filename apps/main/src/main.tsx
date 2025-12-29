import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initWebLogger, logEvent } from './lib/utils/logging'
import { registerBuiltInMiniGames } from '@pixsim7/game.components'
import { registerFrontendMiniGames } from './components/minigames/registry'
import '@features/providers/lib/plugins' // Register provider generation UI plugins
import '@lib/dockview/contextMenu/autoContextPresets' // Register auto-context menu presets
import { registerDevTools } from './lib/dev/devtools/registerDevTools'
import { registerGallerySurfaces } from './features/gallery/lib/core/registerGallerySurfaces'
import { registerGalleryTools } from './features/gallery/lib/core/registerGalleryTools'
import { registerGizmoSurfaces } from './features/gizmos'
import { DevToolProvider } from './lib/dev/devtools/devToolContext'
import { registerPromptCompanion } from './plugins/ui/prompt-companion'
import { registerGenerationScopes } from '@features/generation'
import { registerPreviewScopes } from '@features/preview'
import { registerQuickGenerateComponentSettings } from '@features/controlCenter/lib/registerQuickGenerateComponentSettings'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DevToolProvider>
      <App />
    </DevToolProvider>
  </StrictMode>,
)
