# Authentication Features

## Overview

pixverse-py supports multiple authentication methods with smart session management.

## Authentication Methods

### 1. Email/Password (Basic)

Standard authentication with email and password.

```python
from pixverse import PixverseClient

client = PixverseClient(
    email="user@example.com",
    password="password"
)
```

**Pros**:
- ✅ Simple
- ✅ No extra dependencies

**Cons**:
- ⚠️ Requires storing password
- ⚠️ May not work for Google accounts

---

### 2. Google OAuth (Playwright)

Browser-based Google OAuth flow.

**Installation**:
```bash
pip install pixverse-py[playwright]
playwright install chromium
```

**Usage**:
```python
from pixverse import PixverseClient

client = PixverseClient(
    email="user@gmail.com",
    password="google_password"
)

# Login with Google OAuth
session = client.auth.login(
    "user@gmail.com",
    "google_password",
    method="google"  # Use Google OAuth
)
```

**Pros**:
- ✅ Works with Google accounts
- ✅ Handles OAuth flow automatically
- ✅ Saves session for reuse

**Cons**:
- ⚠️ Requires Playwright (~100MB)
- ⚠️ Opens browser window (can be headless)

---

### 3. Session Refresh (Smart) ⭐ **RECOMMENDED**

Refreshes session using existing JWT token and cookies.

**Features**:
- **Fast-path**: Validates session via API (no browser) ⚡
- **Fallback**: Uses Playwright if API validation fails
- **JWT handling**: Automatic token extraction and refresh

**Usage**:
```python
import json
from pixverse import PixverseClient

# Initial login (any method)
client = PixverseClient(email="...", password="...")
session = client.auth.login("...", "...")

# Save session
with open("session.json", "w") as f:
    json.dump(session, f)

# Later: Restore and refresh (NO PASSWORD NEEDED!)
with open("session.json") as f:
    session = json.load(f)

# Refresh session (FAST - tries API first!)
refreshed = client.auth.refresh(session)

# Use refreshed session
client = PixverseClient(session=refreshed)
video = client.create(prompt="a cat")
```

**Pros**:
- ✅ **FAST** - API validation (no browser)
- ✅ No password needed
- ✅ Works for any account type
- ✅ Automatic JWT token handling
- ✅ Falls back to browser if needed

**Cons**:
- ⚠️ Requires initial login first

---

## Session Data Structure

Session contains:

```python
{
    "cookies": {
        "_ai_token": "jwt_token_here",
        "session_id": "...",
        # ... other cookies
    },
    "headers": {
        "token": "jwt_token_here",  # Extracted from cookies
        "Authorization": "Bearer jwt_token_here"  # Optional
    }
}
```

The library automatically:
1. Extracts JWT token from cookies
2. Adds to headers for API calls
3. Validates via API (fast-path)
4. Falls back to browser if needed

---

## Flow Diagram

### First-Time Login

```
User                                Google OAuth
┌─────┐                            ┌─────────┐
│     │  login(email, pass)        │         │
│     │─────────────────────────>  │ Opens   │
│     │                            │ Browser │
│     │  <─── OAuth Flow ──>       │         │
│     │  <─── Session Data ───     │         │
└─────┘                            └─────────┘
   │
   │ Save session.json
   └──> {"cookies": {...}, "headers": {...}}
```

### Session Refresh (Fast-Path)

```
User                  API Check        Playwright
┌─────┐              ┌────────┐       ┌──────────┐
│     │ refresh()    │        │       │          │
│     │─────────────>│ Test   │       │ (not     │
│     │              │ JWT    │       │  used)   │
│     │ <───OK───────│ Token  │       │          │
└─────┘              └────────┘       └──────────┘
                         ⚡
                      ~100ms
```

### Session Refresh (Fallback)

```
User                  API Check        Playwright
┌─────┐              ┌────────┐       ┌──────────┐
│     │ refresh()    │        │       │          │
│     │─────────────>│ Test   │       │          │
│     │              │ JWT    │       │          │
│     │ <───FAIL─────│ (401)  │       │          │
│     │                                │          │
│     │──────────────────────────────>│ Open     │
│     │                                │ Browser  │
│     │ <────── Fresh Session ─────────│ Refresh  │
└─────┘                                └──────────┘
                                          ~2-3s
```

---

## Best Practices

### 1. Use Session Refresh for Production

```python
# Initial setup (once)
client = PixverseClient(email="...", password="...")
session = client.auth.login("...", "...", method="google")
save_session(session)

# Production (fast refresh)
def get_client():
    session = load_session()
    refreshed = client.auth.refresh(session)  # Fast API check
    return PixverseClient(session=refreshed)
```

### 2. Handle Refresh Failures

```python
from pixverse import AuthenticationError

try:
    session = client.auth.refresh(old_session)
except AuthenticationError:
    # Session completely expired, need full re-login
    session = client.auth.login(email, password)
```

### 3. Automatic Refresh in Long-Running Apps

```python
class PixverseManager:
    def __init__(self, session_file):
        self.session_file = session_file
        self.session = self.load_session()
        self.last_refresh = time.time()

    def get_client(self):
        # Refresh every hour
        if time.time() - self.last_refresh > 3600:
            self.session = PixverseAuth().refresh(self.session)
            self.last_refresh = time.time()
            self.save_session()

        return PixverseClient(session=self.session)
```

---

## JWT Token Handling

The library automatically:

1. **Extracts** JWT token from cookies (`_ai_token`)
2. **Adds** to request headers (`token`, `Authorization`)
3. **Validates** via API calls
4. **Refreshes** when needed

You don't need to handle tokens manually!

---

## Installation Options

```bash
# Basic (email/password only)
pip install pixverse-py

# With Playwright (Google OAuth + Session refresh fallback)
pip install pixverse-py[playwright]
playwright install chromium

# Full (all features)
pip install pixverse-py[full]
```

---

## Comparison

| Feature | Email/Password | Google OAuth | Session Refresh |
|---------|---------------|--------------|-----------------|
| **Speed** | Medium | Slow | ⚡ **FAST** |
| **Google Accounts** | ❌ | ✅ | ✅ |
| **No Password** | ❌ | ❌ | ✅ |
| **Browser Required** | ❌ | ✅ | ⚠️ Fallback |
| **Playwright Required** | ❌ | ✅ | ⚠️ Optional |
| **JWT Handling** | Manual | Auto | ✅ Auto |

---

## Recommended Workflow

1. **Initial Setup**: Use Google OAuth or Email/Password
2. **Save Session**: Store session.json securely
3. **Production**: Use Session Refresh (fast-path via API)
4. **Fallback**: Playwright refresh if API fails
5. **Re-auth**: Full login if session completely expired

---

## Security Notes

- ✅ Session files contain sensitive tokens - store securely
- ✅ JWT tokens expire - library handles refresh
- ✅ Don't commit session.json to git (add to .gitignore)
- ✅ Use environment variables for production credentials

---

**Recommended**: Use Google OAuth for initial login, then Session Refresh for all subsequent requests!
