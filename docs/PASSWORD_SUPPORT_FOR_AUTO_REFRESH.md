# Password Support for Automatic Credential Refresh

**Status**: Backend Complete ✅ | Extension Update Needed ⚠️
**Implementation Date**: 2025-11-17

## Problem

When JWT tokens expire, the system couldn't automatically re-login because passwords weren't stored. This meant:
1. Credits would show as 0 when tokens expired
2. Manual re-login required
3. No way to refresh credentials automatically

## Solution

Added optional password storage per account for automatic JWT refresh.

## Backend Changes

### 1. Database Schema
**No migration needed** - `ProviderAccount.password` field already exists!

### 2. API Changes

#### `CookieImportRequest` - Added Password Field
**File**: `pixsim7_backend/api/v1/accounts.py:537-542`

```python
class CookieImportRequest(BaseModel):
    provider_id: str
    url: str
    raw_data: Dict
    password: Optional[str] = None  # NEW: Optional password for auto-refresh
```

#### `import_cookies` Endpoint - Stores Password
**Lines 636-639**: Saves password when updating existing accounts
**Line 702**: Saves password when creating new accounts

```python
# When updating
if request.password and existing.password != request.password:
    existing.password = request.password
    updated_fields.append("password")

# When creating
account = await account_service.create_account(
    ...
    password=request.password,  # Store for auto-refresh
    ...
)
```

#### `AccountService.create_account` - Accepts Password
**File**: `pixsim7_backend/services/account/account_service.py:422`

```python
async def create_account(
    self,
    user_id: int,
    email: str,
    provider_id: str = "pixverse",
    *,
    password: Optional[str] = None,  # NEW
    jwt_token: Optional[str] = None,
    ...
)
```

## Extension Changes Needed

### 1. Update Import Flow

**File**: `chrome-extension/popup.js` or `content.js`

When importing cookies, prompt for password:

```javascript
async function handleImportCookies() {
  // ... existing cookie extraction ...

  // NEW: Prompt for password (skip for Google accounts)
  let password = null;
  if (!isGoogleAccount(email)) {
    password = prompt(
      'Enter password for auto-refresh (optional):\n\n' +
      'This allows automatic JWT token refresh when expired.\n' +
      'Leave blank to skip (Google accounts don\'t need this).'
    );
  }

  // Send to backend with password
  const response = await chrome.runtime.sendMessage({
    action: 'importCookies',
    providerId: currentProvider.provider_id,
    url: tabUrl,
    rawData: {
      cookies: extractedCookies,
      localStorage: extractedStorage
    },
    password: password  // NEW
  });
}

function isGoogleAccount(email) {
  // Skip password for Google-authenticated accounts
  return email.includes('@gmail.com') ||
         email.includes('@googlemail.com');
}
```

### 2. Update Background Script

**File**: `chrome-extension/background.js:276-289`

```javascript
if (message.action === 'importCookies') {
  importCookiesToBackend(
    message.providerId,
    message.url,
    message.rawData,
    message.password  // NEW: Pass password through
  )
    .then((data) => sendResponse({ success: true, data }))
    .catch((error) => sendResponse({ success: false, error: error.message }));
  return true;
}
```

**File**: `chrome-extension/background.js:469-488`

```javascript
async function importCookiesToBackend(providerId, url, rawData, password) {
  const data = await backendRequest('/api/v1/accounts/import-cookies', {
    method: 'POST',
    body: JSON.stringify({
      provider_id: providerId,
      url: url,
      raw_data: rawData,
      password: password  // NEW
    })
  });
  return data;
}
```

## Future: Auto-Refresh Implementation

### Phase 2: JWT Auto-Refresh Service

When `sync_all_credits` fails with JWT error:

```python
# In pixsim7_backend/api/v1/accounts.py:sync_all_account_credits

for account in accounts:
    try:
        credits_data = provider.get_credits(account)
    except JWTExpiredError:
        # Try to re-login with stored password
        if account.password:
            logger.info(f"JWT expired for {account.email}, attempting re-login...")
            try:
                new_jwt = await provider.login(account.email, account.password)
                account.jwt_token = new_jwt
                await db.commit()

                # Retry credit fetch
                credits_data = provider.get_credits(account)
            except Exception as e:
                logger.error(f"Re-login failed for {account.email}: {e}")
                failed += 1
                continue
```

### Phase 3: Provider Re-login Methods

Add to each provider adapter:

```python
# In pixsim7_backend/services/provider/adapters/pixverse.py

async def login(self, email: str, password: str) -> str:
    """
    Re-login to get fresh JWT token

    Args:
        email: Account email
        password: Account password

    Returns:
        New JWT token
    """
    # Use pixverse-py login flow
    from pixverse import Account

    # Perform login (may need Selenium/automation)
    # Return new JWT token
    pass
```

## Testing

### Manual Test with holyfruit12

1. **Add password to existing account**:
```bash
# In Python console
from pixsim7_backend.infrastructure.database.session import get_async_session
from pixsim7_backend.domain import ProviderAccount
from sqlalchemy import select

async with get_async_session() as db:
    result = await db.execute(
        select(ProviderAccount).where(
            ProviderAccount.email == "holyfruit12@hotmail.com"
        )
    )
    account = result.scalar_one()
    account.password = "YOUR_PASSWORD_HERE"
    await db.commit()
```

2. **Test credit sync**:
```bash
python test_pixverse_credits.py
```

3. **Verify password stored**:
```sql
SELECT email, password IS NOT NULL as has_password
FROM provider_accounts
WHERE provider_id = 'pixverse';
```

## Security Considerations

### Current Implementation
- Passwords stored in **plain text** in database
- Same encryption as JWT tokens and cookies
- Protected by PostgreSQL access controls
- Transmitted over HTTPS only

### Recommended Improvements (Future)

1. **Encrypt passwords at rest**:
```python
from cryptography.fernet import Fernet

# Encrypt before storing
encrypted_password = cipher.encrypt(password.encode())
account.password = encrypted_password

# Decrypt when using
decrypted = cipher.decrypt(account.password).decode()
```

2. **Use environment variable for encryption key**:
```env
PASSWORD_ENCRYPTION_KEY=your-fernet-key-here
```

3. **Rotate encryption keys periodically**

## Migration Guide

### For Existing Accounts

**Option 1**: Bulk update via script
```python
# Run this to add passwords for known accounts
async def add_passwords_bulk():
    accounts_with_passwords = {
        "holyfruit12@hotmail.com": "password123",
        # ... more accounts
    }

    async with get_async_session() as db:
        for email, pwd in accounts_with_passwords.items():
            result = await db.execute(
                select(ProviderAccount).where(
                    ProviderAccount.email == email
                )
            )
            account = result.scalar_one_or_none()
            if account:
                account.password = pwd
        await db.commit()
```

**Option 2**: Update via extension
- User manually re-imports each account
- Extension prompts for password
- Backend updates password field

**Option 3**: Update via backend UI
- Add password field to account edit form
- Users can set/update passwords manually

## Summary

### What's Working Now ✅
- Backend accepts passwords during import
- Passwords stored in database
- Ready for auto-refresh implementation

### What Needs Extension Update ⚠️
- Prompt user for password during import
- Pass password to backend API
- Skip prompt for Google accounts

### What's Next 🔮
- Implement JWT auto-refresh logic
- Add provider re-login methods
- Consider password encryption
- Add bulk password update UI

---

**Last Updated**: 2025-11-17
**Related Files**:
- `pixsim7_backend/api/v1/accounts.py` (import-cookies endpoint)
- `pixsim7_backend/services/account/account_service.py` (create_account)
- `pixsim7_backend/domain/account.py` (ProviderAccount model)
- `chrome-extension/background.js` (import flow)
- `chrome-extension/popup.js` (UI for import)
