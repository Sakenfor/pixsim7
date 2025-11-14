# PixSim7 Chrome Extension - Quick Start

## What's Included

The PixSim7 Chrome Extension provides:

1. **Provider Account Management** - Store cookies and API keys for video generation providers
2. **Image Upload Badges** - Quick upload buttons on images across the web
3. **Context Menu Integration** - Right-click images to generate videos

## Installation

### 1. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder

### 2. Configure Backend URL

1. Click the extension icon in Chrome toolbar
2. Go to **Settings** tab
3. Enter your PixSim7 backend URL (e.g., `http://10.243.48.125:8001`)
4. Click **Save Settings**

### 3. Login

1. Go to **Info** tab
2. Click **Login**
3. Enter your PixSim7 credentials
4. You should see your username displayed

## Features

### Provider Account Management

**Add Provider Account:**
1. Go to **Accounts** tab
2. Click **+ Add Provider Account**
3. Select provider (Pixverse, Runway, Pika, Sora)
4. Fill in details (nickname, email, API keys)
5. Click **Save**

**Inject Cookies:**
1. Navigate to the provider website (e.g., pixverse.ai)
2. Open extension → **Accounts** tab
3. Click **Inject** on the account you want to use
4. Page will reload with account cookies loaded

### Image Upload Badges

When browsing websites with images:
- Small **🎬** badges appear on images
- Click badge to upload image to selected provider
- Provider opens in new tab with image pre-loaded

**Configure:**
- Settings tab → Default Upload Provider

### Device Management

Device management is handled via standalone Python service running on each device connected via ZeroTier. See the Devices tab in the extension for setup instructions.

## Usage Tips

### Multi-Account Management

- Add multiple accounts per provider
- Switch between accounts with one click
- Each account can have different API keys
- Useful for paid/free tier separation

### Context Menu Integration

1. Right-click any image on web
2. Select **PixSim7 → Generate Video**
3. Choose provider
4. Image uploads to selected provider

### Developer Tools

Open extension console for debugging:
1. Right-click extension icon
2. Select **Inspect popup**
3. Check Console for logs

Look for:
- `[Auth]` - Login/logout events
- `[Accounts]` - Account operations
- `[Upload]` - Image upload status

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Chrome Extension                        │
├──────────────────────────────────────────────────────────┤
│  popup.html/js    │  Background     │  Content Scripts   │
│  - UI & Controls  │  - API Calls    │  - Image Badges    │
│  - Account Mgmt   │  - Cookie Mgmt  │  - Widget Inject   │
│                   │  - Context Menu │  - Provider Detect │
└───────────────────┴─────────────────┴────────────────────┘
                            │                    │
                            │ HTTP API           │ Page DOM
                            │                    │
                            ▼                    ▼
                     ┌──────────┐        ┌──────────┐
                     │ PixSim7  │        │ Provider │
                     │  Backend │◀───────│ Websites │
                     │   API    │        │          │
                     └──────────┘        └──────────┘
```

## Files Overview

```
chrome-extension/
├── manifest.json              # Extension configuration
├── popup.html                 # Extension popup UI
├── popup.js                   # Popup logic & API calls
├── background.js              # Background service worker
├── content.js                 # Content script (provider detection)
├── widget.js                  # PixSim7 frontend widget
├── image-badges.js            # Image upload badges
├── injected-bearer-capture.js # Bearer token capture for Sora
│
├── icons/                     # Extension icons
├── README.md                  # Extension overview
└── SORA_SUPPORT.md           # Sora integration details
```

## Troubleshooting

### Extension Not Loading

- Check Chrome version (need Manifest V3 support)
- Look for errors in `chrome://extensions/`
- Try reloading extension

### Backend Connection Failed

- Verify backend URL in Settings
- Check backend is running: `http://your-backend:8001/docs`
- Check firewall allows connection
- Try from same machine: `http://localhost:8001`

### Login Failed

- Check username/password
- Verify backend is reachable
- Check browser console for errors
- Try creating account via web UI first

### Cookies Not Injecting

- Make sure you're on the correct provider website
- Check account has valid cookies
- Try refreshing the provider page
- Check browser console for errors

## Development

### Reload Extension

After making changes:
1. Go to `chrome://extensions/`
2. Find PixSim7 Extension
3. Click reload button (circular arrow)

### Debug Background Script

```javascript
// In chrome://extensions/ → PixSim7 Extension → Service Worker
console.log('Background script loaded');
```

### Debug Content Script

```javascript
// Right-click page → Inspect
// Check for content script logs in Console
```

## API Reference

### Backend Endpoints Used

- `POST /api/v1/auth/login` - User login
- `GET /api/v1/auth/verify` - Verify token
- `GET /api/v1/accounts` - List provider accounts
- `POST /api/v1/accounts` - Create account
- `PATCH /api/v1/accounts/{id}` - Update account
- `DELETE /api/v1/accounts/{id}` - Delete account

### Storage Schema

```javascript
// chrome.storage.sync
{
  backendUrl: "http://10.243.48.125:8001",
  defaultUploadProvider: "pixverse"
}

// chrome.storage.local
{
  user: {
    username: "admin",
    token: "eyJ0eXAiOiJKV1QiLCJhbGc...",
    user_id: 1
  }
}
```

## Support

- **Documentation**: See individual README files in subdirectories
- **Backend Issues**: Check `pixsim7_backend/` logs
- **Extension Issues**: Check Chrome DevTools console

## Changelog

### v1.0.0 (Current)

- ✅ Provider account management
- ✅ Cookie injection
- ✅ Image upload badges
- ✅ Context menu integration
- ✅ Multi-provider support (Pixverse, Runway, Pika, Sora)
- ✅ Auto-detection of provider pages
