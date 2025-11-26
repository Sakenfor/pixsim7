# Pixverse Auth / Session Redesign – Clean Spec (v2)

## 0. Overview

This document specifies a redesigned authentication and session-management model for the Pixverse provider.

It is a **code-facing spec** aligned with the original task brief in `claude-tasks/53-redesign-pixverse-auth-session-and-auto-reauth.md`, with a focus on:

- A single session manager API.
- A small, explicit error model.
- Auth-method-aware auto-reauth.
- Stable external behavior (no schema or public API changes).

The goal is that an engineer can implement this spec directly without needing a second redesign doc.

---

## 1. Goals and Non-Goals

### 1.1 Goals

- **Centralized session handling**
  - Single flow to:
    - Build a session from `ProviderAccount`.
    - Classify errors as session-related or not.
    - Optionally auto-reauth and retry once.

- **Explicit auth method behavior**
  - Model Pixverse auth methods in one place.
  - Use auth method to decide whether password-based auto-reauth is valid.

- **Unified error handling**
  - Same error classification logic for:
    - Pixverse SDK / API exceptions.
    - Ad-task JSON `ErrCode` responses.

- **Stable external contracts**
  - No database schema changes.
  - No public API shape changes:
    - `/accounts/import-cookies`
    - `/accounts/{id}/reauth`
    - `/accounts/{id}/connect-google`
    - `/accounts/{id}/pixverse-status`
    - `/generations/*`, `/assets/*` routes.
  - Workers (`job_processor.py`, `status_poller.py`) keep the same method calls and expectations.

- **Observability**
  - Predictable, structured logs for:
    - Session build decisions.
    - Session-invalid errors and cache invalidation.
    - Auto-reauth attempts and outcomes.

### 1.2 Non-Goals

- Do not change DB schemas (e.g., `ProviderAccount`, `Asset`).
- Do not remove cookie-import or password-based reauth.
- Do not implement a full Pixverse Google ID-token flow unless it can be done without breaking cookie-based flows.

---

## 2. Data Model

All new types live in `pixsim7/backend/main/domain/provider_auth.py`.

### 2.1 Auth Method Enum

```python
from enum import Enum


class PixverseAuthMethod(str, Enum):
    """Authentication method for Pixverse accounts."""

    PASSWORD = "password"   # Account has password or uses global_password
    GOOGLE = "google"       # Google-based, cookie-only; no password reauth
    UNKNOWN = "unknown"     # Legacy / cookie-only, not explicitly classified

    @classmethod
    def from_metadata(cls, metadata: dict | None) -> "PixverseAuthMethod":
        """Extract auth method from provider_metadata."""
        if not metadata:
            return cls.UNKNOWN

        value = metadata.get("auth_method")
        try:
            return cls(value)
        except Exception:
            return cls.UNKNOWN

    def allows_password_reauth(self) -> bool:
        """Return True if password-based reauth is valid for this method."""
        return self is PixverseAuthMethod.PASSWORD
```

**Storage convention**

- `ProviderAccount.provider_metadata["auth_method"]` is the external representation.
- No migrations; unset or unknown values map to `UNKNOWN`.

**Future extensions**

- If a future `"api_key_only"` or other method is added:
  - Add a new enum value.
  - Decide behavior by implementing `allows_password_reauth()` (and any future helper like `allows_cookie_reauth()`).

### 2.2 Session Data

```python
from typing import TypedDict, Optional


class PixverseSessionData(TypedDict, total=False):
    """Structured session data for Pixverse provider operations."""

    jwt_token: Optional[str]
    cookies: dict[str, str]
    openapi_key: Optional[str]

    # Metadata for logging / debugging
    jwt_source: str          # "account" | "cookies" | "none"
    auth_method: str         # PixverseAuthMethod value
```

### 2.3 Session Error Outcome

```python
from dataclasses import dataclass
from typing import Optional


@dataclass
class SessionErrorOutcome:
    """
    Classification of a Pixverse error with respect to session state.
    """

    # Decisions
    should_invalidate_cache: bool
    should_attempt_reauth: bool

    # Context
    error_code: Optional[str]     # e.g. "10003", "10005"
    error_reason: str             # e.g. "user_not_login", "logged_elsewhere", "session_expired", "api_error"
    is_session_error: bool

    # Original error (optional, for re-raising)
    original_error: Optional[Exception] = None

    @staticmethod
    def no_error() -> "SessionErrorOutcome":
        return SessionErrorOutcome(
            should_invalidate_cache=False,
            should_attempt_reauth=False,
            error_code=None,
            error_reason="success",
            is_session_error=False,
            original_error=None,
        )

    @staticmethod
    def non_session_error(error: Exception) -> "SessionErrorOutcome":
        return SessionErrorOutcome(
            should_invalidate_cache=False,
            should_attempt_reauth=False,
            error_code=None,
            error_reason="non_session_error",
            is_session_error=False,
            original_error=error,
        )
```

---

## 3. Session Manager Design

All session logic is centralized in `pixsim7/backend/main/services/provider/adapters/pixverse_session_manager.py`.

### 3.1 Responsibilities

`PixverseSessionManager` is an internal helper used only by `PixverseProvider`. It is responsible for:

- Building sessions from `ProviderAccount`.
- Classifying errors as session-invalid vs non-session.
- Invalidating provider caches when a session is bad.
- Auto-reauth decisions, respecting `auth_method`.

### 3.2 Public API

```python
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")


class PixverseSessionManager:
    def __init__(self, provider: "PixverseProvider"):
        self.provider = provider

    def build_session(self, account: ProviderAccount) -> PixverseSessionData: ...

    async def run_with_session(
        self,
        *,
        account: ProviderAccount,
        op_name: str,
        operation: Callable[[PixverseSessionData], Awaitable[T]],
        retry_on_session_error: bool = True,
    ) -> T:
        """
        Execute a Pixverse operation with a session, handling:
        - Session build and persistence of changed credentials.
        - Error classification.
        - Cache invalidation.
        - Optional auto-reauth and a single retry.
        """
        ...

    def classify_error(self, error: Exception | dict, context: str) -> SessionErrorOutcome: ...
```

**Key idea:** any provider method that needs a JWT + cookies should be implemented in terms of `run_with_session` rather than manually doing build/try/catch/retry.

### 3.3 Session Build Logic

Implementation of `build_session(account)`:

- Read `auth_method = PixverseAuthMethod.from_metadata(account.provider_metadata)`.
- Start with `jwt_token = account.jwt_token` and `jwt_source = "account"`.
- If `needs_refresh(jwt_token, hours_threshold=12)` and `account.cookies` is set:
  - Try `extract_jwt_from_cookies(account.cookies)`.
  - If a fresher token is found, log and switch to that token (`jwt_source = "cookies"`).
  - Update `account.jwt_token` in memory.
- Scan `account.api_keys` for an `{"kind": "openapi", ...}` entry and extract `openapi_key` if present.
- Return `PixverseSessionData` with:
  - `jwt_token`, `cookies`, optional `openapi_key`.
  - `jwt_source` and `auth_method` (enum value as string).

Persistence of updated credentials is handled by the provider via a small helper:

```python
async def _persist_if_credentials_changed(self, account: ProviderAccount) -> None:
    """
    Compare in-memory account credentials with DB; update if needed.
    Implemented in PixverseProvider, used by SessionManager.
    """
```

### 3.4 Error Classification – Table

All Pixverse errors are classified via one function:

```python
def classify_error(self, error: Exception | dict, context: str) -> SessionErrorOutcome:
    ...
```

**Error table**

| Source              | Pattern / Code                       | is_session_error | should_invalidate_cache | should_attempt_reauth | error_reason       |
|---------------------|--------------------------------------|------------------|--------------------------|------------------------|--------------------|
| Exception (SDK)     | message contains `logged in elsewhere` or `10005` | True             | True                     | True                   | `"logged_elsewhere"` |
| Exception (SDK)     | message contains `user is not login` or `10003`  | True             | True                     | True                   | `"user_not_login"`  |
| Exception (SDK)     | message contains `session expired`   | True             | True                     | True                   | `"session_expired"` |
| JSON (ad-task)      | `ErrCode` in `{10003, 10005}`        | True             | True                     | True                   | `"user_not_login"` / `"logged_elsewhere"` |
| Any other exception |                                      | False            | False                    | False                  | `"non_session_error"` |
| Any other JSON      |                                      | False            | False                    | False                  | `"api_error"`       |

Implementation notes:

- Exceptions are matched on `str(error).lower()`.
- JSON errors are dicts produced by the ad-task endpoint (`resp.json()`).
- For JSON session errors, we do not attach an `original_error` (it is `None`).

### 3.5 Auto-Reauth Behavior

`run_with_session` uses `classify_error()` and delegates to an internal helper:

```python
async def _maybe_auto_reauth(
    self,
    account: ProviderAccount,
    outcome: SessionErrorOutcome,
    context: str,
) -> bool:
    ...
```

Rules:

- If `outcome.should_attempt_reauth` is `False` → skip, return `False`.
- Determine `auth_method = PixverseAuthMethod.from_metadata(account.provider_metadata)`:
  - If `not auth_method.allows_password_reauth()` → skip, log reason `auth_method_incompatible`.
- Load provider settings via `provider._load_provider_settings()`:
  - If missing or `auto_reauth_enabled` is false → skip, log reason `disabled_in_settings`.
- Otherwise:
  - Log `pixverse_auto_reauth_attempt` with `account_id`, `auth_method`, `error_code`, `error_reason`, `context`.
  - Call `await provider._try_auto_reauth(account)`.
  - Log `pixverse_auto_reauth_completed` with `success` flag.

`run_with_session` guarantees **at most one retry** per operation call:

- On first failure:
  - If `outcome.is_session_error` and `_maybe_auto_reauth()` returns `True`, retry once.
  - Otherwise, do not retry.

### 3.6 Cache Invalidation

If `outcome.should_invalidate_cache` is `True`, the manager calls:

```python
self.provider._evict_account_cache(account)
```

and logs:

```python
logger.warning(
    "pixverse_session_invalidated",
    account_id=account.id,
    reason=outcome.error_reason,
    error_code=outcome.error_code,
)
```

---

## 4. PixverseProvider Integration

All of this is wired into `pixsim7/backend/main/services/provider/adapters/pixverse.py`.

### 4.1 Construction and Session Use

```python
class PixverseProvider(BaseProviderAdapter):
    def __init__(self) -> None:
        super().__init__()
        self._client_cache = {}
        self._api_cache = {}
        self.session_manager = PixverseSessionManager(self)

    def _build_web_session(self, account: ProviderAccount) -> dict:
        """
        Backward-compatible wrapper; delegates to session manager.
        Prefer using session_manager.run_with_session() for new code.
        """
        return dict(self.session_manager.build_session(account))
```

### 4.2 Using `run_with_session` in `get_credits`

`get_credits` becomes a thin wrapper:

```python
async def get_credits(self, account: ProviderAccount) -> dict:
    async def _op(session: PixverseSessionData) -> dict:
        web_total = await self._get_web_credits(account, session)
        openapi_total = await self._get_openapi_credits(account, session)

        result: dict[str, object] = {
            "web": max(0, web_total),
            "openapi": max(0, openapi_total),
        }

        ad_task = await self._get_ad_task_status_best_effort(account, session)
        if ad_task is not None:
            result["ad_watch_task"] = ad_task
        return result

    return await self.session_manager.run_with_session(
        account=account,
        op_name="get_credits",
        operation=_op,
        retry_on_session_error=True,
    )
```

Helper methods `_get_web_credits`, `_get_openapi_credits`, and `_get_ad_task_status_best_effort`:

- Accept `session: PixverseSessionData`.
- Do **not** implement their own retry or auto-reauth logic; they raise exceptions as needed.
- Ad-task handling:
  - The low-level `_get_ad_task_status_raw` parses JSON and raises an exception with `ErrCode` for session-invalid codes (10003, 10005).
  - `run_with_session` handles classification and retries.
  - A best-effort wrapper `_get_ad_task_status_best_effort` catches errors and logs them, returning `None`.

### 4.3 Auto-Reauth Implementation

`PixverseProvider._try_auto_reauth(account)` is the only function that performs password-based reauth:

```python
async def _try_auto_reauth(self, account: ProviderAccount) -> bool:
    """
    Attempt password-based auto-reauth.
    Only called by PixverseSessionManager when auth_method allows it.
    """
    from pixsim7.backend.main.services.provider.pixverse_auth_service import PixverseAuthService
    from pixsim7.backend.main.domain.provider_auth import PixverseAuthMethod

    auth_method = PixverseAuthMethod.from_metadata(account.provider_metadata)
    if not auth_method.allows_password_reauth():
        logger.info(
            "pixverse_auto_reauth_skipped",
            account_id=account.id,
            auth_method=auth_method.value,
            reason="incompatible_auth_method",
        )
        return False

    settings = await self._load_provider_settings()
    global_password = settings.get("global_password") if settings else None
    password = account.password or global_password

    if not password:
        logger.info(
            "pixverse_auto_reauth_failed",
            account_id=account.id,
            reason="no_password",
        )
        return False

    try:
        async with PixverseAuthService() as auth_service:
            session_data = await auth_service.login_with_password(
                account.email,
                password,
                headless=True,
            )

        extracted = await self.extract_account_data(session_data)

        # Ensure auth_method is PASSWORD after successful password login
        meta = extracted.get("provider_metadata") or {}
        meta["auth_method"] = PixverseAuthMethod.PASSWORD.value
        extracted["provider_metadata"] = meta

        # Apply and persist credentials
        await self._apply_extracted_credentials(account, extracted)

        logger.info(
            "pixverse_auto_reauth_success",
            account_id=account.id,
            auth_method=PixverseAuthMethod.PASSWORD.value,
        )
        return True
    except Exception as exc:
        logger.error(
            "pixverse_auto_reauth_error",
            account_id=account.id,
            error=str(exc),
        )
        return False
```

`_apply_extracted_credentials` is a small helper that updates `jwt_token`, `cookies`, `provider_metadata`, persists the account, and evicts caches.

### 4.4 Workers

Workers continue to call provider methods the same way:

- `job_processor.py` calls `ProviderService.submit_job(...)`.
- `status_poller.py` calls `ProviderService.check_status(...)`.

If these paths use Pixverse sessions:

- They should call into provider methods that internally use `run_with_session`.
- From the workers’ perspective:
  - On session-invalid errors, the provider will attempt one auto-reauth (for password accounts) and retry once.
  - If still failing, errors bubble up as before, but with better logs and consistent session invalidation.

---

## 5. Auth Endpoints and Auth Method Semantics

All changes here are in `pixsim7/backend/main/api/v1/accounts.py`. API shapes remain the same.

### 5.1 `/accounts/import-cookies`

Behavior for Pixverse accounts:

- Use provider-specific `extract_account_data` to parse cookies/raw data from the extension.
- Ensure `provider_metadata["auth_method"]` is set to `UNKNOWN` if not already present.
- Create or update `ProviderAccount` as today.

Semantic meaning:

- Cookie-import accounts are treated as **conservative / unknown**:
  - Auto-reauth may be allowed later if the user explicitly reauths with a password.

### 5.2 `/accounts/{id}/reauth`

Behavior for Pixverse accounts:

- Use password-based login via `PixverseAuthService.login_with_password(...)`.
- Extract new credentials.
- Explicitly set `provider_metadata["auth_method"] = "password"` (via `PixverseAuthMethod.PASSWORD.value`).
- Persist new credentials and optional new password.

Semantic meaning:

- This endpoint is the source of truth for:
  - Enabling password-based auto-reauth for an account.
  - Updating stored passwords where applicable.

### 5.3 `/accounts/{id}/connect-google`

Behavior for Pixverse accounts:

- Validate that `provider_id == "pixverse"`.
- Update `provider_metadata["auth_method"] = "google"`.
- Do not perform any Google ID-token exchange with Pixverse (for now).
- Return the same response shape as today.

Semantic meaning:

- Flags an account as **Google-authenticated**:
  - Password-based auto-reauth must be skipped.
  - Sessions should be refreshed via cookie import or a future dedicated Google flow.

---

## 6. Observability and Logging

The following log events should be emitted with structured fields:

- `pixverse_build_session`
  - Fields: `account_id`, `jwt_source`, `auth_method`, `has_cookies`, `has_openapi_key`.

- `pixverse_session_error_detected`
  - Fields: `account_id` (if available), `context`, `error_code`, `error_reason`.

- `pixverse_session_invalidated`
  - Fields: `account_id`, `reason`, `error_code`.

- `pixverse_auto_reauth_attempt`
  - Fields: `account_id`, `auth_method`, `error_code`, `error_reason`, `context`.

- `pixverse_auto_reauth_completed`
  - Fields: `account_id`, `success`, `context`.

- `pixverse_auto_reauth_skipped`
  - Fields: `account_id`, `auth_method`, `reason`, `context`.

- `pixverse_get_credits_retry_after_reauth` (if needed)
  - Fields: `account_id`.

These event names are suggestions; the key requirement is that the same event names and fields are used consistently across session build, classification, invalidation, and reauth paths.

---

## 7. Migration, Testing, and Acceptance

### 7.1 Migration Steps

1. Add `provider_auth.py` with `PixverseAuthMethod`, `PixverseSessionData`, and `SessionErrorOutcome`.
2. Add `PixverseSessionManager` with:
   - `build_session`.
   - `classify_error`.
   - `run_with_session`.
   - Internal `_maybe_auto_reauth`.
3. Refactor `PixverseProvider`:
   - Inject `session_manager`.
   - Implement `get_credits` and any other session-using methods via `run_with_session`.
   - Implement `_try_auto_reauth` and `_apply_extracted_credentials`.
4. Update account endpoints:
   - `/accounts/import-cookies` sets `auth_method=UNKNOWN` for Pixverse if not set.
   - `/accounts/{id}/reauth` sets `auth_method=PASSWORD`.
   - `/accounts/{id}/connect-google` sets `auth_method=GOOGLE`.
5. Add structured logging calls matching section 6.

### 7.2 Testing

**Unit tests**

- `PixverseSessionManager.build_session`:
  - Chooses JWT from account vs cookies based on expiry.
  - Populates `jwt_source`, `auth_method`, and `openapi_key`.
- `PixverseSessionManager.classify_error`:
  - Correct classification for each error pattern and `ErrCode`.
- `run_with_session`:
  - Retries once on session-invalid error when auto-reauth succeeds.
  - Does not retry on non-session errors or when auth_method is incompatible.

**Integration tests**

- Cookie import:
  - Pixverse account created with `auth_method=UNKNOWN`.
- Password reauth:
  - Sets `auth_method=PASSWORD`.
  - Subsequent session-invalid error triggers auto-reauth.
- Google connect:
  - Sets `auth_method=GOOGLE`.
  - Subsequent session-invalid error does **not** attempt password auto-reauth.
- Credits:
  - Session-invalid error (e.g., invalid JWT) triggers auto-reauth and retry once.
  - Google-auth account with invalid session does not auto-reauth; credits return zeros or error as appropriate.

**Manual testing**

- Import account via extension.
- Force session expiry (manually invalidate JWT).
- Observe:
  - For password accounts: background auto-reauth and retry on `get_credits` / status calls.
  - For Google accounts: no auto-reauth; require cookie import or explicit user action.

### 7.3 Acceptance Criteria

- All auth/session decisions for Pixverse are implemented via `PixverseSessionManager`.
- Error handling for both `get_credits` and ad-task status is routed through `classify_error` and `run_with_session`.
- `auth_method` is consistently set and used to skip inappropriate auto-reauth.
- Workers continue to operate without contract changes, but benefit from more reliable session handling.
- No regressions in:
  - `/accounts/import-cookies` for Pixverse.
  - `/accounts/{id}/reauth`.
  - `/accounts/{id}/connect-google`.
  - `/accounts/{id}/pixverse-status` behavior (credits + ad-task).

