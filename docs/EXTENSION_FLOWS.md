# Chrome Extension End-to-End Flows

This document describes the key user flows supported by the PixSim7 Chrome extension and how they interact with the backend.

---

## 🎯 Overview

The Chrome extension provides three primary flows:

1. **Image/Video Upload** - Upload media from any webpage to PixSim7
2. **Quick Generate** - Generate videos from images with a single right-click
3. **Provider Cookie Login** - Auto-login to provider sites using stored credentials

All flows rely on the PixSim7 backend API and require the user to be logged in.

---

## Flow 1: Image/Video Upload

### What It Does

Allows users to right-click any image or video on any webpage and upload it directly to their PixSim7 asset library.

### User Actions

1. **Right-click** on an image or video element
2. Select **"📤 Upload to PixSim7"** from context menu
3. Extension extracts media URL and sends to backend
4. Asset appears in PixSim7 gallery (`/assets`)

### Technical Flow

**Extension Code:**
- `chrome-extension/background.js` - Context menu handler
- `chrome-extension/utils.js` - `uploadMediaFromUrl()` function

**Backend Endpoints:**
- `POST /api/v1/assets/upload-from-url`
  - Input: `{ url: string, provider_id?: string }`
  - Output: `UploadAssetResponse` with asset details

**Implementation:**
1. Context menu click triggers `uploadMediaFromUrl(imageUrl)`
2. Extension calls `POST /api/v1/assets/upload-from-url` with:
   - Image/video URL from page
   - User's auth token
   - Optional provider_id (default provider from settings)
3. Backend downloads media and creates Asset record
4. Backend returns `UploadAssetResponse`:
   - `asset` - Created asset with ID, provider status, etc.
   - `note` - Message distinguishing:
     - **"Asset uploaded (local only)"** - Saved to PixSim7 but not accepted by provider
     - **"Asset uploaded and accepted by [Provider]"** - Provider accepted the asset

**Expected Results:**
- ✅ Asset appears in `/assets` with correct thumbnail
- ✅ `provider_status` field shows:
  - `"local_only"` - Not sent to provider
  - `"pending"` - Sent to provider, awaiting confirmation
  - `"accepted"` - Provider accepted the asset
- ✅ Toast notification shows upload success

---

## Flow 2: Quick Generate from Image

### What It Does

Allows users to right-click any image and immediately generate a video from it using PixSim7's generation system.

### User Actions

1. **Right-click** on an image element
2. Select **"⚡ Quick Generate Video"** from context menu
3. **Dialog appears** on the page with:
   - Image preview
   - Prompt input field
   - Provider selection dropdown
   - Generate button
4. **Enter prompt** and click **"Generate"**
5. Job is created and appears in PixSim7 jobs view

### Technical Flow

**Extension Code:**
- `chrome-extension/background.js` - Context menu handler + dialog injection
- `chrome-extension/utils.js` - `quickGenerate()` function
- `chrome-extension/quick-generate-dialog.js` - Injected dialog UI

**Backend Endpoints:**
- `POST /api/v1/generation/quick-generate`
  - Input: `{ image_url: string, prompt: string, provider_id: string }`
  - Output: `{ job_id: number, message: string }`

**Implementation:**
1. Context menu click triggers dialog injection
2. Extension uses `chrome.scripting.executeScript` (with fallback to `tabs.executeScript`) to inject:
   - `quick-generate-dialog.js` - Dialog HTML/CSS/logic
   - Image URL passed as parameter
3. User fills prompt and selects provider in dialog
4. Dialog calls `quickGenerate(imageUrl, prompt, providerId)`
5. Extension calls `POST /api/v1/generation/quick-generate`
6. Backend:
   - Uploads image to provider
   - Creates generation job
   - Returns job ID
7. Dialog shows success message with job link

**Expected Results:**
- ✅ Dialog appears overlay on current page
- ✅ Image preview loads correctly
- ✅ Provider dropdown shows available providers
- ✅ Generation job created in backend
- ✅ Job appears in `/jobs` or Jobs panel
- ✅ Dialog auto-closes after 3 seconds

**Edge Cases:**
- If `chrome.scripting` not available (older Chrome), falls back to `tabs.executeScript`
- If image URL is cross-origin, backend handles CORS/download

---

## Flow 3: Provider Cookie Login

### What It Does

Allows users to auto-login to provider websites (Pixverse, Runway, Pika, etc.) using credentials stored in PixSim7.

### User Actions

1. **Click extension icon** to open popup
2. Navigate to **Accounts tab**
3. If on a provider page (e.g., `app.pixverse.ai`), accounts for that provider are shown
4. **Click an account card** to login
5. Extension:
   - Fetches cookies from backend
   - Injects cookies for provider domain
   - Opens provider website in new tab
6. User is logged in automatically

### Technical Flow

**Extension Code:**
- `chrome-extension/popup/Accounts.tsx` - Account list UI
- `chrome-extension/popup/utils.ts` - `loginWithAccount()` function
- `chrome-extension/background.js` - Cookie injection handler

**Backend Endpoints:**
- `GET /api/v1/accounts/{account_id}/cookies`
  - Output: `{ cookies: Array<{ name, value, domain, path }> }`

**Implementation:**
1. User clicks account in Accounts tab
2. `loginWithAccount(accountId)` is called
3. Extension sends message to background script: `{ action: 'loginWithAccount', accountId }`
4. Background script:
   - Calls `GET /api/v1/accounts/{account_id}/cookies` to fetch stored cookies
   - Uses `chrome.cookies.set()` to inject each cookie for provider domain
   - Opens provider URL in new tab: `chrome.tabs.create({ url: providerUrl })`
5. Provider site loads with injected cookies
6. User is automatically logged in

**Expected Results:**
- ✅ New tab opens to provider website
- ✅ User is logged in (no login form shown)
- ✅ Provider account balance/credits visible
- ✅ User can immediately start generating

**Edge Cases:**
- If cookies are expired, user may see login form (cookies need refresh)
- If provider changed cookie structure, login may fail (need cookie update)

---

## Backend API Summary

| Flow | Endpoint | Method | Input | Output |
|------|----------|--------|-------|--------|
| Upload | `/api/v1/assets/upload-from-url` | POST | `{ url, provider_id? }` | `UploadAssetResponse` |
| Quick Generate | `/api/v1/generation/quick-generate` | POST | `{ image_url, prompt, provider_id }` | `{ job_id, message }` |
| Cookie Login | `/api/v1/accounts/{id}/cookies` | GET | - | `{ cookies: [...] }` |

All endpoints require authentication via bearer token in the `Authorization` header.

---

## Extension Permissions Required

The extension requires these permissions to support the flows:

- `contextMenus` - Right-click menu items
- `cookies` - Cookie injection for provider login
- `tabs` - Open new tabs, inject scripts
- `scripting` - Inject quick generate dialog (Chrome 88+)
- `activeTab` - Access current tab URL for provider detection
- `storage` - Store extension settings (backend URL, auth token)

**Host Permissions:**
- `<all_urls>` - Required to:
  - Upload images from any website
  - Inject quick generate dialog on any page
  - Set cookies for provider domains

---

## Logging & Debugging

### Extension Logs

Open Chrome DevTools → Console when extension popup is open:
- Login success/failure
- Upload progress
- Quick generate job creation
- Cookie injection results

### Backend Logs

Backend logs for extension requests go to the centralized logging system:
- Service: `asset` (for uploads)
- Service: `generation` (for quick generate)
- Service: `account` (for cookie fetches)

Query logs in PixSim7 logs panel by:
- `request_id` - Correlate frontend and backend logs
- `user_id` - Filter by user
- `operation_type` - Filter by `upload`, `generation`, etc.

---

## Common Issues & Troubleshooting

### Upload Fails with "Failed to upload"

**Possible causes:**
1. Image URL is not publicly accessible
2. Image requires authentication (cookies)
3. Backend cannot download from URL (CORS, firewall)

**Solution:**
- Check browser console for error details
- Verify image URL is accessible in incognito tab
- Check backend logs for download errors

### Quick Generate Dialog Doesn't Appear

**Possible causes:**
1. Page has Content Security Policy blocking script injection
2. Chrome version < 88 and fallback failed
3. Extension doesn't have `scripting` or `tabs` permission

**Solution:**
- Check extension permissions in `chrome://extensions/`
- Try on a different website (some sites block injections)
- Update Chrome to latest version

### Cookie Login Opens Provider but Not Logged In

**Possible causes:**
1. Cookies expired
2. Provider changed authentication method
3. Cookies not set for correct domain/path

**Solution:**
- Re-import cookies from provider site (Manual Import)
- Check Account tab shows recent `last_cookie_import` timestamp
- Verify provider domain hasn't changed

---

---

## 🧪 Manual Validation Checklist

Run this checklist after making changes to:
- Backend asset/cookie/generation endpoints
- Extension permissions or host permissions
- `chrome-extension/background.js` or `chrome-extension/image-badges.js`
- Context menu handlers or dialog injection code

### Prerequisites

Before running tests:
- ✅ PixSim7 backend running (check `http://localhost:8001/health` or configured URL)
- ✅ Chrome extension loaded in developer mode
- ✅ User logged into PixSim7 via extension popup
- ✅ At least one provider account configured (for cookie login test)

### Test 1: Image Upload → PixSim7 Gallery

**Goal:** Verify images can be uploaded from any webpage and appear in PixSim7 assets.

**Steps:**
1. Navigate to any website with images (e.g., https://unsplash.com)
2. Right-click on an image
3. Select "📤 Upload to PixSim7" from context menu
4. Wait for upload notification

**Expected Outcome:**
- ✅ Notification appears: "Uploading image..." → "Upload successful!"
- ✅ Open PixSim7 at `/assets` - new asset appears with:
  - Correct thumbnail
  - Provider status (`local_only`, `pending`, or `accepted`)
  - Original URL stored in metadata
- ✅ Asset metadata shows upload timestamp

**Failure Modes:**
- ❌ No notification → Check browser console, extension may not have permission
- ❌ Upload fails → Check backend logs for download errors (CORS, auth issues)
- ❌ Asset not in gallery → Check `/api/v1/assets` endpoint response

---

### Test 2: Quick Generate from Image

**Goal:** Verify right-click quick generate creates a generation job.

**Steps:**
1. Navigate to any website with images (e.g., https://unsplash.com)
2. Right-click on an image
3. Select "⚡ Quick Generate Video" from context menu
4. Wait for dialog to appear on page
5. Enter prompt: "A cinematic video of this scene"
6. Select provider from dropdown (e.g., "Pixverse")
7. Click "Generate" button
8. Wait for success message

**Expected Outcome:**
- ✅ Dialog appears overlay with:
  - Image preview showing selected image
  - Prompt input field
  - Provider dropdown populated with available providers
  - "Generate" button enabled
- ✅ After clicking Generate:
  - Success message: "Generation job created! Job ID: {id}"
  - Dialog auto-closes after 3 seconds
- ✅ Open PixSim7 at `/jobs` or Jobs panel - new job appears with:
  - Status: `pending` or `processing`
  - Input image visible
  - Prompt matches entered text
  - Provider matches selection

**Failure Modes:**
- ❌ Dialog doesn't appear → Check console for CSP errors, try different website
- ❌ Image preview blank → Check image URL is accessible (try in new tab)
- ❌ Generate fails → Check backend logs for provider errors
- ❌ Job not created → Check `/api/v1/generation/quick-generate` endpoint

---

### Test 3: Provider Cookie Login

**Goal:** Verify users can auto-login to provider sites using stored cookies.

**Steps:**
1. Ensure you have at least one provider account with imported cookies:
   - Navigate to provider site (e.g., https://app.pixverse.ai)
   - Log in manually
   - Click extension icon → Settings tab
   - Ensure "Auto-import cookies" is enabled
   - Wait for import notification
2. **Open extension popup**
3. Click **Accounts tab**
4. Verify provider accounts appear (should show provider name, email, credits)
5. Click on an account card
6. Wait for new tab to open

**Expected Outcome:**
- ✅ New tab opens to provider website
- ✅ User is automatically logged in (no login form shown)
- ✅ Provider dashboard/home page loads
- ✅ Account balance/credits visible in provider UI
- ✅ Can navigate provider site without re-authentication

**Failure Modes:**
- ❌ Login form appears → Cookies may be expired, re-import cookies
- ❌ New tab doesn't open → Check browser console for errors
- ❌ Wrong account shown → Cookie domain mismatch, check account configuration
- ❌ Provider shows error → Cookies invalid or provider changed auth method

---

### When to Run This Checklist

**Required:**
- Before merging changes to `chrome-extension/` code
- After updating backend `/api/v1/assets/upload-from-url` endpoint
- After updating backend `/api/v1/generation/quick-generate` endpoint
- After updating backend `/api/v1/accounts/{id}/cookies` endpoint

**Recommended:**
- After changing extension manifest permissions
- After modifying provider detection logic
- Before releasing a new extension version
- When adding support for a new provider

---

### Automated Testing (Future)

Currently, these flows require manual testing due to Chrome extension API limitations. Potential automation approaches:

- **Selenium WebDriver:** Can load unpacked extensions and simulate clicks, but dialog injection hard to test
- **Puppeteer:** Limited extension support, mainly for popup testing
- **Custom test harness:** Use `examples/extension-test.html` for simplified manual testing (see below)

### 🧪 Test Harness Page

For easier manual testing, open `examples/extension-test.html` in your browser:

```bash
# From project root
open examples/extension-test.html
# Or navigate to: file:///path/to/pixsim7/examples/extension-test.html
```

**The test harness provides:**
- ✅ Sample images labeled for upload testing
- ✅ Sample images labeled for quick generate testing
- ✅ Step-by-step instructions for each flow
- ✅ Links to provider sites for cookie login testing
- ✅ Visual feedback when right-clicking images
- ✅ Pre-configured with Unsplash images (no CORS issues)

---

## See Also

- `chrome-extension/README.md` - Installation and setup
- `chrome-extension/QUICK_START.md` - Quick start guide
- `LOGGING_STRUCTURE.md` - Backend logging conventions
- `pixsim7/backend/main/api/v1/assets.py` - Asset upload endpoints
- `pixsim7/backend/main/api/v1/accounts.py` - Account/cookie endpoints
- `pixsim7/backend/main/api/v1/generation.py` - Generation endpoints
