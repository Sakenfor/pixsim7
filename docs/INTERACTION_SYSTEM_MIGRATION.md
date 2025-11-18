# NPC Interaction System: Complete Plugin Migration

## Summary

The NPC interaction system has been fully migrated from a hybrid state (with special-cased "talk" handling and legacy field support) to a clean, fully plugin-based architecture. All interactions are now first-class plugins with rich metadata for UI hints.

## Changes Made

### 1. Added UI Metadata to Plugin Interface

**New fields in `InteractionPlugin`:**

- `uiMode?: InteractionUIMode` - How the 2D UI should respond
  - `'dialogue'` - Opens dialogue UI (e.g., Talk)
  - `'notification'` - Shows notification only (e.g., Pickpocket)
  - `'silent'` - No UI feedback
  - `'custom'` - Plugin handles its own UI

- `capabilities?: InteractionCapabilities` - What the interaction does
  - `opensDialogue` - Opens dialogue interface
  - `modifiesInventory` - Adds/removes items
  - `affectsRelationship` - Changes affinity/trust/chemistry
  - `triggersEvents` - Triggers game events
  - `hasRisk` - Has success/failure states
  - `requiresItems` - Requires items in inventory
  - `consumesItems` - Consumes items from inventory
  - `canBeDetected` - Can be detected (stealth)

**Location:** `frontend/src/lib/game/interactions/types.ts:185-218`

### 2. Updated All Builtin Plugins

All plugins now include comprehensive metadata:

**Talk Plugin** (`talk.ts:19-88`)
```typescript
uiMode: 'dialogue',
capabilities: {
  opensDialogue: true,
  affectsRelationship: true,
}
```

**Pickpocket Plugin** (`pickpocket.ts:21-47`)
```typescript
uiMode: 'notification',
capabilities: {
  modifiesInventory: true,
  affectsRelationship: true,
  hasRisk: true,
  canBeDetected: true,
}
```

**Give Item Plugin** (`giveItem.ts:18-45`)
```typescript
uiMode: 'custom',
capabilities: {
  opensDialogue: true,
  modifiesInventory: true,
  affectsRelationship: true,
  requiresItems: true,
  consumesItems: true,
}
```

**Persuade Plugin** (`persuade.ts:155-211`)
```typescript
uiMode: 'custom',
capabilities: {
  opensDialogue: true,
  affectsRelationship: true,
  hasRisk: true,
  triggersEvents: true,
}
```

### 3. Removed Special-Casing of 'Talk'

**Before** (`executor.ts:86-92`):
```typescript
if (interactionId === 'talk') {
  hasTalkInteraction = true;
  if (handlers.onDialogue) {
    handlers.onDialogue(assignment.npcId);
  }
  continue;
}
```

**After** (`executor.ts:85-108`):
```typescript
const plugin = (await import('./index')).interactionRegistry.get(interactionId);

if (plugin?.uiMode === 'dialogue') {
  hasDialogueInteraction = true;
  await executeInteraction(interactionId, config, context);
  if (handlers.onDialogue) {
    handlers.onDialogue(assignment.npcId);
  }
  continue;
}
```

Now **any plugin** with `uiMode: 'dialogue'` gets special UI handling, not just hardcoded "talk".

### 4. Deprecated Legacy Normalizer

**Changes:**
- Added deprecation warning when legacy format detected
- Added comprehensive JSDoc explaining migration path
- Legacy support maintained for backward compatibility

**Location:** `frontend/src/lib/game/interactions/executor.ts:17-90`

**Legacy format (deprecated):**
```typescript
{
  canTalk: true,
  npcTalk: { preferredSceneId: 123 },
  canPickpocket: true,
}
```

**New format:**
```typescript
{
  talk: { enabled: true, preferredSceneId: 123 },
  pickpocket: { enabled: true, baseSuccessChance: 0.4 },
}
```

### 5. Cleaned Up NpcSlotEditor

**Removed** legacy migration code from `NpcSlotEditor.tsx:341-345`:

**Before:**
```typescript
// Migration: Convert old format to new format
if (plugin.id === 'talk') {
  if ((interactions as any).canTalk) {
    config = { enabled: true, ...(interactions as any).npcTalk };
  } else if ((interactions as any).talk) {
    config = (interactions as any).talk;
  }
}
```

**After:**
```typescript
// Get config for this plugin (new format only)
const config = (interactions as any)[plugin.id] || null;
```

The normalizer in `executor.ts` handles legacy format conversion, so the editor doesn't need to duplicate this logic.

### 6. Created Comprehensive Documentation

**New file:** `docs/INTERACTION_PLUGIN_MANIFEST.md`

This document defines the shared contract between frontend and backend for interaction plugins, including:

- Complete plugin interface specification
- UI metadata definitions and examples
- Configuration format specification
- Migration guide from legacy to plugin format
- Best practices for creating new plugins
- Future enhancement plans

## Benefits

### 1. No More Special Cases

- "Talk" is just another plugin, not hardcoded
- Any plugin can open dialogue by setting `uiMode: 'dialogue'`
- Executor uses metadata, not plugin IDs

### 2. Rich UI Hints

The 2D UI can now:
- Show different icons based on `capabilities`
- Warn users about risky interactions (`hasRisk: true`)
- Indicate which interactions modify inventory
- Display appropriate feedback based on `uiMode`

### 3. Easier to Add New Interactions

**Before:** Create plugin, update executor special cases, update NpcSlotEditor

**After:** Create plugin file, register it. Done!

### 4. Cleaner Code

- NpcSlotEditor is simpler (no migration logic)
- Executor is more generic (metadata-driven)
- Plugins are self-describing

### 5. Foundation for Backend Symmetry

The plugin manifest provides a clear contract for future backend implementation. See `docs/BACKEND_INTERACTION_DISPATCHER.md` for plans.

## Breaking Changes

### None (Backward Compatible)

- Legacy format still works (with deprecation warning)
- Special-cased "talk" behavior preserved
- Existing slots continue to function

## Future Work

### Short Term

1. **Add UI indicators** for capabilities in NpcSlotEditor
   - Show icons for risky/inventory/relationship interactions
   - Color-code by category

2. **Implement uiMode in Game2D**
   - Different visual feedback based on `uiMode`
   - Show capability hints on hover

### Long Term

1. **Backend Plugin System** (See `BACKEND_INTERACTION_DISPATCHER.md`)
   - Mirror frontend plugin architecture
   - Server-side validation and execution
   - NPC AI can trigger interactions

2. **Shared Schema Validation**
   - JSON Schema for config validation
   - Shared between frontend and backend

3. **Conditional Config Fields**
   - Show/hide fields based on other values
   - More dynamic plugin configuration

## Testing

All changes tested:
- ✅ TypeScript compilation passes
- ✅ No runtime errors
- ✅ Legacy format still works (with warning)
- ✅ New plugin metadata accessible
- ✅ Executor uses `uiMode` correctly

## Files Changed

### Core System
- `frontend/src/lib/game/interactions/types.ts` - Added UI metadata types
- `frontend/src/lib/game/interactions/executor.ts` - Removed special-casing, deprecated legacy normalizer
- `frontend/src/lib/game/interactions/index.ts` - Export new types

### Plugins
- `frontend/src/lib/game/interactions/talk.ts` - Added metadata
- `frontend/src/lib/game/interactions/pickpocket.ts` - Added metadata
- `frontend/src/lib/game/interactions/giveItem.ts` - Added metadata
- `frontend/src/lib/game/interactions/persuade.ts` - Added metadata

### UI
- `frontend/src/components/NpcSlotEditor.tsx` - Cleaned up legacy migration code

### Documentation
- `docs/INTERACTION_PLUGIN_MANIFEST.md` - Complete plugin specification (NEW)
- `docs/INTERACTION_SYSTEM_MIGRATION.md` - This file (NEW)

## Migration Instructions

### For Content Creators

No action needed! Legacy format still works, but you'll see console warnings. To migrate:

**Old:**
```typescript
interactions: {
  canTalk: true,
  npcTalk: { preferredSceneId: 123 }
}
```

**New:**
```typescript
interactions: {
  talk: { enabled: true, preferredSceneId: 123 }
}
```

### For Plugin Developers

When creating new plugins, always include:

```typescript
{
  id: 'my_plugin',
  name: 'My Plugin',
  description: '...',
  icon: '✨',
  category: 'social',
  version: '1.0.0',
  tags: ['tag1', 'tag2'],

  // NEW: Add these!
  uiMode: 'notification',
  capabilities: {
    affectsRelationship: true,
    hasRisk: true,
  },

  // ... rest of plugin
}
```

See `docs/INTERACTION_PLUGIN_MANIFEST.md` for complete guide.

## Conclusion

The NPC interaction system is now fully plugin-based with no special cases or legacy coupling. All interactions are first-class plugins with rich metadata that enables better UI feedback and easier extensibility.

The system is ready for:
- Adding new interaction types with minimal code
- Future backend symmetry
- Enhanced UI/UX based on plugin capabilities
