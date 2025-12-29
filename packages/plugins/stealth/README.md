# @pixsim7/plugin-stealth

Self-contained stealth plugin for PixSim7. Provides pickpocket and stealth mechanics.

## Structure

```
packages/plugins/stealth/
├── package.json          # Package manifest with pixsim metadata
├── shared/
│   └── types.ts          # Canonical types (single source of truth)
├── backend/
│   └── models.py         # Pydantic models aligned with shared/types.ts
├── frontend/
│   ├── plugin.ts         # Documentation/example (types re-export)
│   └── index.ts          # Frontend entry (types re-export)
└── README.md
```

## How It Works

The stealth plugin uses **dynamic discovery**:

1. **Backend** (`pixsim7/backend/main/plugins/game_stealth/manifest.py`):
   - Defines `frontend_manifest` with interaction manifests
   - Each manifest includes: `id`, `configSchema`, `apiEndpoint`, `defaultConfig`

2. **Frontend** fetches manifests at startup:
   - `GET /api/v1/admin/plugins/frontend/all`
   - `dynamicLoader.ts` creates `InteractionPlugin` from each manifest
   - Registers with `interactionRegistry`

3. **Types** are shared:
   - TypeScript types in `shared/types.ts`
   - Python Pydantic models in `backend/models.py` (manually aligned)

## Usage

### Import Types

```typescript
import type {
  PickpocketConfig,
  PickpocketRequest,
  PickpocketResponse,
} from '@pixsim7/plugin-stealth/types';
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
