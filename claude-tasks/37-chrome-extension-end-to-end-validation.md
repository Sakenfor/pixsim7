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

- [x] **Phase 37.1 – Document Supported Extension Flows** ✅ 2025-11-22
- [x] **Phase 37.2 – Manual Validation Checklist** ✅ 2025-11-22
- [x] **Phase 37.3 – Optional: Lightweight Test Harness Page** ✅ 2025-11-22

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
3. From `chrome-extension/README.md`, add a short "Flows" section linking to `EXTENSION_FLOWS.md`.

**Status:** `[x]` ✅ Complete (2025-11-22)

**Implementation:**
- Created `docs/EXTENSION_FLOWS.md` with comprehensive flow documentation:
  * Flow 1: Image/Video Upload - Context menu upload to PixSim7 gallery
  * Flow 2: Quick Generate from Image - Right-click dialog injection for video generation
  * Flow 3: Provider Cookie Login - Auto-login using stored credentials
- Each flow documents:
  * User actions and expected outcomes
  * Technical implementation details (extension code + backend endpoints)
  * Troubleshooting common issues
- Added "Flows Documentation" section to `chrome-extension/README.md` linking to EXTENSION_FLOWS.md
- Updated "Current Features" to reflect implemented flows (were incorrectly listed as TODOs)

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

**Status:** `[x]` ✅ Complete (2025-11-22)

**Implementation:**
- Added "Manual Validation Checklist" section to `docs/EXTENSION_FLOWS.md`
- Defined 3 golden path tests:
  * Test 1: Image Upload → PixSim7 Gallery
  * Test 2: Quick Generate from Image
  * Test 3: Provider Cookie Login
- Each test includes:
  * Prerequisites (backend running, extension loaded, user logged in)
  * Step-by-step instructions
  * Expected outcomes with checkmarks
  * Failure modes and troubleshooting
- Added "When to Run This Checklist" section specifying required/recommended times
- Documented future automation approaches (Selenium, Puppeteer, custom harness)

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

**Status:** `[x]` ✅ Complete (2025-11-22)

**Implementation:**
- Created `examples/extension-test.html` - Beautiful, self-contained test harness page
- Features:
  * Responsive grid layout with gradient background
  * Test 1 section: 4 sample images from Unsplash for upload testing
  * Test 2 section: 4 sample images from Unsplash for quick generate testing
  * Test 3 section: Links to provider sites (Pixverse, Runway, Pika) for cookie login testing
  * Color-coded badges: Blue for "Upload", Purple for "Quick Generate"
  * Step-by-step instructions with visual hierarchy
  * Visual feedback when right-clicking images (border color change)
  * Yellow banner with prerequisites checklist
  * Green instruction boxes with numbered steps
  * All images use Unsplash (no CORS issues)
- Linked from `docs/EXTENSION_FLOWS.md` with usage instructions
- Linked from `chrome-extension/README.md` in "Flows Documentation" section

