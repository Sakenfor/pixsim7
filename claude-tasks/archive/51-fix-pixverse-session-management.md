**Task: Fix Pixverse "Logged in Elsewhere" Session Invalidation**

## Problem

Pixverse API returns error 10005 ("account has been logged in elsewhere") when:
- Extension syncs credits multiple times
- Multiple API calls use the same JWT token
- Each call creates a new PixverseAPI session

Pixverse detects multiple sessions with same JWT as "logged in elsewhere" and invalidates previous sessions.

## Root Cause

In `pixsim7/backend/main/services/provider/adapters/pixverse.py`:

```python
def get_credits(self, account: ProviderAccount) -> dict:
    # Problem: Creates NEW session every time
    temp_account = Account(email=account.email, session=session)
    api = PixverseAPI()
    web_data = api.get_credits(temp_account)  # ← Pixverse sees this as new login
```

Every call to:
- `get_credits()`
- `get_user_info()`
- `_get_ad_task_status()`

Creates a new Pixverse session, triggering the "logged in elsewhere" detection.

## Solution Options

### Option 1: Client Pooling (Recommended)
Cache PixverseClient instances per account to reuse sessions:

```python
class PixverseProvider(Provider):
    def __init__(self):
        self._client_cache: Dict[str, PixverseClient] = {}
        self._cache_lock = asyncio.Lock()

    def _get_or_create_client(self, account: ProviderAccount) -> PixverseClient:
        """Get cached client or create new one"""
        cache_key = f"{account.id}:{account.jwt_token[:20]}"

        if cache_key not in self._client_cache:
            self._client_cache[cache_key] = self._create_client(account)

        return self._client_cache[cache_key]
```

### Option 2: Session Reuse in pixverse-py SDK
Check if pixverse-py SDK supports session reuse:
- Session pooling
- Keep-alive connections
- Reuse existing auth tokens

### Option 3: Rate Limiting
Prevent rapid successive calls:
```python
# Add cooldown tracking per account
last_credit_sync: Dict[int, datetime] = {}
SYNC_COOLDOWN = timedelta(seconds=30)

async def sync_credits(...):
    if account.id in last_credit_sync:
        if datetime.now() - last_credit_sync[account.id] < SYNC_COOLDOWN:
            return cached_credits
```

## Implementation Plan

### Phase 1: Add Client Caching
- [ ] Add client cache to PixverseProvider
- [ ] Implement `_get_or_create_client()`
- [ ] Update all methods to use cached client
- [ ] Add cache invalidation on JWT change

### Phase 2: Add Session Lifecycle
- [ ] Track session creation timestamps
- [ ] Expire cached clients after inactivity
- [ ] Clear cache on logout/token refresh

### Phase 3: Add Defensive Measures
- [ ] Catch error 10005 and handle gracefully
- [ ] Auto-refresh JWT if expired
- [ ] Retry with new session if invalidated

## Files to Modify

1. **pixsim7/backend/main/services/provider/adapters/pixverse.py**
   - Add client cache
   - Update `get_credits()`, `get_user_info()`, `_get_ad_task_status()`
   - Add cache management

2. **pixsim7/backend/main/api/v1/accounts.py** (optional)
   - Add rate limiting to sync-credits endpoint
   - Prevent rapid successive syncs

3. **chrome-extension/background.js** (optional)
   - Reduce auto-sync frequency
   - Don't sync on every popup open

## Testing

- [ ] Open extension → should create 1 session only
- [ ] Refresh credits multiple times → should reuse session
- [ ] Wait 1 hour → session should still work
- [ ] Use multiple accounts → each has own session
- [ ] Logout → session cache cleared

## Quick Fix (Immediate)

Reduce sync frequency in extension:

```javascript
// background.js - line 479
// Don't sync credits on every login
if (message.action === 'loginWithAccount') {
    // Remove this line:
    // await backendRequest(`/api/v1/accounts/${accountId}/sync-credits`, { method: 'POST' });
}
```

And in popup.js, only sync credits on manual refresh, not auto.

## Success Criteria

- ✅ No more "logged in elsewhere" errors
- ✅ Multiple credit syncs work without invalidation
- ✅ Session persists for reasonable duration
- ✅ Each account has isolated session

## Related

- Pixverse API docs (error codes)
- pixverse-py SDK session management
- Extension flows documentation
