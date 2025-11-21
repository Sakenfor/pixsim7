**Task: Chrome Extension End-to-End Validation & Flows**

> **For Agents (How to use this file)**
> - This task defines and validates key **end-to-end flows** for the Chrome extension:
>   - Image upload via context menu
>   - Quick generate from image via context menu
>   - Provider cookie login (loginWithAccount)
> - Use it when you:
>   - Touch `chrome-extension/` code.
>   - Change backend asset/cookie endpoints used by the extension.
> - Read these first:
>   - `chrome-extension/README.md` and `QUICK_START.md`
>   - `LOGGING_STRUCTURE.md` (for log ingestion related to uploads)
>   - `pixsim7/backend/main/api/v1/assets.py` – upload-from-url and related routes
>   - `pixsim7/backend/main/api/v1/accounts.py` – cookies/login endpoints

---

## Context

The Chrome extension now has several flows:

- **Image upload badge** (`image-badges.js`):
  - Uses `uploadMediaFromUrl` → `/api/v1/assets/upload-from-url`.
  - Interprets `UploadAssetResponse.note` to distinguish local-only vs provider-accepted uploads.
- **Context menu upload** (`background.js`):
  - Upload image or video via context menu to Pixverse/other providers.
  - Uses the same `uploadMediaFromUrl` handler.
- **Quick generate** (`background.js` + `showQuickGenerateDialog`):
  - Context menu → inject dialog → call `quickGenerate` → backend job.
  - Uses `chrome.scripting.executeScript` when available, with a tabs.executeScript fallback.
- **Provider cookie login**:
  - `loginWithAccount` fetches cookies from backend, injects them for provider domain, and opens the provider app.

Recent fixes improved:

- Provider status messaging (local vs provider OK).
- Quick generate injection robustness.

But there’s no single doc or script that goes through these flows step by step, and no validation checklist to catch regressions.

---

## Phase Checklist

- [ ] **Phase 37.1 – Document Supported Extension Flows**
- [ ] **Phase 37.2 – Manual Validation Checklist**
- [ ] **Phase 37.3 – Optional: Lightweight Test Harness Page**

---

## Phase 37.1 – Document Supported Extension Flows

**Goal**  
Create a single doc describing what the extension does and how it interacts with the backend.

**Scope**

- New doc: `docs/EXTENSION_FLOWS.md` (or similar)
- Existing extension docs:
  - `chrome-extension/README.md`
  - `chrome-extension/QUICK_START.md`

**Key Steps**

1. Add `docs/EXTENSION_FLOWS.md` with sections:
   - Image upload flow (badge + context menu).
   - Quick generate flow (context menu → dialog → job).
   - Cookie login flow (loginWithAccount).
2. For each flow, document:
   - What the user does (clicks).
   - Which background handlers fire.
   - Which backend endpoints are involved.
   - Expected user-visible result (asset in gallery, job created, provider logged in).
3. From `chrome-extension/README.md`, add a short “Flows” section linking to `EXTENSION_FLOWS.md`.

**Status:** `[ ]` Not started

---

## Phase 37.2 – Manual Validation Checklist

**Goal**  
Define a small, repeatable manual test checklist for extension flows that can be run after backend/extension changes.

**Scope**

- `docs/EXTENSION_FLOWS.md` (append a “Validation” section)

**Key Steps**

1. Define 2–3 “golden path” tests:
   - **Upload Image → PixSim7 Gallery:**
     - Right-click image → Upload to default provider.
     - Confirm asset appears in `/assets` with correct `provider_status` and provider.
   - **Quick Generate from Image:**
     - Right-click image → “⚡ Quick Generate Video”.
     - Fill prompt → confirm job is created (backend logs / Jobs view).
   - **Provider Cookie Login:**
     - Use cookie import to store provider cookies.
     - Use “loginWithAccount” flow from popup.
     - Confirm provider site opens with active session.
2. For each test, record:
   - Preconditions (backend running at X, user logged in).
   - Steps.
   - Expected outcome.
3. Add a short note encouraging running this checklist after:
   - Changing backend asset/cookie endpoints.
   - Changing extension permissions or host permissions.
   - Modifying `background.js` or `image-badges.js`.

**Status:** `[ ]` Not started

---

## Phase 37.3 – Optional: Lightweight Test Harness Page

**Goal**  
Provide a simple local page that makes exercising extension flows easier.

**Scope**

- `examples/` or a small route in `apps/main` used only for extension testing.

**Key Steps**

1. Add a simple static HTML page or a small React route that:
   - Displays a few sample images and short videos.
   - Clearly labels them for “Upload” and “Quick Generate” testing.
2. Link to this harness page from `EXTENSION_FLOWS.md`:
   - E.g., “For local testing, open `/examples/extension-test.html` in Chrome with the extension loaded.”
3. Optionally, add a tiny banner or tooltip in the harness page explaining:
   - Which context menu items to try.
   - What to expect in PixSim7 (assets, jobs).

**Status:** `[ ]` Not started

