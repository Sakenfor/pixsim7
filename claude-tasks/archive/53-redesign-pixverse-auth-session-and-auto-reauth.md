**Task: Redesign Pixverse Auth / Session Management and Auto-Reauth Flows**

## Context

The Pixverse provider integration has evolved organically and now includes:

- Multiple auth entry points:
  - `/api/v1/accounts/import-cookies` – cookie/JWT import from extension
  - `/api/v1/accounts/{id}/reauth` – password/global-password based auto-reauth
  - `/api/v1/accounts/{id}/connect-google` – now used to flag Google-based accounts
- A complex Pixverse provider adapter:
  - `PixverseProvider._build_web_session()`
  - `PixverseProvider._get_cached_api()` and `_client_cache`
  - `PixverseProvider._try_auto_reauth()`
  - `PixverseProvider.get_credits()` (credits + ad-task)
  - `PixverseProvider._get_ad_task_status()`
- Workers that depend on the current account session:
  - `job_processor.py` for submitting jobs
  - `status_poller.py` for polling status and creating assets

Recent fixes have made behavior more correct but also more tangled:

- Credits and ad-task now share `_build_web_session()` (good).
- Error code `10003` (“user is not login”) is treated as session-invalid in `get_credits()` and `_get_ad_task_status()`.
- Auto-reauth is disabled for accounts with `provider_metadata.auth_method == 'google'`.
- `/connect-google` currently just sets `auth_method='google'` and does **not** try to talk to Pixverse with a Google ID token.

The result: logic is correct-ish but hard to reason about; auto-reauth, caching, and auth entry points are tangled.

## Files in Scope

- `pixsim7/backend/main/services/provider/adapters/pixverse.py`
- `pixsim7/backend/main/api/v1/accounts.py`
  - `/accounts/import-cookies`
  - `/accounts/{id}/reauth`
  - `/accounts/{id}/connect-google`
- `pixsim7/backend/main/services/provider/pixverse_auth_service.py`
- `pixsim7/backend/main/services/account/account_service.py` (if needed for auth flags)
- `pixsim7/backend/main/workers/job_processor.py`
- `pixsim7/backend/main/workers/status_poller.py`
- `pixsim7/backend/main/domain/account.py` (`ProviderAccount` and `provider_metadata`)

Related but likely not to be heavily modified (read-only, but keep behavior in mind):

- `pixsim7/backend/main/infrastructure/events/bus.py` (JOB_* events)
- `pixsim7/backend/main/domain/asset.py` / `asset_service.py` / `asset_factory.py` (downstream from generations)

## Current Behavior (High-Level)

**Provider account state (`ProviderAccount`):**

- `jwt_token` – primary web/session token (Pixverse WebAPI).
- `cookies` – dict of cookies (includes `_ai_token`, etc.).
- `api_keys` – list of keys, including kind `'openapi'` for OpenAPI credits.
- `provider_metadata` – includes raw `getUserInfo` response and is now used to store `auth_method`:
  - `auth_method="google"` → Google-based Pixverse account (cookie-only, no password).
  - `auth_method` absent or other → default/password-based behavior.

**Session building (`PixverseProvider._build_web_session`):**

- Chooses JWT token:
  - Starts from `account.jwt_token`.
  - If `needs_refresh(jwt_token)` and cookies exist, tries `extract_jwt_from_cookies` to get a fresher token.
  - If it finds a better token, updates `account.jwt_token` in memory.
- Returns `session` dict:
  - `{ "jwt_token", "cookies", "openapi_key?" }`.

**Credits (`get_credits`) + ad-task (`_get_ad_task_status`):**

- Both now call `_build_web_session(account)`:
  - `get_credits` uses `PixverseAPI` (`_get_cached_api`) with that session.
  - `_get_ad_task_status` uses raw `httpx` with cookies and `Authorization: Bearer jwt_token`.
- Both treat certain errors as session-invalid:
  - `get_credits` uses `_is_session_invalid_error` on exceptions from SDK calls:
    - Matches `"logged in elsewhere"`, `"session expired"`, `"error 10005"`, `"error 10003"`, `"user is not login"`.
    - On match: sets `session_invalid = True`, evicts caches, and attempts `_try_auto_reauth(account)` once.
  - `_get_ad_task_status` inspects JSON `ErrCode`:
    - If `ErrCode in (10003, 10005)`: logs, evicts caches.
    - Does **not** call `_try_auto_reauth` directly.

**Auto-reauth (`_try_auto_reauth` in `pixverse.py`):**

- Checks `provider_metadata.auth_method`:
  - If `"google"` → logs “Auto-reauth skipped for Google-based account” and returns `False`.
  - Otherwise:
    - Looks up provider settings (`_load_provider_settings`) for `auto_reauth_enabled` and `global_password`.
    - Uses `PixverseAuthService.login_with_password(...)` (WebAPI-first, Playwright fallback) with either:
      - `account.password`, or
      - provider-level `global_password`.
    - On success:
      - Extracts new session data via `provider.extract_account_data(...)` (Pixverse adapter).
      - Updates `account.jwt_token` and `account.cookies`.
      - Evicts caches.

**Cookie import (`/accounts/import-cookies`):**

- Gets `request.raw_data` from extension (cookies + localStorage).
- `PixverseProvider.extract_account_data(raw_data)`:
  - Extracts JWT from `_ai_token` or `jwt_token` field.
  - Calls Pixverse `getUserInfo` via pixverse-py where possible.
  - Returns `email`, `jwt_token`, `cookies`, `username`, `nickname`, `account_id`, `provider_metadata`.
- Endpoint:
  - Creates or updates `ProviderAccount` (email, jwt_token, cookies, nickname, provider_user_id, provider_metadata).
  - Optionally sets credits from `extracted['credits']`.

**Reauth (`/accounts/{id}/reauth`):**

- Uses `PixverseAuthService.login_with_password(...)` with:
  - `request.password` if provided, else `account.password`, else provider-level `global_password`.
- On success: uses `provider.extract_account_data(session_data)` and `_apply_extracted_account_data` to update account (email, jwt_token, cookies, nickname, provider_metadata, credits).

**Connect via Google (`/accounts/{id}/connect-google`):**

- **Current behavior (post-fix):** no longer calls Pixverse with ID token; now only:
  - Validates account ownership and `provider_id == "pixverse"`.
  - Sets `provider_metadata.auth_method = "google"` and commits.
  - Returns `AccountReauthResponse` with updated account.

**Workers:**

- `job_processor.py`:
  - Selects an account via `AccountService.select_account(...)` (not auth-specific but depends on `jwt_token`, `cookies` being valid).
  - Uses `ProviderService.execute_job(...)` to submit to provider.

- `status_poller.py`:
  - For each PROCESSING `Generation`, fetches `ProviderSubmission` and `ProviderAccount`.
  - Calls `ProviderService.check_status(submission, account)`.
  - On `VideoStatus.COMPLETED`, uses `AssetService.create_from_submission(...)` to create a video asset and marks generation completed.
  - Assumes `account.jwt_token` / `cookies` are valid; if not, provider errors bubble up.

## Problems / Pain Points

1. **Auth entry points and flows are scattered:**
   - Cookie import, password reauth, and Google connect all update account state, but without a single central “session manager” or “auth method” contract.

2. **Auto-reauth decision logic is implicit and duplicated:**
   - `_is_session_invalid_error` + ad-task `ErrCode` checks are split.
   - Only `get_credits()` knows how to run `_try_auto_reauth`.
   - `_get_ad_task_status` just evicts cache; does not reauth itself.

3. **Auth method is only partially modeled:**
   - `auth_method="google"` lives in `provider_metadata`, but nothing else distinguishes:
     - Cookie-only (Google) vs password/global-password vs pure API-key accounts.
   - There’s no explicit “this account can safely use password-based auto-reauth” vs “cookie-only; never try password.”

4. **Caching and session invalidation are subtle:**
   - `_get_cached_api` keys off `(account.id, jwt_prefix)` but session invalidation logic is split between credits/ad-task and error handlers.
   - Eviction is done in multiple places (`_evict_account_cache`) in response to different error patterns.

5. **Logs are noisy and not fully structured around auth flows:**
   - It’s difficult to trace “this account had its session invalidated, attempted auto-reauth, and succeeded/failed” end-to-end for a given `account_id`.

## Goals

Design and implement a more coherent Pixverse auth/session management model that:

1. **Centralizes session building + invalidation:**
   - A clearly defined `SessionManager`-like helper within `PixverseProvider` that owns:
     - Building a session from `ProviderAccount` (`jwt_token`, `cookies`, `api_keys`).
     - Recognizing which errors mean “session bad” vs “job failed”.
     - Invalidation of cached `PixverseAPI` / client instances.

2. **Makes auth method explicit and respected:**
   - Clearly model `auth_method` for Pixverse accounts:
     - `"password"` / default (global-password / account-password reauth allowed).
     - `"google"` (cookie-only; password-based reauth should be skipped).
     - Possibly `"api_key_only"` or similar if needed.
   - Ensure auto-reauth only runs for accounts where it is valid and safe.

3. **Unifies error handling and reauth triggers:**
   - Provide a single “should attempt auto-reauth?” decision path that looks at:
     - `PixverseAPI` exceptions.
     - Ad-task `ErrCode`s.
   - Have a consistent place where auto-reauth is triggered (or explicitly not).

4. **Keeps external behavior stable:**
   - No changes to public API shapes:
     - `/assets/upload-from-url`, `/generations/*`, `/accounts/import-cookies`, `/accounts/{id}/reauth`, `/accounts/{id}/connect-google`, `/accounts/{id}/pixverse-status`.
   - No database schema changes.
   - No breaking changes to worker contracts (`job_processor`, `status_poller`), aside from better behavior on invalid sessions.

5. **Improves observability:**
   - Add structured logging (via `pixsim_logging` / `structlog`) around:
     - Session build decisions (which JWT was chosen, any fallback to cookies).
     - Session invalidation events (what error code / message triggered invalidation).
     - Auto-reauth attempts (auth_method, success/failure, reason).

## Desired Design (High-Level)

You don’t need to match this exactly, but this is the shape we’re aiming for.

1. **Explicit auth method modeling**

- Introduce a simple enum-like convention for Pixverse accounts (no schema change; live inside `provider_metadata`):

  ```json
  {
    "auth_method": "password" | "google" | "unknown"
  }
  ```

- Rules:
  - Default to `"password"` for accounts updated via `/reauth` or having a password/global password.
  - Explicitly set `"google"` via `/connect-google` or a future “Detect from cookies” heuristic (if safe).
  - `"unknown"`: accounts created via cookie import only; treat cautiously.

2. **Session manager inside PixverseProvider**

Refactor the auth/session pieces in `pixverse.py` into a cohesive block, for example:

- `_build_web_session(account: ProviderAccount) -> SessionData` (already exists; may be enhanced).
- `_handle_session_error(e: Exception | dict) -> SessionErrorOutcome` (new):
  - Given a `PixverseAPI` exception or ad-task JSON with `ErrCode`, decide:
    - `should_invalidate_cache: bool`
    - `should_attempt_reauth: bool`
    - `reason: str` (`"user_not_login"`, `"logged_elsewhere"`, `"timeout"`, etc.).
- `_maybe_auto_reauth(account: ProviderAccount, outcome: SessionErrorOutcome) -> bool` (new):
  - Uses `auth_method` + outcome to decide whether to run `_try_auto_reauth`.
  - Ensures only one reauth attempt per logical operation (avoid loops).

3. **Cleaner auto-reauth contract**

Refine `_try_auto_reauth` so that it:

- Is only called from `_maybe_auto_reauth`, not scattered around.
- Clearly documents:
  - Which auth_methods are eligible (`"password"` only).
  - What it updates (`jwt_token`, `cookies`, `provider_metadata.auth_method`, maybe `password` if provided).
  - How it handles failures (logs + returns False, no exceptions leaking into business logic unless necessary).

4. **Safer Google accounts handling**

- For accounts flagged as `auth_method="google"`:
  - Never call password-based reauth.
  - Rely on `/import-cookies` and manual flows (or a future Pixverse-specific Google flow) to refresh sessions.
- For `/connect-google`:
  - Keep current flagging behavior (no external Pixverse call) unless/until a robust Pixverse ID token integration is implemented.
  - Make the semantics explicit in docstrings and logging.

5. **Structured logging improvements**

Add logs like:

- When building sessions:

  ```python
  logger.debug(
      "pixverse_build_session",
      account_id=account.id,
      provider_id=account.provider_id,
      jwt_source="account" | "cookies" | "none",
      has_cookies=bool(account.cookies),
      auth_method=auth_method,
  )
  ```

- When invalidating caches:

  ```python
  logger.warning(
      "pixverse_session_invalidated",
      account_id=account.id,
      reason=outcome.reason,
      auth_method=auth_method,
  )
  ```

- When auto-reauth is attempted/skipped:

  ```python
  logger.info(
      "pixverse_auto_reauth_attempt",
      account_id=account.id,
      auth_method=auth_method,
      enabled=provider_settings.auto_reauth_enabled,
  )
  ```

  ```python
  logger.info(
      "pixverse_auto_reauth_skipped",
      account_id=account.id,
      auth_method=auth_method,
      reason="google_auth" | "disabled" | "no_password",
  )
  ```

## Non-Goals / Out of Scope

- Don’t change database schemas (`ProviderAccount`, `Asset`, etc.).
- Don’t change public API shapes or routes.
- Don’t remove cookie-import or password-based reauth; just make them more coherent.
- Don’t attempt to fully implement a real Pixverse Google ID token flow unless:
  - You have clear docs for Pixverse’s Google login API and
  - You can do so without breaking current cookie-based flows.

## Acceptance Criteria

- `PixverseProvider` has a clear, documented internal “session manager” that:
  - Builds sessions from `ProviderAccount` in a single place.
  - Handles session-invalid errors consistently for credits and ad-task.
  - Drives auto-reauth through a single path that respects `auth_method`.
- `auth_method` for Pixverse accounts is:
  - Explicitly set to `"google"` by `/connect-google`.
  - Defaulted and/or inferred to `"password"` for password/global-password flows.
  - Used to skip inappropriate auto-reauth attempts.
- Errors from Pixverse (SDK and ad-task) are:
  - Logged with enough context to trace per-account session issues.
  - Mapped into clear decisions about cache invalidation and reauth.
- Workers (`job_processor`, `status_poller`) continue to work as before, but benefit from more reliable session handling.
- No regressions in:
  - `/accounts/import-cookies` behavior for Pixverse.
  - `/accounts/{id}/pixverse-status` behavior (credits + ad-task).
  - Existing password-based auto-reauth for non‑Google Pixverse accounts.

## Suggested Implementation Order

1. Add a small internal helper in `PixverseProvider` that wraps error classification (exceptions + ErrCode) into a `SessionErrorOutcome` dataclass/dict.
2. Consolidate auto-reauth triggering into `_maybe_auto_reauth`, using that outcome and `auth_method`.
3. Tighten `_try_auto_reauth` to be `auth_method`-aware and logging-rich.
4. Make `/connect-google` and `/reauth` explicitly set/maintain `auth_method` in `provider_metadata`.
5. Add structured logging around session build, invalidation, and reauth decisions.
6. Sanity-check workers (no behavior change, but improved logs and reauth behavior for invalid sessions).

