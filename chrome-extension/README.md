# PixSim7 Chrome Extension

Provider-agnostic browser extension for PixSim7 video generation platform.

## Architecture

This extension is a **thin client** that leverages the PixSim7 backend for all provider detection and account management logic. No provider logic is duplicated in the extension.

### How it Works

1. **User logs into PixSim7 backend** via the extension popup
2. **Extension sends current tab URL to backend** → Backend detects which provider (Pixverse, Runway, Pika, etc.)
3. **Backend returns accounts** for that provider
4. **Extension displays accounts** and handles cookie injection
5. **User clicks account** → Extension injects cookies and opens provider site

### Benefits

- ✅ **No code duplication**: Provider logic lives only in backend
- ✅ **Automatic provider support**: New providers added to backend work immediately
- ✅ **Centralized management**: All accounts managed via PixSim7 backend
- ✅ **Provider-agnostic**: Works with any video generation provider

## Features

### Current

- 🔐 **Login to PixSim7 backend**
- 🔍 **Automatic provider detection** from current tab URL
- 👤 **Account display** grouped by provider
- 📥 **Cookie import** - Auto-import cookies when logged into provider sites
- 🔄 **Manual import** - Import button in popup for on-demand cookie sync
- 🎨 **Floatable widget** on PixSim7 frontend (localhost:5173)
- ⚙️ **Settings** for backend URL configuration

### Planned (TODOs)

- [ ] Cookie injection for account login (open account in new tab)
- [ ] Account credit sync from provider sites
- [ ] Job monitoring from extension
- [ ] Quick video generation from context menu

## Installation

### Development Mode

1. **Ensure PixSim7 backend is running**:
   ```bash
   cd G:\code\pixsim7
   .\launch.bat
   ```

2. **Load extension in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select `G:\code\pixsim7\chrome-extension` directory

3. **Configure backend URL**:
   - Default: `http://10.243.48.125:8001` (ZeroTier network)
   - If backend is on different IP/port:
     - Click extension icon
     - Go to Settings tab
     - Enter backend URL (e.g., `http://localhost:8001` for local)
     - Click "💾 Save Settings"
   - Click "🔄 Reset to Default" to restore default ZeroTier IP

## Usage

### 1. Login

1. Click the extension icon
2. Enter your PixSim7 username and password
3. Click "Login to PixSim7"

### 2. View Accounts

1. Navigate to a provider website (e.g., https://app.pixverse.ai)
2. Extension automatically detects provider
3. Accounts tab shows all accounts for that provider
4. View account status, credits, and credentials

### 3. Import Cookies

**Auto-Import (Recommended):**
1. Enable "Auto-import cookies" in Settings tab
2. Login to a provider site (e.g., https://app.pixverse.ai)
3. Extension automatically detects login and imports cookies
4. Notification appears confirming import
5. Account is created/updated in PixSim7 backend

**Manual Import:**
1. Login to a provider site
2. Click extension icon
3. Click "📥 Import Cookies from This Site" button
4. Cookies are extracted and sent to backend
5. Account is created/updated

### 4. Using the Widget

1. Open PixSim7 frontend (http://localhost:5173)
2. Widget appears in bottom-right corner
3. Shows all accounts grouped by provider
4. Drag to reposition, minimize when not needed

## Backend API Endpoints Used

The extension communicates with these backend endpoints:

- `POST /api/v1/auth/login` - Authenticate user
- `POST /api/v1/providers/detect` - Detect provider from URL
- `GET /api/v1/providers` - List all registered providers
- `GET /api/v1/accounts?provider_id=X` - Get accounts for provider
- `POST /api/v1/accounts/import-cookies` - Import cookies to create/update account

## File Structure

```
chrome-extension/
├── manifest.json          # Extension manifest (v3)
├── background.js          # Service worker (backend communication)
├── content.js             # Content script (provider login detection)
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic
├── widget.js              # Floatable widget for PixSim7 frontend
├── widget.css             # Widget styles
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # This file
```

## Development

### Adding Support for New Providers

No changes needed in extension! Just add the provider to the backend:

1. **Add provider adapter** in `pixsim7_backend/services/provider/adapters/`
2. **Register provider** in `pixsim7_backend/services/provider/registry.py`
3. **Add domain mapping** in `pixsim7_backend/api/v1/providers.py`

The extension will automatically detect and support the new provider.

### Debugging

- **Background script logs**: `chrome://extensions/` → "Inspect views: service worker"
- **Popup logs**: Right-click popup → "Inspect"
- **Widget logs**: F12 on PixSim7 frontend → Console tab → Filter "[PixSim7 Widget]"

## Architecture Decisions

### Why Thin Client?

We chose a thin client architecture to:

1. **Avoid code duplication**: Provider detection logic exists only in backend
2. **Simplify updates**: New providers require only backend changes
3. **Centralize data**: All accounts stored in backend database
4. **Leverage backend**: Use existing backend services and authentication

### Provider Detection Flow

```
User visits provider site
        ↓
Extension captures URL
        ↓
Extension → Backend: POST /api/v1/providers/detect
        ↓
Backend checks URL against provider registry
        ↓
Backend → Extension: {provider_id, name, domains}
        ↓
Extension: GET /api/v1/accounts?provider_id=X
        ↓
Extension displays accounts
```

### Cookie Import Flow

```
User logs into provider site (e.g., pixverse.ai)
        ↓
Content script detects authentication (JWT in localStorage/cookies)
        ↓
Content script extracts all cookies + JWT token
        ↓
Content script → Background script: importCookies
        ↓
Background → Backend: POST /api/v1/accounts/import-cookies
        ↓
Backend parses JWT to extract email
        ↓
Backend creates/updates ProviderAccount with cookies
        ↓
Backend → Extension: {success, account_id, email, created}
        ↓
Extension shows notification: "Account created/updated"
        ↓
User can now use this account in PixSim7
```

## Security

- ✅ Authentication via JWT tokens (stored in extension storage)
- ✅ Cookies only injected with user action (click account button)
- ✅ Backend validates all requests
- ✅ No credentials stored in extension (only in backend database)

## Browser Compatibility

- ✅ Chrome 88+ (Manifest V3)
- ✅ Edge 88+ (Manifest V3)
- ⚠️ Firefox (Manifest V3 support limited, needs adaptation)

## License

Part of the PixSim7 project.
