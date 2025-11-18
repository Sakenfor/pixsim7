import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initWebLogger, logEvent } from './lib/logging'
import { registerBuiltInMiniGames } from '@pixsim7/game-ui'

// Initialize web logging for game frontend
initWebLogger('game_frontend')
logEvent('INFO', 'game_frontend_app_started')

// Register mini-games
registerBuiltInMiniGames()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
