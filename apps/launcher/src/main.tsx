import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { EmbeddedLogViewer } from './components/EmbeddedLogViewer'
import { DbLogViewer } from './components/DbLogViewer'

// SPA routes (no router needed — just pathname matching)
const path = location.pathname.replace(/\/$/, '')

let Page: React.FC
if (path.endsWith('/viewer')) {
  Page = EmbeddedLogViewer   // /viewer#serviceKey — embedded console log viewer
} else if (path.endsWith('/db-logs')) {
  Page = DbLogViewer          // /db-logs — structured DB log query viewer
} else {
  Page = App                  // / — full launcher dashboard
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
