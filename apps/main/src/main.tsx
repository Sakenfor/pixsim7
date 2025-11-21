import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initWebLogger, logEvent } from './lib/logging'
import { registerBuiltInMiniGames } from '@pixsim7/game.components'
import { registerFrontendMiniGames } from './components/minigames/registry'
import './lib/providers/plugins' // Register provider generation UI plugins

// Initialize web logging for frontend
initWebLogger('frontend')
logEvent('INFO', 'frontend_app_started')

// Register mini-games
registerBuiltInMiniGames()
registerFrontendMiniGames()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
