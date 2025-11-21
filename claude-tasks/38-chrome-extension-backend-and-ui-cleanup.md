**Task 38: Chrome Extension Backend Alignment & UI Cleanup**

> **For Agents (How to use this file)**
> - Use this when touching `chrome-extension/` in ways that affect:
>   - Backend connectivity and auth flows
>   - Accounts UI in the popup and in-page widget
> - Read these first:
>   - `chrome-extension/README.md`
>   - `chrome-extension/QUICK_START.md`
>   - `pixsim7/backend/main/api/v1/generations.py`
>   - `pixsim7/backend/main/api/v1/accounts.py`
>   - `pixsim7/backend/main/api/v1/assets.py`
>   - `claude-tasks/37-chrome-extension-end-to-end-validation.md`

---

## Context

Recent refactors unified job/generation handling in `pixsim7/backend/main` and deprecated the old `/api/v1/jobs` API in favor of `/api/v1/generations` plus `CreateGenerationRequest`. The Chrome extension still contains:

- A **Quick Generate** path that posts to `/api/v1/jobs`, which no longer exists.
- A **manual cookie import** path where the content script’s `manualImport` listener forgets to `await checkAuth()`, so imports silently fail.
- A partially applied **accounts UI compaction** for the popup:
  - CSS for `.sort-controls` and `.sort-btn` is present in `popup.html`.
  - A replacement `displayAccounts` with sorting lives in `popup_displayAccounts_FIXED.js` but isn’t wired into `popup.js`.
  - The helper file is left in the repo as dead code.
- The in-page widget (`widget.js`) has an “Open in Tab” button that still shows a “Coming soon!” stub instead of using the existing `loginWithAccount` flow implemented in the popup.

This task aligns the extension to the new backend entrypoints and cleans up the accounts UI and stray artifacts.

---

## Phase Checklist

- [X] **Phase 38.1 – Backend API alignment (Quick Generate & cookies)** ✅ Complete
- [X] **Phase 38.2 – Popup Accounts UI compaction & dead-code cleanup** ✅ Complete
- [X] **Phase 38.3 – Widget "Open in Tab" wiring (optional but recommended)** ✅ Complete
- [ ] **Phase 38.4 – Re-run Task 37 validation flows**

---

## Phase 38.1 – Backend API Alignment (Quick Generate & Cookies)

**Goal**  
Ensure the extension talks only to the new `pixsim7/backend/main` API surfaces and that cookie imports work reliably.

**Scope**

- `chrome-extension/background.js`
- `chrome-extension/content.js`

**Key Changes**

1. **Quick Generate → `/api/v1/generations`**
   - Locate the `quickGenerate` handler in `background.js`:
     - Currently:
       - Uploads image via `/api/v1/assets/upload-from-url` (correct).
       - Then POSTs to `POST {backendUrl}/api/v1/jobs` with `operation_type: 'image_to_video'`, etc. (legacy).
   - Replace the `/api/v1/jobs` call with a `POST /api/v1/generations` using the unified generation schema:
     - Use `operation_type = OperationType.IMAGE_TO_VIDEO`.
     - Set `provider_id` from the message (`providerId` or default upload provider).
     - Wrap prompt/image URL into `CreateGenerationRequest`:
       - `config.generation_type` (e.g., `"npc_response"` or `"variation"` per your conventions).
       - Place the image URL and prompt into `params` as a canonical `generation_config` and/or `scene_context`.
     - Include `Authorization: Bearer <pixsim7Token>` header.
   - Return the created generation to the caller (popup’s injected dialog) and keep the same success toast semantics (“Video generation started!”).

2. **Fix manual cookie import (`manualImport`)**
   - In `chrome-extension/content.js`, find the runtime message listener at the bottom:
     ```js
     chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
       if (message.action === 'manualImport') {
         const auth = checkAuth();
         if (auth) {
           importCookies(auth.providerId, auth.config)
             .then(() => sendResponse({ success: true }))
             .catch(error => sendResponse({ success: false, error: error.message }));
         } else {
           sendResponse({ success: false, error: 'Not logged into provider' });
         }
         return true;
       }
     });
     ```
   - `checkAuth()` is `async` and returns a Promise. Fix this by:
     - Making the handler body `async` (wrap in an IIFE or just use `async` callback) and `await checkAuth()`.
     - Guard against `null`/`undefined` auth.
   - After fix, manual cookie import from the popup’s “Import Cookies from This Site” button should reliably call `/api/v1/accounts/import-cookies`.

3. **Confirm host permissions and CORS**
   - Ensure `manifest.json` `host_permissions` cover the IP/ports you actually use for `pixsim7/backend/main` and the frontend (e.g., `http://localhost:8001/*`, ZeroTier IP).
   - Cross-check with `settings.cors_origins` in `pixsim7/backend/main/shared/config.py` so that browser requests to `/health` and other endpoints succeed.

**Status:** `[X]` ✅ Complete

**Implementation Details:**
- ✅ Quick Generate already using `/api/v1/generations` (background.js:353) - no changes needed
- ✅ Fixed manual cookie import in content.js:317-334 - now properly awaits `checkAuth()`
- ✅ Added try-catch error handling for async flow
- ✅ Host permissions verified in manifest.json (localhost:8001 + ZeroTier range)

---

## Phase 38.2 – Popup Accounts UI Compaction & Dead-Code Cleanup

**Goal**  
Make the Accounts tab compact and sortable, and remove leftover “helper” artifacts from previous unsuccessful edits.

**Scope**

- `chrome-extension/popup.js`
- `chrome-extension/popup.html`
- `chrome-extension/popup_displayAccounts_FIXED.js` (to be removed after merge)

**Key Changes**

1. **Replace `displayAccounts` in `popup.js`**
   - Existing `displayAccounts` currently:
     - Sets `accountCount`.
     - Renders a simple list of `createAccountCard` cards with no sort controls.
   - `popup_displayAccounts_FIXED.js` contains a richer `displayAccounts` that:
     - Renders a `.sort-controls` toolbar.
     - Uses `accountsSortBy` and `accountsSortDesc` (already defined at top of `popup.js`) to sort by:
       - `name` (nickname/email),
       - `credits` (`total_credits`),
       - `lastUsed` (`last_used`),
       - `success` (`success_rate`).
   - Action:
     - Take the `displayAccounts(accounts)` implementation from `popup_displayAccounts_FIXED.js`.
     - Paste it over the existing `displayAccounts` function in `popup.js`.
     - Replace any mojibake arrow glyphs (`ƒ+"`, etc.) in the labels with simple `'↑'` and `'↓'` or clean text (e.g. “(asc)/(desc)”).

2. **Keep CSS, use it properly**
   - `popup.html` already defines:
     - `.sort-controls`, `.sort-btn`, `.sort-btn.active` styles around lines `195–225`.
   - After wiring the new `displayAccounts`, those styles will be used by the runtime-generated toolbar.

3. **Delete `popup_displayAccounts_FIXED.js`**
   - Once you confirm `displayAccounts` is working from `popup.js`, remove `chrome-extension/popup_displayAccounts_FIXED.js` from the codebase.
   - This avoids confusing future agents with instructions like “REPLACE the displayAccounts function” in a stray file.

4. **Optional UI polish (mojibake cleanup)**
   - Several strings in `popup.js` and `popup.html` include mojibake-like glyphs (e.g., `Г`, `ƒ`, `dY` artifacts from a previous copy/paste).
   - Do a quick pass on visible labels:
     - Button texts (Login, Logout, Import Cookies, Quick Generate labels, etc.).
     - Section titles and status banners.
   - Replace with plain English (no emoji required) while keeping semantics identical.
   - Keep layout and CSS intact; this is a wording/encoding fix, not a redesign.

**Status:** `[X]` ✅ Complete

**Implementation Details:**
- ✅ Replaced `displayAccounts` function in popup.js:368-445
- ✅ Added sort controls with 4 sorting options: Last Used, Name, Credits, Success Rate
- ✅ Added ascending/descending toggle with arrow indicators (↑/↓)
- ✅ Accounts now properly cleared and sorted before display
- ✅ Deleted dead code file: `popup_displayAccounts_FIXED.js`
- ⚠️ Mojibake cleanup deferred - arrows use clean Unicode instead

---

## Phase 38.3 – Widget “Open in Tab” Wiring (Optional but Recommended)

**Goal**  
Make the floating widget’s “Open in Tab” button reuse the same `loginWithAccount` flow the popup already uses, improving parity and reducing duplicated logic.

**Scope**

- `chrome-extension/widget.js`

**Key Changes**

1. **Implement `openAccountInTab` via `loginWithAccount`**
   - In `widget.js`, `openAccountInTab(accountId, settings)` currently:
     - Changes the button text to “Opening…”.
     - Shows a temporary “Coming soon!” message.
     - Does not actually open a provider tab.
   - Replace the placeholder with:
     - A `chrome.runtime.sendMessage({ action: 'loginWithAccount', accountId })` call.
     - Behavior similar to `handleAccountLogin` in `popup.js`:
       - On success: let the background script open the tab; reset button state.
       - On error: show an `alert` or inline error and reset the button text.
   - This reuses the `/api/v1/accounts/{account_id}/cookies` + cookie injection logic from `background.js`.

2. **Error handling and UX**
   - If there's no `pixsim7Token` (user not logged in in extension), keep the existing "Please login in popup" messaging (handled earlier in the widget load path).
   - Don't attempt to mirror all the toast styling from the popup; a simple `alert` or minimal inline message is acceptable in the widget.

**Status:** `[X]` ✅ Complete

**Implementation Details:**
- ✅ Replaced stub implementation in widget.js:352-382
- ✅ Now uses `chrome.runtime.sendMessage` with action: 'loginWithAccount'
- ✅ Reuses background.js cookie injection and tab opening logic
- ✅ Shows "Opening..." state during processing
- ✅ Shows "✓ Opened" on success for 2 seconds
- ✅ Alert on error with clear error message
- ✅ Properly resets button state after success/failure

---

## Phase 38.4 – Re-run Task 37 Validation Flows

**Goal**  
Use the existing extension validation checklist to ensure no regressions after backend alignment and UI changes.

**Scope**

- `claude-tasks/37-chrome-extension-end-to-end-validation.md`

**Key Steps**

1. After implementing Phases 38.1–38.3, follow the validation flows from Task 37:
   - **Image upload via context menu** → `/api/v1/assets/upload-from-url`
   - **Quick Generate from image** → `/api/v1/assets/upload-from-url` + `/api/v1/generations`
   - **Provider cookie login via extension** → `/api/v1/accounts/import-cookies` + `/accounts/{id}/cookies` + `loginWithAccount`
2. Confirm:
   - Quick Generate no longer tries to call `/api/v1/jobs` and successfully creates a generation.
   - Manual cookie import from the popup succeeds on a provider page when logged in.
   - Accounts tab shows compact, sortable cards.
   - Widget “Open in Tab” works for accounts that have cookies/JWT.

**Status:** `[ ]` Not started

---

