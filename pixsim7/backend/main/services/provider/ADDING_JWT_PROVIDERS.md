# Adding JWT-Based Providers

If you're adding a new provider that uses JWT bearer tokens (like Sora, Runway, Midjourney, etc.), follow this guide.

## Step 1: Configure JWT Field Mappings

Each provider has different JWT payload structures. Define where to find fields in **YOUR** provider's JWT.

### Example: Sora (OpenAI)

OpenAI uses custom claim namespaces like `https://api.openai.com/profile`:

```python
# sora.py
from pixsim7.backend.main.shared.jwt_helpers import JWTExtractor

class SoraProvider(Provider):
    JWT_EXTRACTOR = JWTExtractor(
        email_paths=[
            "https://api.openai.com/profile.email",  # OpenAI's custom claim
            "email",  # Standard fallback
        ],
        user_id_paths=[
            "https://api.openai.com/auth.user_id",
            "sub",
        ],
        username_paths=["name", "username"]
    )
```

**JWT Payload Example:**
```json
{
  "https://api.openai.com/profile": {
    "email": "user@example.com"
  },
  "https://api.openai.com/auth": {
    "user_id": "user-ABC123"
  },
  "sub": "google-oauth2|123456",
  "name": "John Doe"
}
```

### Example: Runway (Hypothetical)

If Runway uses a simpler JWT structure:

```python
# runway.py
class RunwayProvider(Provider):
    JWT_EXTRACTOR = JWTExtractor(
        email_paths=["email", "user.email"],
        user_id_paths=["user_id", "sub", "id"],
        username_paths=["username", "user.name", "name"]
    )
```

**JWT Payload Example:**
```json
{
  "email": "user@example.com",
  "user_id": "runway_12345",
  "username": "john_doe",
  "sub": "auth0|67890"
}
```

### Example: Generic Provider

Most standard JWTs follow a common pattern:

```python
class GenericProvider(Provider):
    JWT_EXTRACTOR = JWTExtractor(
        email_paths=["email"],
        user_id_paths=["sub", "user_id"],
        username_paths=["preferred_username", "username", "name"]
    )
```

## Step 2: Use in extract_account_data()

The extraction is the same for all providers:

```python
async def extract_account_data(self, raw_data: Dict[str, Any]) -> Dict[str, Any]:
    # Get bearer token from raw_data
    bearer_token = raw_data.get("bearer_token")
    if not bearer_token:
        raise ValueError("Bearer token required")

    # Extract using configured paths
    jwt_data = self.JWT_EXTRACTOR.extract(bearer_token)

    return {
        "jwt_token": bearer_token,
        "email": jwt_data.get("email"),
        "account_id": jwt_data.get("user_id"),
        "username": jwt_data.get("username"),
        # ... provider-specific fields
    }
```

**That's it!** No manual base64 decoding, no hardcoded field paths.

## Step 3: Custom Fields (Optional)

If your provider has unique JWT fields:

```python
JWT_EXTRACTOR = JWTExtractor(
    email_paths=["email"],
    user_id_paths=["sub"],
    username_paths=["username"],
    custom_fields={
        "organization": ["org", "organization_id"],
        "tier": ["subscription.tier", "tier", "plan"],
        "credits": ["credits.remaining", "credits"]
    }
)

# Later:
jwt_data = self.JWT_EXTRACTOR.extract(bearer_token)
org_id = jwt_data.get("organization")
tier = jwt_data.get("tier")
```

## How It Works

### Path Resolution

The extractor tries each path in order until it finds a value:

```python
email_paths = [
    "https://api.openai.com/profile.email",  # Try custom claim first
    "user.email",                             # Try nested path
    "email"                                   # Try root level
]
```

### Nested Paths

Use dot notation for nested objects:

```json
{
  "user": {
    "profile": {
      "email": "test@example.com"
    }
  }
}
```

```python
email_paths = ["user.profile.email"]
```

### Validation

The helpers automatically validate:
- **Email**: Must contain `@`
- **User ID**: Must be non-empty
- **Username**: Must be non-empty

## Extension Integration

The extension must capture the bearer token:

```javascript
// content.js
const PROVIDER_DETECTORS = {
  runway: {
    domains: ['runwayml.com'],
    detectAuth: () => !!getCookie('session'),
    needsBearerToken: true  // ← Add this flag
  }
}
```

The rest is automatic! Extension injects bearer token capture script and sends to backend.

## JWT Debugging

If extraction fails, check what's in your JWT:

```python
from pixsim7.backend.main.shared.jwt_helpers import parse_jwt_payload

payload = parse_jwt_payload(bearer_token)
print(json.dumps(payload, indent=2))
```

Then configure paths based on the actual structure.

## Benefits

✅ **No code duplication** - Shared JWT parsing logic
✅ **No hardcoded paths** - Configure per provider
✅ **No manual base64** - Utility handles it
✅ **Fallback support** - Try multiple paths
✅ **Easy debugging** - Clear error messages
✅ **Future-proof** - Add providers without touching core code

## Real-World Examples

### Auth0-based Provider
```python
JWT_EXTRACTOR = JWTExtractor(
    email_paths=["email"],
    user_id_paths=["sub"],  # Format: "auth0|123456"
    username_paths=["nickname", "username", "name"]
)
```

### Firebase-based Provider
```python
JWT_EXTRACTOR = JWTExtractor(
    email_paths=["email"],
    user_id_paths=["user_id", "sub"],
    username_paths=["name", "display_name"],
    custom_fields={
        "firebase_uid": ["uid"]
    }
)
```

### Custom OAuth Provider
```python
JWT_EXTRACTOR = JWTExtractor(
    email_paths=["profile.email", "email"],
    user_id_paths=["id", "user_id"],
    username_paths=["profile.username", "username"],
    custom_fields={
        "avatar": ["profile.avatar_url", "avatar"],
        "plan": ["subscription.plan", "plan"]
    }
)
```

---

**Bottom Line:** Adding a new JWT provider takes **5 lines of code**, not 50+ lines of copy-pasted base64 decoding!

## Pixverse-Specific Notes (Auto-Reauth & Global Passwords)

For Pixverse, we support **password-based auto-reauth** using either:

- A per-account password stored on the `ProviderAccount` (`account.password`), or
- A **global provider password** configured via `/api/v1/providers/{provider_id}/settings`.

The flow is:

- `PixverseSessionManager._maybe_auto_reauth` checks:
  - `auth_method` (from `account.provider_metadata["auth_method"]`) allows password reauth (`!= "google"`).
  - Provider settings have `auto_reauth_enabled=True`.
  - Either `account.password` **or** `provider_settings.global_password` is set.

- If those conditions pass, `_try_auto_reauth` will attempt login using:
  - `account.password` if present, otherwise `provider_settings.global_password`.

- For OAuth-only Pixverse accounts:
  - When Pixverse responds with “Please sign in via OAuth (Google, Discord, Apple)…”,
    `_try_auto_reauth` marks `auth_method="google"` and clears `account.password`.
  - This ensures auto-reauth is fully skipped for OAuth-only accounts, even if a global password is configured.

When adding similar behavior for other providers, follow the same pattern:

- Keep the `SessionManager` in control of *when* to trigger auto-reauth (based on error classification + settings).
- Keep provider-specific `_try_auto_reauth` methods in control of *how* to authenticate (per-account vs global password).
