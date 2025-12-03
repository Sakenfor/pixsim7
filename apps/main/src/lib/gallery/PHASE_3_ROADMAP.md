# Phase 3 Roadmap: User-Configurable Asset Sources

## Current State (Phase 2) ✅

- **Source Types** defined: `remote-gallery`, `local-fs`
- **Static instances**: One hard-coded instance per type
- **No DB storage**: Sources are registered at startup in code
- **No user configuration**: Users can't add their own sources yet

## Phase 3 Goals

Allow users to add and configure their own asset sources through the UI.

Example use cases:
- User adds "My Work Drive" (Google Drive type)
- User adds "Design Inspiration" (Pinterest type)
- User adds "Client Assets" (Dropbox type)
- Multiple instances of the same type with different configs

---

## Implementation Checklist

### 1. Backend: User Source Storage

**New DB Model** (`pixsim7/backend/main/domain/user/user_source.py`):

```python
class UserAssetSource(Base):
    __tablename__ = 'user_asset_sources'

    id: int
    user_id: int
    type_id: str              # 'google-drive', 'pinterest', etc.
    name: str                 # User-given name: "My Work Drive"
    config: dict              # Type-specific config (folderId, etc.)
    auth_tokens: dict         # Encrypted OAuth tokens
    enabled: bool = True
    created_at: datetime
    updated_at: datetime
```

**Migration**:
```bash
alembic revision -m "Add user_asset_sources table"
```

**API Endpoints** (`pixsim7/backend/main/api/v1/user_sources.py`):
- `GET /api/v1/user-sources` - List user's sources
- `POST /api/v1/user-sources` - Create new source
- `PUT /api/v1/user-sources/{id}` - Update source config
- `DELETE /api/v1/user-sources/{id}` - Remove source
- `POST /api/v1/user-sources/{id}/auth` - OAuth callback handler

---

### 2. Frontend: Source Type Extensions

**Update `sourceTypes.ts`**:

```typescript
export interface SourceConfigField {
  key: string;
  label: string;
  type: 'text' | 'url' | 'boolean' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface SourceTypeDefinition {
  // ... existing fields ...

  // NEW: Configuration schema for user setup
  configSchema?: {
    fields: SourceConfigField[];
    authType: 'oauth2' | 'api-key' | 'none';
    oauthProvider?: string; // 'google', 'pinterest', etc.
    oauthScopes?: string[];
  };

  // NEW: Factory to create controller from user config
  createController?: (config: SourceConfig) => SourceController;
}
```

**Register Google Drive Type**:

```typescript
registerSourceType({
  typeId: 'google-drive',
  name: 'Google Drive',
  icon: 'google-drive',
  category: 'cloud',
  description: 'Assets from Google Drive folders',
  component: GoogleDriveSource,

  configSchema: {
    fields: [
      {
        key: 'folderId',
        label: 'Folder ID (optional)',
        type: 'text',
        placeholder: 'Leave empty for root folder'
      },
      {
        key: 'includeShared',
        label: 'Include shared files',
        type: 'boolean'
      }
    ],
    authType: 'oauth2',
    oauthProvider: 'google',
    oauthScopes: [
      'https://www.googleapis.com/auth/drive.readonly'
    ]
  },

  createController: (config) => new GoogleDriveController(config)
});
```

---

### 3. Frontend: User Source Management UI

**Settings Panel** (`components/settings/SourcesSettings.tsx`):

```typescript
export function SourcesSettings() {
  const { data: userSources } = useUserSources();
  const sourceTypes = getAllSourceTypes();
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2>My Asset Sources</h2>
        <Button onClick={() => setShowAddDialog(true)}>
          Add Source
        </Button>
      </div>

      {/* User's configured sources */}
      <div className="grid gap-4">
        {userSources?.map(source => (
          <SourceCard
            key={source.id}
            source={source}
            onEdit={() => editSource(source)}
            onDelete={() => deleteSource(source)}
            onToggle={() => toggleSource(source)}
          />
        ))}
      </div>

      {/* Add source dialog */}
      {showAddDialog && (
        <AddSourceDialog
          sourceTypes={sourceTypes}
          onClose={() => setShowAddDialog(false)}
          onComplete={refetch}
        />
      )}
    </div>
  );
}
```

**Add Source Dialog** (`components/settings/AddSourceDialog.tsx`):

1. **Step 1**: Choose source type (Google Drive, Pinterest, etc.)
2. **Step 2**: Configure (fill out fields from `configSchema`)
3. **Step 3**: Authenticate (OAuth flow if needed)
4. **Step 4**: Name your source ("My Work Drive")

---

### 4. Frontend: Dynamic Source Registration

**Update `Assets.tsx`** to load user sources dynamically:

```typescript
export function AssetsRoute() {
  const { data: userSources } = useUserSources();

  // Register built-in sources (remote-gallery, local-fs)
  useEffect(() => {
    registerAssetSources();
  }, []);

  // Register user-created sources dynamically
  useEffect(() => {
    userSources?.forEach(userSource => {
      const sourceType = getSourceType(userSource.type_id);
      if (!sourceType || !userSource.enabled) return;

      // Create controller instance
      const controller = sourceType.createController?.(userSource.config);

      // Register as asset source
      registerAssetSource({
        id: userSource.id,
        label: userSource.name,
        icon: sourceType.icon,
        kind: sourceType.category,
        component: () => (
          <sourceType.component controller={controller} />
        )
      });
    });

    return () => {
      // Cleanup on unmount
      userSources?.forEach(s => unregisterAssetSource(s.id));
    };
  }, [userSources]);

  // ... rest of component
}
```

---

### 5. OAuth Flow

**Service** (`services/sourceAuth.ts`):

```typescript
export async function initiateOAuth(
  sourceType: SourceTypeDefinition
): Promise<AuthTokens> {
  const { oauthProvider, oauthScopes } = sourceType.configSchema!;

  // Open OAuth popup
  const popup = window.open(
    `/api/v1/oauth/${oauthProvider}/authorize?scopes=${oauthScopes.join(',')}`,
    'oauth',
    'width=600,height=700'
  );

  // Wait for callback
  return new Promise((resolve, reject) => {
    window.addEventListener('message', (event) => {
      if (event.data.type === 'oauth-success') {
        resolve(event.data.tokens);
      }
    });
  });
}
```

**Backend OAuth Handler** (`pixsim7/backend/main/api/v1/oauth.py`):

```python
@router.get('/oauth/{provider}/authorize')
async def oauth_authorize(provider: str, scopes: str):
    # Redirect to provider's OAuth page
    ...

@router.get('/oauth/{provider}/callback')
async def oauth_callback(provider: str, code: str):
    # Exchange code for tokens
    tokens = await exchange_oauth_code(provider, code)

    # Return tokens to popup
    return HTMLResponse(f"""
        <script>
            window.opener.postMessage({{
                type: 'oauth-success',
                tokens: {tokens}
            }}, '*');
            window.close();
        </script>
    """)
```

---

### 6. Example Source Implementations

**Google Drive** (`components/assets/sources/GoogleDriveSource.tsx`):

```typescript
class GoogleDriveController {
  constructor(private config: {
    folderId?: string;
    tokens: AuthTokens
  }) {}

  async fetchAssets() {
    const query = this.config.folderId
      ? `'${this.config.folderId}' in parents and mimeType contains 'image/'`
      : `mimeType contains 'image/'`;

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`,
      {
        headers: {
          Authorization: `Bearer ${this.config.tokens.accessToken}`
        }
      }
    );

    return response.json();
  }
}
```

---

## Estimated Effort

- **Backend (DB + API)**: ~4-6 hours
- **Frontend (Settings UI)**: ~6-8 hours
- **OAuth Flow**: ~4-6 hours
- **First Source Type (Google Drive)**: ~4-6 hours
- **Testing & Polish**: ~4-6 hours

**Total**: ~22-32 hours for full Phase 3 implementation

---

## Testing Strategy

1. **Unit tests** for source type registry
2. **API tests** for user source CRUD
3. **Integration tests** for OAuth flows
4. **E2E tests** for add/remove sources in UI
5. **Manual testing** with real Google Drive account

---

## Future Enhancements (Phase 4+)

- **Source plugins**: Allow community-developed source types
- **Sync settings**: Auto-refresh intervals, webhooks
- **Sharing**: Share source configs with team
- **Advanced auth**: API key rotation, token refresh
- **Source analytics**: Track usage per source
