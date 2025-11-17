# PixSim7 Launcher Web UI

Modern web interface for managing PixSim7 services.

Built with SvelteKit, TailwindCSS, and WebSockets for real-time updates.

---

## Features

✅ **Service Management** - Start, stop, restart services
✅ **Real-time Updates** - WebSocket for live status
✅ **Log Viewer** - Query and filter service logs
✅ **Dark Mode** - Beautiful dark/light themes
✅ **Responsive** - Works on desktop, tablet, mobile
✅ **Modern UI** - Clean, intuitive interface

---

## Quick Start

### Prerequisites

1. **Node.js 18+** installed
2. **API running** on http://localhost:8100

### Start the API first:

```bash
cd ../
./start-api.sh   # or start-api.bat on Windows
```

### Start the Web UI:

**Linux/Mac:**
```bash
./start-web.sh
```

**Windows:**
```bash
start-web.bat
```

**Or manually:**
```bash
npm install
npm run dev
```

### Access the UI:

Open http://localhost:3100 in your browser

---

## Screenshots

### Service Dashboard
- Grid of service cards
- Status indicators (running/stopped)
- Health badges (healthy/unhealthy/starting)
- Start/Stop/Restart buttons

### Log Viewer
- Real-time log streaming
- Filter by text or log level
- Auto-scroll option
- Clear logs

### Live Updates
- WebSocket connection indicator
- Real-time service status changes
- Event log (debug view)

---

## Architecture

```
┌─────────────────────────────────┐
│  SvelteKit Web App              │
│  ┌───────────────────────────┐  │
│  │  Components               │  │
│  │  - ServiceCard            │  │
│  │  - LogViewer              │  │
│  └────────┬──────────────────┘  │
│           │                      │
│  ┌────────▼──────────────────┐  │
│  │  Stores (State)           │  │
│  │  - services               │  │
│  │  - websocket              │  │
│  └────┬───────────┬──────────┘  │
│       │           │              │
│  ┌────▼────┐ ┌────▼──────────┐  │
│  │  API    │ │  WebSocket    │  │
│  │  Client │ │  Client       │  │
│  └────┬────┘ └────┬──────────┘  │
└───────┼───────────┼──────────────┘
        │           │
        ▼           ▼
   REST API     WebSocket
http://localhost:8100
```

---

## Development

### Install dependencies:
```bash
npm install
```

### Run development server:
```bash
npm run dev
```

### Build for production:
```bash
npm run build
npm run preview
```

### Type checking:
```bash
npm run check
```

---

## Configuration

### API URL

Set via environment variable:

```bash
# .env file
VITE_API_URL=http://localhost:8100
VITE_WS_URL=ws://localhost:8100/events/ws
```

### Port

Change port in `vite.config.js`:

```js
export default defineConfig({
  server: {
    port: 3100  // Change this
  }
});
```

---

## Features in Detail

### Service Cards

Each service card shows:
- Service title and key
- Status badge (stopped/starting/running/etc.)
- Health indicator with emoji (🟢🟡🔴)
- PID if running
- Error message if failed
- Tool availability warning
- Start/Stop/Restart buttons

### Log Viewer

Features:
- Real-time log updates (auto-refresh every 2s)
- Text filter (case-insensitive search)
- Log level filter (ERROR, WARNING, INFO, DEBUG)
- Configurable tail (number of lines)
- Auto-scroll option
- Color-coded log levels
- Clear logs button

### WebSocket Events

Automatically receives:
- `process.started` - Service started
- `process.stopped` - Service stopped
- `health.update` - Health status changed
- `log.line` - New log line

Connection indicator shows live status.

### Global Controls

- **Start All** - Start all stopped services
- **Stop All** - Stop all running services (with confirmation)
- **Refresh** - Manually reload service states

### Statistics

Header shows:
- Running services count
- Healthy services count
- WebSocket connection status

---

## Project Structure

```
launcher_web/
├── package.json              # Dependencies
├── svelte.config.js          # SvelteKit config
├── vite.config.js            # Vite config
├── tailwind.config.js        # TailwindCSS config
├── postcss.config.js         # PostCSS config
├── src/
│   ├── app.html             # HTML template
│   ├── app.css              # Global styles (Tailwind)
│   ├── routes/
│   │   ├── +layout.svelte   # Root layout
│   │   └── +page.svelte     # Main page
│   └── lib/
│       ├── api/
│       │   └── client.js    # API client
│       ├── stores/
│       │   ├── services.js  # Service state
│       │   └── websocket.js # WebSocket connection
│       └── components/
│           ├── ServiceCard.svelte
│           └── LogViewer.svelte
├── start-web.sh             # Linux/Mac startup
└── start-web.bat            # Windows startup
```

---

## Customization

### Colors

Edit `tailwind.config.js` to customize colors:

```js
theme: {
  extend: {
    colors: {
      primary: {
        500: '#0ea5e9',  // Change this
        // ...
      }
    }
  }
}
```

### Refresh Intervals

Edit `src/routes/+page.svelte`:

```js
// Refresh services every 5 seconds
const interval = setInterval(loadServices, 5000);  // Change this
```

Edit `src/lib/components/LogViewer.svelte`:

```js
// Auto-refresh logs every 2 seconds
refreshInterval = setInterval(loadLogs, 2000);  // Change this
```

---

## Troubleshooting

### "Failed to fetch"

Make sure the API is running:
```bash
curl http://localhost:8100/health
```

### WebSocket not connecting

Check:
1. API is running on port 8100
2. No firewall blocking WebSocket connections
3. Browser console for errors

### Services not loading

1. Check browser console for errors
2. Verify API is accessible
3. Check CORS settings in API

### Styling issues

1. Run `npm install` to ensure dependencies are installed
2. Check `tailwind.config.js` content paths
3. Clear browser cache

---

## Production Deployment

### Build:
```bash
npm run build
```

### Preview build:
```bash
npm run preview
```

### Deploy to static hosting:

The built files will be in `build/` directory.
Deploy to:
- Vercel
- Netlify
- GitHub Pages
- Any static hosting

### Environment variables:

Set in deployment platform:
```
VITE_API_URL=https://your-api.com
VITE_WS_URL=wss://your-api.com/events/ws
```

---

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Requires:
- WebSocket support
- ES2020+ support
- CSS Grid

---

## Comparison with Qt Launcher

| Feature | Qt Launcher | Web UI |
|---------|-------------|--------|
| Platform | Desktop only | Any browser |
| Installation | Requires Python + Qt | No install |
| Updates | Manual | Instant |
| Mobile Support | No | Yes (responsive) |
| Remote Access | No | Yes (via network) |
| Real-time Updates | Qt Signals | WebSocket |
| Performance | Native | Very fast |
| Business Logic | ✅ Same launcher_core | ✅ Same launcher_core |

---

## Next Steps

- Add authentication (login/logout)
- Add service configuration editor
- Add metrics/charts
- Add keyboard shortcuts
- Add service dependencies visualization
- Add mobile app (React Native)

---

**Status:** Production-ready ✅
**Version:** 0.2.0
**Built with:** SvelteKit, TailwindCSS, WebSocket
**Powered by:** launcher_core + launcher_api
