# Pixverse Auth/Session Evolution (Archived)

**Status:** COMPLETED
**Final Implementation:** `PixverseSessionManager` in `pixsim7/backend/main/services/provider/adapters/pixverse_session_manager.py`

---

## Summary

This document consolidates the evolution of Pixverse authentication handling from tasks 51, 52, and 53. All work has been completed and the system is now unified under `PixverseSessionManager`.

---

## Problem History

### Issue 1: Session Invalidation (Task 51)
- **Problem:** Multiple API calls created new Pixverse sessions, triggering "logged in elsewhere" (error 10005)
- **Root cause:** Each call to `get_credits()`, `get_user_info()`, `_get_ad_task_status()` created a new session
- **Solution:** Client pooling and session reuse

### Issue 2: Credits vs Ad-Task Mismatch (Task 52)
- **Problem:** Credits succeeded but ad-task failed with "user is not login" (error 10003)
- **Root cause:** Credits used `pixverse-py` SDK, ad-task used direct `httpx` with different auth
- **Solution:** Unified `_build_web_session()` helper used by both paths

### Issue 3: Tangled Auth Flows (Task 53)
- **Problem:** Multiple auth entry points with complex, hard-to-reason-about logic
- **Root cause:** Organic evolution without central design
- **Solution:** `PixverseSessionManager` with explicit error model and auth-method-aware behavior

---

## Final Architecture

### Core Components

```
PixverseSessionManager (pixverse_session_manager.py)
├── build_session()           - Unified session construction
├── run_with_session()        - Execute with auto-reauth
├── classify_error()          - Determine if error is session-related
└── should_auto_reauth()      - Auth-method-aware reauth decision

PixverseSessionData (TypedDict)
├── jwt_token                 - Current JWT
├── cookies                   - Browser cookies
├── jwt_source                - "account" | "cookies"
├── auth_method               - "password" | "google" | "unknown"
└── openapi_key               - Optional API key

PixverseAuthMethod (Enum)
├── PASSWORD                  - Supports auto-reauth
├── GOOGLE                    - No auto-reauth (OAuth)
└── UNKNOWN                   - Conservative, no auto-reauth
```

### Key Files

- `pixverse_session_manager.py` - Central session logic
- `pixverse_session.py` - Backward-compatible mixin
- `pixverse_credits.py` - Credits and ad-task fetching
- `pixverse_operations.py` - Video/image generation
- `pixverse.py` - Main provider class (composes all mixins)

### Error Handling

Session-invalid errors (10003, 10005) trigger:
1. Cache eviction via `_evict_account_cache()`
2. Optional auto-reauth for password accounts
3. Retry once with fresh session

---

## Original Task Files (Archived)

The following files documented the evolution and are preserved for historical reference:

1. **51-fix-pixverse-session-management.md** - Original session invalidation issue
2. **52-refactor-pixverse-auth-for-ads-and-credits.md** - Unified session helper design
3. **53-redesign-pixverse-auth-session-and-auto-reauth.md** - Full redesign task brief
4. **53-redesign-proposal.md** - Clean implementation spec (in analysis/)

---

## Verification

The implementation satisfies all original requirements:
- ✅ Single `build_session()` for all Pixverse operations
- ✅ Unified error classification (10003, 10005 handled consistently)
- ✅ Auth-method-aware auto-reauth (password only)
- ✅ No schema or public API changes
- ✅ Structured logging for session events
