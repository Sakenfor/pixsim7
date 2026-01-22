**Task: Refactor Pixverse Auth/Session Handling So Ad Task Uses Same Path as Credits**

## Context

Pixverse integration in PixSim7 currently has a mismatch between how **credits** and the **daily watch-ad task** are fetched:

- Credits are fetched via `PixverseProvider.get_credits()` using the `pixverse-py` SDK and a constructed `session` object.
- Ad task status is fetched via `PixverseProvider._get_ad_task_status()` using a direct `httpx` call with `account.cookies` and `account.jwt_token`.

This has led to confusing behavior in production logs:

- Credits can be fetched successfully (no error).
- On the same account, ad task calls sometimes fail with:
  - `Ad task API returned error: ErrCode=10003, ErrMsg=user is not login`
  - `No ad task returned for account {id} (method returned None)`

This suggests that credits and ad-task are not sharing exactly the same auth/session state, even though they refer to the same Pixverse account.

## Files

- `pixsim7/backend/main/services/provider/adapters/pixverse.py`

## Current Behavior (Important Code Paths)

**1. Credits (`get_credits`)**

- Uses `pixverse-py` SDK:
  - `from pixverse import Account`
  - `from pixverse.api.client import PixverseAPI`
- Builds a `session` dict inside `get_credits`:
  - Starts from `account.jwt_token` and `account.cookies`.
  - Uses `needs_refresh(jwt_token, hours_threshold=12)` + `extract_jwt_from_cookies(...)` to prefer a fresher JWT from cookies when needed.
  - Updates `account.jwt_token` in memory if a better token is found.
  - Adds `openapi_key` from `account.api_keys` (kind `"openapi"`), if present.
- Creates:
  - `temp_account = Account(email=account.email, session=session)`
  - `api = self._get_cached_api(account)`
- Fetches:
  - Web credits via `api.get_credits(temp_account)`
  - OpenAPI credits via `api.get_openapi_credits(temp_account)` (if `openapi_key` present).
- Handles session invalidation with `_is_session_invalid_error` (looks for `"logged in elsewhere"`, `"session expired"`, `"error 10005"`), evicts cache and auto-reauths via `_try_auto_reauth` when needed.

**2. Ad task (`_get_ad_task_status`)**

- Does **not** use `pixverse-py` SDK.
- Reuses `account.cookies` and `account.jwt_token` directly:
  - `cookies = dict(account.cookies or {})`
  - If `account.jwt_token` is set and `"_ai_token"` is **not** in cookies, it sets `cookies["_ai_token"] = account.jwt_token`.
  - Builds `headers` with `User-Agent`, `Accept`, and optional `Authorization: Bearer {account.jwt_token}`.
- Calls Pixverse directly via `httpx`:
  - `https://app-api.pixverse.ai/creative_platform/task/list`
- Behavior:
  - If HTTP request fails → logs warning, returns `None`.
  - If JSON `ErrCode != 0` → logs:
    - `Ad task API returned error: ErrCode={ErrCode}, ErrMsg={ErrMsg}`
    - returns `None` (no auto-reauth, no session invalidation).
  - On success, parses `Resp` list and looks for `task_type == 1` and `sub_type == 11`, returns a small dict with `reward`, `progress`, `total_counts`, `completed_counts`, `expired_time`.

**3. Combined status endpoint**

- `GET /api/v1/accounts/{account_id}/pixverse-status` in `pixsim7/backend/main/api/v1/accounts.py`:
  - Calls `provider.get_credits(account)` and expects a dict.
  - Extracts:
    - Numeric credit buckets (`"web"`, `"openapi"`, etc.).
    - Optional `"ad_watch_task"` dict if present.
  - Returns `PixverseStatusResponse` with:
    - `provider_id`, `email`, `credits`, `ad_watch_task`.

## Problem

- Credits and ad-task share the same high-level endpoint `/pixverse-status`, but **do not share the same auth/session-building code**.
- Credits use a carefully built `session` that:
  - May refresh JWT from cookies.
  - Integrates with `_get_cached_api` and `_is_session_invalid_error`.
- Ad-task uses:
  - Raw `account.cookies` / `account.jwt_token`.
  - Only sets `_ai_token` **if missing**, so it can leave a stale `_ai_token` cookie in place.
- Result:
  - It is possible for **credits to succeed while ad-task fails with `ErrCode=10003 user is not login`** for the same account, because the auth context sent to `/creative_platform/task/list` differs from what `pixverse-py` uses for credits.
- Additionally, `ErrCode=10003` is not treated as a session invalidation trigger, unlike 10005.

## Goal

Make Pixverse **web session handling single-sourced** so that:

- Credits and ad-task calls both use the **same session-building logic** for JWT and cookies.
- Ad-task failures due to session issues are handled consistently with credits (cache eviction, optional auto-reauth).
- The mental model “ads check uses the same auth as credits” is actually true in code.

## Requirements

1. Introduce a **shared helper** (e.g. `_build_web_session`) inside `PixverseProvider` that encapsulates Pixverse web-session construction.
2. Make **credits, client creation, and ad-task** all use this helper instead of rolling their own session logic.
3. Ensure `_build_web_session` preserves existing behaviors:
   - Use `needs_refresh` + `extract_jwt_from_cookies` to prefer a fresher JWT if needed.
   - Update `account.jwt_token` in memory when a better JWT is selected.
   - Attach `openapi_key` from `account.api_keys` where appropriate.
4. Adjust `_get_ad_task_status` to construct cookies and headers from the same session:
   - Use the **same JWT** that `_build_web_session` returns.
   - Always sync `_ai_token` to match that JWT (not only when missing), unless there is a strong reason not to.
5. Optionally (recommended) treat certain error codes (e.g. 10003, 10005) from the ad-task API as **session-invalid**, so the next call can trigger reauth / cache eviction in a consistent way.

## Proposed Implementation

### 1) Add `_build_web_session` helper

In `PixverseProvider` (same class in `pixverse.py` that currently defines `_create_client`, `_get_cached_api`, `get_credits`, `_get_ad_task_status`), add something like:

```python
def _build_web_session(self, account: ProviderAccount) -> Dict[str, Any]:
    \"\"\"Build a unified Pixverse web session from account credentials.

    Responsibilities:
    - Choose the JWT token to use (existing account.jwt_token or fresher from cookies).
    - Keep account.jwt_token in sync with the chosen token.
    - Attach cookies and optional OpenAPI key.
    \"\"\"
    # Prefer fresh JWT from cookies if current token is missing/expiring.
    jwt_token = account.jwt_token
    if needs_refresh(jwt_token, hours_threshold=12) and account.cookies:
        cookie_token = extract_jwt_from_cookies(account.cookies or {})
        if cookie_token:
            jwt_token = cookie_token

    # Keep account.jwt_token in sync with what we actually use.
    if jwt_token and jwt_token != account.jwt_token:
        account.jwt_token = jwt_token

    session: Dict[str, Any] = {
        "jwt_token": jwt_token,
        "cookies": account.cookies or {},
    }

    # Attach OpenAPI key from api_keys (kind="openapi"), if present.
    api_keys = getattr(account, "api_keys", None) or []
    for entry in api_keys:
        if isinstance(entry, dict) and entry.get("kind") == "openapi" and entry.get("value"):
            session["openapi_key"] = entry["value"]
            break

    return session
```

> NOTE: This is intended to **preserve the JWT refresh logic currently embedded in `get_credits`**, but centralize it.

### 2) Update `get_credits` to use `_build_web_session`

Refactor `get_credits` so that instead of building `session` manually, it calls `_build_web_session`:

```python
session = self._build_web_session(account)

temp_account = Account(
    email=account.email,
    session=session,
)
api = self._get_cached_api(account)
```

The rest of `get_credits` (web vs openapi credits, `_is_session_invalid_error`, `_try_auto_reauth`) should remain functionally the same.

### 3) Update `_create_client` to use `_build_web_session`

`_create_client` currently builds a `session` inline from `account.jwt_token`, `account.api_key`, and `account.cookies`.

Refactor it to:

- Start from `session = self._build_web_session(account)`.
- Then add `session["api_key"] = account.api_key` (preserving existing behavior).
- Then optionally add `session["use_method"]` if `use_method` is provided.

Example:

```python
session = self._build_web_session(account)
session["api_key"] = account.api_key

if use_method:
    session["use_method"] = use_method
```

The cache key and client construction logic should remain as-is, except that the JWT prefix for the cache key should already reflect whatever `_build_web_session` selected for `account.jwt_token`.

### 4) Update `_get_ad_task_status` to use `_build_web_session`

The goal is: **cookies and JWT for the ad-task request should be derived from the same session as credits**.

Refactor `_get_ad_task_status` so that instead of directly reading `account.jwt_token` and `account.cookies`, it does:

```python
session = self._build_web_session(account)
cookies = dict(session.get("cookies") or {})
jwt_token = session.get("jwt_token")

# Ensure JWT is in cookies as _ai_token (required for task list endpoint).
if jwt_token:
    cookies["_ai_token"] = jwt_token  # Always sync to chosen JWT.

headers: Dict[str, str] = {
    "User-Agent": "PixSim7/1.0 (+https://github.com/Sakenfor/pixsim7)",
    "Accept": "application/json",
}
if jwt_token:
    headers["Authorization"] = f"Bearer {jwt_token}"
```

Then keep the `httpx` call and parsing logic mostly intact.

> IMPORTANT: Previously, `_ai_token` was only set if missing. After this refactor, `_ai_token` will always be aligned with the chosen JWT returned from `_build_web_session`. This is intentional to avoid stale `_ai_token` cookies causing `user is not login`.

### 5) Optionally treat ad-task error codes as session invalidation signals

Currently, `_is_session_invalid_error` only checks error message strings (`"logged in elsewhere"`, `"session expired"`, `"error 10005"`), and that logic is only used in SDK calls (credits).

In `_get_ad_task_status`, when the JSON response has `ErrCode != 0`, we log and return `None` without touching caches or triggering reauth.

Enhancement (recommended):

- After `data = resp.json()`, if `ErrCode` is in a known set that indicates session problems (e.g. `10003`, `10005`), log accordingly and call `_evict_account_cache(account)` so that the next higher-level call (like `get_credits`) will not reuse a bad session.
- Example:

```python
err_code = data.get("ErrCode")
if err_code != 0:
    logger.warning(
        f"Ad task API returned error: ErrCode={err_code}, ErrMsg={data.get('ErrMsg')}"
    )
    if err_code in (10003, 10005):
        # Session likely invalid/stale; evict cache so subsequent calls can reauth.
        self._evict_account_cache(account)
    return None
```

> NOTE: Do **not** add new network calls or heavy reauth flows directly inside `_get_ad_task_status` unless you are confident it won't introduce loops or performance issues. The minimal first step is just cache eviction.

## Acceptance Criteria

- `PixverseProvider` has a single helper (`_build_web_session`) that:
  - Encapsulates the existing JWT refresh logic.
  - Keeps `account.jwt_token` in sync.
  - Attaches cookies and OpenAPI key.
- `get_credits`, `_create_client`, and `_get_ad_task_status` all use `_build_web_session` instead of constructing sessions ad hoc.
- For a given account, the JWT and `_ai_token` used in the ad-task request are aligned with the JWT the credits logic uses.
- The `/api/v1/accounts/{id}/pixverse-status` endpoint continues to return the same data shape:
  - `credits` numeric buckets.
  - Optional `ad_watch_task` dict.
- In logs:
  - It should be much less common (ideally absent) to see `Ad task API returned error: ErrCode=10003, ErrMsg=user is not login` for accounts where credits succeed.
- No new behavior changes outside Pixverse-specific code are introduced.

## Testing Suggestions

- Unit/integration tests (if feasible) for `PixverseProvider`:
  - Mock `account` with:
    - Only `jwt_token` set.
    - Only `_ai_token` in cookies.
    - Both set but with different values (stale cookie scenario).
  - Verify `_build_web_session` chooses the correct JWT and synchronizes `_ai_token` when used by `_get_ad_task_status`.
- Manual tests:
  - For a real Pixverse account:
    - Call `/api/v1/accounts/{id}/pixverse-status` multiple times.
    - Confirm credits and ad-task both succeed consistently when the Pixverse account is valid.
    - If you intentionally invalidate the session on Pixverse side, confirm:
      - Errors are logged consistently.
      - Cache eviction and/or auto-reauth behave as expected on subsequent calls.

