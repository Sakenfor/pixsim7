# Romance Plugin

Self-contained external plugin for romance mechanics including sensual touch interactions.

## Structure

```
packages/plugins/romance/
├── shared/
│   └── types.ts          # Canonical TypeScript types (used by frontend & backend)
├── backend/
│   ├── __init__.py       # Package marker
│   └── manifest.py       # FastAPI routes + PluginManifest + frontend_manifest
├── frontend/
│   └── index.ts          # Type re-exports for frontend
└── README.md
```

## Features

- **Sensual Touch Interaction**: Gizmo-based minigame with various touch tools
- **NPC Preferences**: Each NPC has unique preferences for tools and patterns
- **Romance Progression**: Stage-based relationship progression (interested → dating → partner)
- **Tool Unlocking**: New tools unlock at relationship milestones
- **ECS Integration**: Uses component system for romance state

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/game/romance/sensual-touch` | POST | Attempt a sensual touch interaction |
| `/api/v1/game/romance/npc-preferences/{npc_id}` | GET | Get NPC romance preferences |
| `/api/v1/game/romance/tool-unlocks` | GET | Get tool unlock thresholds |

## Frontend Integration

The plugin exposes a `frontend_manifest` that the dynamic loader uses to register
the `sensual-touch` interaction. The actual gizmo tools (caress, feather, silk, etc.)
remain in the main app as they are UI concerns:

```
apps/main/src/features/gizmos/lib/core/registry-romance.ts
```

## Configuration Schema

```json
{
  "baseIntensity": 0.5,    // 0-1, touch intensity
  "duration": 30,           // seconds
  "pattern": "circular"     // circular, linear, spiral, wave, pulse
}
```

## Tool Unlock Levels

| Tool | Affinity Required |
|------|------------------|
| touch | 0 |
| hand-3d | 0 |
| caress | 10 |
| feather | 20 |
| silk | 40 |
| temperature | 60 |
| pleasure | 80 |

## Development

### Adding New Tools

1. Add tool type to `shared/types.ts` (`TouchToolId`)
2. Add unlock level to `TOOL_UNLOCK_LEVELS` in both:
   - `shared/types.ts`
   - `backend/manifest.py`
3. Create gizmo tool definition in `apps/main/.../registry-romance.ts`

### Testing

```bash
# Backend tests
pytest packages/plugins/romance/

# Frontend types
npx tsc --noEmit packages/plugins/romance/frontend/index.ts
```
