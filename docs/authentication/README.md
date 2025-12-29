# Authentication & Security

Documentation for authentication, security, and device automation.

## Authentication

- **[PASSWORD_SUPPORT_FOR_AUTO_REFRESH.md](./PASSWORD_SUPPORT_FOR_AUTO_REFRESH.md)** - Password storage for automatic JWT refresh
  - Credential storage
  - JWT refresh flows
  - Security considerations

## Storage Abstraction (Desktop Client Support)

All authentication token and user data storage is abstracted via `AuthStorageProvider` to support multiple platforms:

```typescript
// Browser (default) - uses localStorage
import { authService } from '@lib/auth/authService';
authService.getStoredToken(); // Works out of the box

// Desktop (Electron/Tauri) - use secure storage
import { setAuthStorageProvider } from '@lib/auth/authService';

setAuthStorageProvider({
  getAccessToken: () => secureStorage.get('access_token'),
  setAccessToken: (token) => secureStorage.set('access_token', token),
  getUser: () => secureStorage.get('user'),
  setUser: (user) => secureStorage.set('user', user),
  clearAll: () => secureStorage.clear(),
});
```

**Important:** Always use `authService.getStoredToken()` instead of direct `localStorage.getItem('access_token')` to ensure desktop compatibility.

See also: `serverManagerStore.ts` uses `StorageAdapter` for multi-server token storage.

## Device Automation & Extensions

- **[ANDROID_LOGIN_AUTOMATION.md](./ANDROID_LOGIN_AUTOMATION.md)** - Android device login automation architecture
  - Device automation
  - Login flows
  - Android integration

- **[EXTENSION_FLOWS.md](./EXTENSION_FLOWS.md)** - Chrome extension end-to-end flows
  - Extension architecture
  - Upload flows
  - Quick generation
  - Login automation

---

**Related:** See [../getting-started/](../getting-started/) for initial setup and [../frontend/](../frontend/) for client-side implementation.
