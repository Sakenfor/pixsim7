# @pixsim7/plugins.stealth

Self-contained stealth plugin for PixSim7. Provides pickpocket and stealth mechanics.

This plugin demonstrates the **external plugin** pattern where all code (frontend, backend, shared types) lives in a single package directory.

## Structure

```
packages/plugins/stealth/
├── package.json          # Package manifest with pixsim metadata
├── shared/
│   └── types.ts          # Canonical types (single source of truth)
├── backend/
│   ├── __init__.py       # Python package marker
│   ├── manifest.py       # Plugin manifest + FastAPI routes
│   └── models.py         # Pydantic models aligned with shared/types.ts
├── frontend/
│   ├── plugin.ts         # Type re-exports and documentation
│   └── index.ts          # Frontend entry (types re-export)
├── tsconfig.json         # TypeScript configuration
└── README.md
```

## How It Works

The stealth plugin uses **dynamic discovery** from the external plugins directory:

1. **Backend Discovery** (`packages/plugins/stealth/backend/manifest.py`):
   - Plugin manager scans `packages/plugins/*/backend/` for plugins
   - Finds `manifest.py` and loads the `manifest` and `router` exports
   - Registers the plugin with the FastAPI app
   - Defines `frontend_manifest` with interaction manifests
   - Each manifest includes: `id`, `configSchema`, `apiEndpoint`, `defaultConfig`

2. **Frontend Dynamic Loading** (at app startup):
   - `GET /api/v1/admin/plugins/frontend/all` returns all plugin manifests
   - `dynamicLoader.ts` creates `InteractionPlugin` from each manifest
   - Registers with `interactionRegistry`

3. **Types Sharing**:
   - TypeScript types in `shared/types.ts` (single source of truth)
   - Python Pydantic models in `backend/models.py` (manually aligned)

## Usage

### Import Types

```typescript
import type {
  PickpocketConfig,
  PickpocketRequest,
  PickpocketResponse,
} from '@pixsim7/plugins.stealth/types';
```

### Dynamic Loading (Automatic)

```typescript
// In app initialization (apps/main/src/main.tsx or similar)
import { initializeInteractions } from '@/lib/game/interactions';

// Loads all plugin interactions including pickpocket
await initializeInteractions();
```

### Use the Interaction

Once loaded, pickpocket is available through the interaction registry:

```typescript
import { interactionRegistry } from '@/lib/game/interactions';

const pickpocket = interactionRegistry.get('pickpocket');
if (pickpocket) {
  const result = await pickpocket.execute(config, context);
}
```

## Manifest Shape

### Frontend Interaction Manifest

```typescript
interface FrontendInteractionManifest {
  id: string;           // 'pickpocket'
  name: string;         // 'Pickpocket'
  icon: string;         // pinching hand emoji
  category: string;     // 'stealth'
  apiEndpoint: string;  // '/game/stealth/pickpocket'
  configSchema: JsonSchema;
  defaultConfig: Record<string, unknown>;
  uiMode: 'dialogue' | 'notification' | 'silent' | 'custom';
  capabilities: {
    modifiesInventory?: boolean;
    affectsRelationship?: boolean;
    hasRisk?: boolean;
    canBeDetected?: boolean;
  };
}
```

### Config Schema (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "baseSuccessChance": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.4
    },
    "detectionChance": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.3
    }
  }
}
```

The frontend's `jsonSchemaToConfigFields()` converts this to form fields automatically.

## API Endpoints

- `GET /api/v1/admin/plugins/frontend/all` - List all frontend manifests
- `GET /api/v1/admin/plugins/{plugin_id}/frontend` - Get specific plugin manifest
- `POST /api/v1/game/stealth/pickpocket` - Execute pickpocket interaction

## Type Synchronization

Types are defined once in `shared/types.ts`. Backend Pydantic models in `backend/models.py` are manually aligned. When updating types:

1. Update `shared/types.ts` first
2. Update `backend/models.py` to match
3. Ensure field names align (TypeScript camelCase, Python snake_case for API)
