# Modular Interaction System - Refactor Guide

## Problem: Current Scattered Approach

### Adding "Give Item" interaction currently requires editing:

1. **frontend/src/lib/api/game.ts** (30 lines)
   ```typescript
   export interface GiveItemConfig {
     itemId: string;
     requiredRelationship: number;
     // ...
   }

   export interface NpcSlotInteractions {
     canTalk?: boolean;
     npcTalk?: NpcTalkConfig;
     canPickpocket?: boolean;
     pickpocket?: PickpocketConfig;
     canGiveItem?: boolean;  // ADD THIS
     giveItem?: GiveItemConfig;  // AND THIS
   }
   ```

2. **frontend/src/components/NpcSlotEditor.tsx** (80+ lines)
   ```tsx
   {/* Copy-paste the entire pickpocket form section */}
   <div className="space-y-2">
     <label className="flex items-center gap-2">
       <input type="checkbox" checked={...} />
       <span>Enable Give Item</span>
     </label>
     {slot.interactions?.canGiveItem && (
       <div className="ml-6 space-y-2">
         {/* 60 lines of form fields */}
       </div>
     )}
   </div>
   ```

3. **frontend/src/routes/Game2D.tsx** (30+ lines)
   ```typescript
   const handleNpcSlotClick = async (assignment) => {
     // ... existing if/else chain ...

     // ADD THIS
     if (interactions?.canGiveItem) {
       // 30 lines of handler logic
     }
   }
   ```

4. **pixsim7_backend/api/v1/game_items.py** (new file, 100+ lines)

5. **pixsim7_backend/main.py** (register router)

**Total: ~250 lines across 5 files, lots of copy-paste, easy to miss spots**

---

## Solution: Plugin System

### Adding "Give Item" with the new system:

1. **Create ONE file**: `frontend/src/lib/game/interactions/giveItem.ts` (80 lines)
   - Contains ALL the logic: types, UI config, handler, validation

2. **Register it**: Add ONE line to `interactions/index.ts`
   ```typescript
   import { giveItemInteraction } from './giveItem';
   interactionRegistry.register(giveItemInteraction);
   ```

**Total: 81 lines in 1 file, zero copy-paste, impossible to miss spots**

---

## Architecture Benefits

### 1. **Self-Contained Modules**
Each interaction is a complete unit:
```
interactions/
  ├── types.ts           # Base system (shared)
  ├── index.ts           # Registry (add one line per plugin)
  ├── talk.ts            # Talk plugin (80 lines, self-contained)
  ├── pickpocket.ts      # Pickpocket plugin (100 lines, self-contained)
  ├── giveItem.ts        # Give Item plugin (80 lines, self-contained)
  └── flirt.ts           # Future: Flirt plugin (just add and register)
```

### 2. **Generic UI Rendering**
`<InteractionConfigForm>` reads the plugin's `configFields` and auto-generates the UI:

```typescript
// Plugin defines the schema
configFields: [
  { type: 'text', key: 'itemId', label: 'Item ID' },
  { type: 'number', key: 'requiredRelationship', label: 'Min Relationship', min: 0, max: 100 },
]

// Component auto-renders the form
<InteractionConfigForm plugin={giveItemPlugin} config={config} onChange={...} />
```

No manual form code needed!

### 3. **Centralized Execution**
Instead of a massive if/else chain in `Game2D.tsx`:

```typescript
// OLD (scattered)
if (interactions?.canTalk) { /* 30 lines */ }
else if (interactions?.canPickpocket) { /* 30 lines */ }
else if (interactions?.canGiveItem) { /* 30 lines */ }
// ...10 more interactions = 300 lines

// NEW (centralized)
for (const [interactionId, config] of Object.entries(slot.interactions)) {
  if (config.enabled) {
    const result = await executeInteraction(interactionId, config, context);
    // Handle result (5 lines)
  }
}
```

### 4. **Easy Enable/Disable**
Want to disable pickpocket for testing?

```typescript
// In interactions/index.ts
// interactionRegistry.register(pickpocketInteraction);  // Just comment out
```

Want game mode without combat interactions?
```typescript
const PEACEFUL_MODE = true;

if (!PEACEFUL_MODE) {
  interactionRegistry.register(pickpocketInteraction);
  interactionRegistry.register(fightInteraction);
}
```

### 5. **Type Safety**
Each plugin is fully typed:
```typescript
const plugin: InteractionPlugin<PickpocketConfig> = {
  defaultConfig: {
    baseSuccessChance: 0.4,  // ✓ TypeScript knows this type
    invalidField: 'oops',    // ✗ Compile error
  },
  // ...
}
```

### 6. **Validation & Gates**
Each plugin can validate its config and check availability:

```typescript
validate(config) {
  if (config.baseSuccessChance > 1) {
    return 'Success chance must be ≤ 1';  // Shown in editor
  }
  return null;
}

isAvailable(context) {
  // Don't show pickpocket if NPC is a guard
  return !context.assignment.npcPresence?.state?.isGuard;
}
```

---

## Migration Path

### Phase 1: Create the infrastructure (done ✓)
- ✓ `interactions/types.ts` - Base types and registry
- ✓ `interactions/index.ts` - Registration
- ✓ `InteractionConfigForm.tsx` - Generic form component

### Phase 2: Port existing interactions
1. Create `talk.ts` plugin from current code
2. Create `pickpocket.ts` plugin from current code
3. Update `NpcSlotEditor` to use `InteractionConfigForm`
4. Update `Game2D` to use `executeInteraction`
5. Update data shape in `NpcSlot2d.interactions` (or keep backward compatible)

### Phase 3: Add new interactions easily
- `giveItem.ts` - 80 lines, one file
- `flirt.ts` - 80 lines, one file
- `trade.ts` - 80 lines, one file
- etc.

---

## Data Shape Evolution

### Current (scattered):
```json
{
  "interactions": {
    "canTalk": true,
    "npcTalk": { "preferredSceneId": 42 },
    "canPickpocket": true,
    "pickpocket": { "baseSuccessChance": 0.4 }
  }
}
```

### New (plugin-based):
```json
{
  "interactions": {
    "talk": {
      "enabled": true,
      "preferredSceneId": 42
    },
    "pickpocket": {
      "enabled": true,
      "baseSuccessChance": 0.4
    },
    "give_item": {
      "enabled": true,
      "itemId": "flower",
      "requiredRelationship": 25
    }
  }
}
```

Keyed by plugin ID, each plugin owns its config shape.

---

## Backend Implications

### Current:
- One endpoint per interaction type
- `/game/stealth/pickpocket`
- `/game/items/give` (future)
- `/game/social/flirt` (future)

### Better:
- Generic endpoint: `/game/interactions/execute`
- Payload includes `interactionId` and `config`
- Backend has its own plugin registry
- Or keep separate endpoints but use consistent pattern

---

## Example: Adding "Flirt" Interaction

### With current system: ~300 lines, 5 files
### With plugin system: **80 lines, 1 file**

```typescript
// frontend/src/lib/game/interactions/flirt.ts

export const flirtInteraction: InteractionPlugin<FlirtConfig> = {
  id: 'flirt',
  name: 'Flirt',
  description: 'Attempt to charm the NPC',
  icon: '😘',

  defaultConfig: {
    enabled: true,
    minRelationship: 20,
    successBonus: 5,
    failurePenalty: 10,
  },

  configFields: [
    { type: 'number', key: 'minRelationship', label: 'Min Relationship', min: 0, max: 100 },
    { type: 'number', key: 'successBonus', label: 'Success Bonus (+points)' },
    { type: 'number', key: 'failurePenalty', label: 'Failure Penalty (-points)' },
  ],

  async execute(config, context) {
    // Check relationship level
    // Roll for success
    // Update relationship
    // Trigger reaction scene
    return { success: true, message: 'NPC blushed!' };
  },

  validate(config) {
    if (config.minRelationship < 0) return 'Min relationship cannot be negative';
    return null;
  },
};
```

Then in `interactions/index.ts`:
```typescript
import { flirtInteraction } from './flirt';
interactionRegistry.register(flirtInteraction);
```

**Done.** Zero changes to any other files.

---

## Conclusion

The current approach works for 2-3 interaction types, but becomes unmaintainable at 10+.

**The plugin system makes interactions:**
- ✅ Self-contained (one file per type)
- ✅ Easy to add (80 lines, one import)
- ✅ Easy to disable (comment one line)
- ✅ Fully typed (compile-time safety)
- ✅ Validated (runtime safety)
- ✅ Testable (each plugin is independently testable)

**Next steps:**
1. Decide if you want to refactor now or later
2. If now: Port `talk` and `pickpocket` to plugins
3. Update `NpcSlotEditor` and `Game2D` to use the registry
4. Add new interactions trivially
