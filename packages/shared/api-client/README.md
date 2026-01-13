# @pixsim7/shared.api-client

Environment-neutral API client for PixSim7. Works in browser, Node.js, Electron, and Tauri.

## Features

- **Environment-neutral core**: No browser-specific dependencies (localStorage, window)
- **Token provider pattern**: Inject your own token storage mechanism
- **Standardized error handling**: Consistent error responses with typed utilities
- **TypeScript first**: Full type safety with exported interfaces

## Installation

```bash
pnpm add @pixsim7/shared.api-client
```

## Usage

### Browser (React/Vue/Svelte)

```typescript
import { createApiClient } from '@pixsim7/shared.api-client';
import {
  createBrowserTokenProvider,
  computeBackendUrl,
} from '@pixsim7/shared.api-client/browser';

// Create the client
const client = createApiClient({
  baseUrl: computeBackendUrl({
    envUrl: import.meta.env.VITE_BACKEND_URL,
    defaultPort: 8001,
  }),
  tokenProvider: createBrowserTokenProvider(),
  onUnauthorized: () => {
    // Redirect to login on 401
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  },
});

// Make requests
const assets = await client.get<Asset[]>('/assets');
await client.post('/assets', { name: 'New Asset' });
```

### Node.js / Electron / Tauri

```typescript
import { createApiClient, type TokenProvider } from '@pixsim7/shared.api-client';

// Implement your own token provider
const tokenProvider: TokenProvider = {
  getAccessToken: async () => {
    // Read from secure storage, keychain, etc.
    return await secureStorage.get('access_token');
  },
  setAccessToken: async (token) => {
    if (token) {
      await secureStorage.set('access_token', token);
    } else {
      await secureStorage.delete('access_token');
    }
  },
  clearTokens: async () => {
    await secureStorage.clear();
  },
};

// Create the client
const client = createApiClient({
  baseUrl: 'http://localhost:8001',
  tokenProvider,
});

// Make requests
const version = await client.getVersion();
console.log(`API version: ${version.api_version}`);
```

### Domain clients

Reusable domain helpers live under `@pixsim7/shared.api-client/domains` and accept a `PixSimApiClient`:

```ts
import { createApiClient } from '@pixsim7/shared.api-client';
import { createAssetsApi } from '@pixsim7/shared.api-client/domains';

const client = createApiClient({ baseUrl: 'http://localhost:8000' });
const assets = createAssetsApi(client);

const list = await assets.listAssets({ limit: 20 });
```

### Error Handling

```typescript
import {
  extractErrorMessage,
  isValidationError,
  getFieldError,
  isNotFoundError,
  ErrorCodes,
} from '@pixsim7/shared.api-client';

try {
  await client.post('/assets', data);
} catch (err) {
  // Get user-friendly error message
  const message = extractErrorMessage(err, 'Failed to create asset');

  // Check for specific error types
  if (isValidationError(err)) {
    const emailError = getFieldError(err, 'email');
    if (emailError) {
      setFieldError('email', emailError);
    }
  } else if (isNotFoundError(err)) {
    showNotFound();
  } else {
    showToast({ type: 'error', message });
  }
}
```

## API Reference

### `createApiClient(config: ApiClientConfig)`

Creates a new API client instance.

**Config options:**
- `baseUrl`: Backend URL (without `/api/v1` suffix)
- `tokenProvider`: Token provider for authentication
- `apiPath`: API path prefix (default: `/api/v1`)
- `timeout`: Request timeout in ms (default: 30000)
- `onUnauthorized`: Callback for 401 responses

### `TokenProvider` interface

```typescript
interface TokenProvider {
  getAccessToken(): Promise<string | null> | string | null;
  setAccessToken?(token: string | null): Promise<void> | void;
  clearTokens?(): Promise<void> | void;
}
```

### Error utilities

- `extractErrorMessage(error, fallback)` - Get user-friendly message
- `getErrorResponse(error)` - Get typed ErrorResponse
- `getErrorCode(error)` - Get error code
- `isErrorCode(error, code)` - Check error code
- `getValidationErrors(error)` - Get field-level errors
- `getFieldError(error, field)` - Get specific field error
- `isHttpError(error, status)` - Check HTTP status
- `isNetworkError(error)` - Check for network errors
- `isUnauthorizedError(error)` - Check for 401
- `isValidationError(error)` - Check for 422
- `isNotFoundError(error)` - Check for 404
- `isConflictError(error)` - Check for 409

### Browser utilities

- `createBrowserTokenProvider(options)` - localStorage-based token provider
- `computeBackendUrl(options)` - Compute backend URL from environment
- `computeWebSocketUrl(baseUrl, path)` - Convert HTTP URL to WebSocket URL

## Error Response Format

All API errors follow this format:

```typescript
interface ErrorResponse {
  code: string;       // Machine-readable code (e.g., 'validation_error')
  message: string;    // Human-readable message
  detail?: string;    // Additional details
  fields?: Array<{    // Validation field errors
    loc: (string | number)[];
    msg: string;
    type: string;
  }>;
  request_id?: string; // For debugging
}
```
