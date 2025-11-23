import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initWebLogger, logEvent } from './lib/logging'
import { registerBuiltInMiniGames } from '@pixsim7/game.components'
import { registerFrontendMiniGames } from './components/minigames/registry'
import './lib/providers/plugins' // Register provider generation UI plugins
import { registerDevTools } from './lib/devtools/registerDevTools'
import { registerGallerySurfaces } from './lib/gallery/registerGallerySurfaces'

// Initialize web logging for frontend
initWebLogger('frontend')
logEvent('INFO', 'frontend_app_started')

// Register mini-games
registerBuiltInMiniGames()
registerFrontendMiniGames()

// Register dev tools
registerDevTools()

// Register gallery surfaces
registerGallerySurfaces()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
