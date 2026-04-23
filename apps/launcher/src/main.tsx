import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { EmbeddedLogViewer } from './components/EmbeddedLogViewer'
import { DbLogViewer } from './components/DbLogViewer'

// flexlayout-react's error boundary logs crashes via console.debug, which is
// hidden by default in WebView2/DevTools. Surface rendering errors so the
// tab's "Error rendering component" message is actually investigable.
{
  const origDebug = console.debug.bind(console)
  console.debug = (...args: unknown[]) => {
    const first = args[0]
    if (first instanceof Error || (args[1] && typeof args[1] === 'object' && 'componentStack' in (args[1] as object))) {
      console.error('[flexlayout render error]', ...args)
    }
    origDebug(...args)
  }
}

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
