# Backend Interaction Dispatcher (Future)

## Current State

Right now, the interaction plugin system is **frontend-only**:

```
Frontend:
  - Plugin registry with execute() methods
  - Calls backend endpoints directly (pickpocket, talk, etc.)

Backend:
  - Individual endpoints per interaction
  - /game/stealth/pickpocket
  - /game/dialogue/talk (future)
  - /game/items/give (future)
```

## Why Backend Symmetry Matters

GPT-5 is right that we'll eventually want server-side interaction execution for:

### 1. **Server-Driven Events**
NPCs should be able to trigger interactions without player action:
```python
# Server-side NPC AI decides to pickpocket the player
result = interaction_dispatcher.execute(
    interaction_id='pickpocket',
    source_npc_id=12,
    target_player_id=456,
    config={'baseSuccessChance': 0.6}
)
```

### 2. **Validation & Anti-Cheat**
Client says "I succeeded at pickpocket with 100% chance" → Server validates:
```python
# Verify the interaction config matches what's stored
stored_config = get_slot_config(slot_id)
if request.success_chance != stored_config.baseSuccessChance:
    raise ValidationError("Client config doesn't match server")
```

### 3. **Scheduled/Automatic Interactions**
Cron jobs or AI systems trigger interactions:
```python
# Daily reset: NPCs forgive pickpocket attempts
for npc in get_all_npcs():
    interaction_dispatcher.execute(
        'forgive_crimes',
        npc_id=npc.id,
        config={'crime_types': ['pickpocket']}
    )
```

### 4. **Consistent Logic**
Same rules on client and server (no drift):
```typescript
// Frontend plugin
execute(config, context) {
  return context.api.executeInteraction('pickpocket', config);
}
```
```python
# Backend plugin (same logic)
def execute(config: PickpocketConfig, context: InteractionContext):
    success = random.random() < config.baseSuccessChance
    # ... same logic as frontend would use
```

---

## Proposed Backend Architecture

### Phase 1: Generic Dispatcher Endpoint (Easy Win)

Instead of individual endpoints, one dispatcher:

```python
# pixsim7_backend/api/v1/game_interactions.py

@router.post("/interactions/execute")
def execute_interaction(
    interaction_id: str,
    config: dict[str, Any],
    slot_id: str,
    npc_id: int,
    session_id: int,
    db: Session = Depends(get_db),
):
    # Fetch slot config to validate
    slot_config = get_slot_from_db(slot_id)

    # Validate config matches what creator configured
    validate_interaction_config(interaction_id, config, slot_config)

    # Dispatch to handler
    handler = interaction_registry.get(interaction_id)
    if not handler:
        raise HTTPException(404, f"Unknown interaction: {interaction_id}")

    # Build context with session, world, etc.
    context = build_interaction_context(session_id, npc_id, db)

    # Execute
    result = handler.execute(config, context)

    # Save to DB
    save_interaction_result(result, db)

    return result
```

**Benefits:**
- Single endpoint for all interactions
- Config validation in one place
- Easy to add new interaction types (just register)

**Downside:**
- Less type safety than individual endpoints
- Still need to convert configs to proper types

---

### Phase 2: Backend Plugin Registry (Full Symmetry)

Mirror the frontend plugin system on the backend:

```python
# pixsim7_backend/domain/game/interactions/base.py

class InteractionPlugin(Protocol):
    """Backend plugin interface (mirrors frontend)"""

    id: str
    name: str

    def validate_config(self, config: dict) -> str | None:
        """Validate config, return error or None"""
        ...

    def execute(
        self,
        config: dict,
        context: InteractionContext,
        db: Session
    ) -> InteractionResult:
        """Execute the interaction server-side"""
        ...

    def is_available(self, context: InteractionContext) -> bool:
        """Check if interaction can be used"""
        ...


# pixsim7_backend/domain/game/interactions/pickpocket.py

class PickpocketPlugin:
    id = "pickpocket"
    name = "Pickpocket"

    def execute(self, config: dict, context: InteractionContext, db: Session):
        success = random.random() < config['baseSuccessChance']
        detected = random.random() < config['detectionChance']

        # Update session flags
        session = db.query(GameSession).get(context.session_id)
        flags = session.flags or {}
        # ... same logic as current pickpocket endpoint

        return InteractionResult(
            success=success,
            detected=detected,
            message=f"Pickpocket {'succeeded' if success else 'failed'}",
        )


# pixsim7_backend/domain/game/interactions/registry.py

interaction_registry = InteractionRegistry()
interaction_registry.register(PickpocketPlugin())
interaction_registry.register(TalkPlugin())
interaction_registry.register(GiveItemPlugin())
```

**Benefits:**
- ✅ Perfect symmetry with frontend
- ✅ Easy to add new interactions (one class)
- ✅ Server-side execution for NPCs
- ✅ Validation in plugins
- ✅ Testable in isolation

**File structure:**
```
pixsim7_backend/domain/game/interactions/
  ├── base.py            # InteractionPlugin protocol
  ├── registry.py        # Plugin registry
  ├── pickpocket.py      # Pickpocket plugin
  ├── talk.py            # Talk plugin
  └── give_item.py       # Give Item plugin
```

---

### Phase 3: Shared Logic (Advanced)

For maximum consistency, share validation logic between frontend/backend:

**Option A: Python validation in both**
- Frontend calls `/validate-interaction` before execute
- Backend validates again server-side

**Option B: JSON Schema**
- Define interaction configs as JSON schemas
- Validate in both frontend and backend

**Option C: Code generation**
- Write plugins once in TypeScript
- Generate Python from TypeScript (or vice versa)
- Probably too complex for this project

---

## Migration Path

### Now (Frontend-First) ✓
```
✓ Frontend plugin system
✓ Individual backend endpoints
✓ Direct API calls from plugins
```

### Soon (Generic Dispatcher)
```
1. Add POST /interactions/execute endpoint
2. Keep individual endpoints for backward compat
3. Frontend plugins use generic endpoint
4. Validate configs server-side
```

### Later (Full Backend Plugins)
```
1. Create backend plugin system
2. Port pickpocket to backend plugin
3. Port talk to backend plugin
4. Add server-side interaction triggering
5. Deprecate individual endpoints
```

---

## When to Do This?

**Don't refactor yet if:**
- You only have 2-3 interaction types
- No server-driven events needed
- No NPC AI that triggers interactions
- Frontend validation is sufficient

**Refactor when:**
- Adding 5+ interaction types (maintenance burden)
- Need server-side validation (anti-cheat)
- Want NPC AI to trigger interactions
- Need scheduled/automated interactions

**For now:** Frontend plugin system is enough. Add backend symmetry when you need server-driven interactions.

---

## Example: Server-Driven Pickpocket

Future state where NPC can pickpocket player:

```python
# NPC AI decision
if npc.is_thief and player_nearby and random.random() < 0.1:
    # NPC attempts to pickpocket player
    result = interaction_dispatcher.execute(
        interaction_id='pickpocket',
        source_id=npc.id,
        target_id=player.id,
        config={
            'baseSuccessChance': 0.7,  # NPCs are good at this
            'detectionChance': 0.2,
        },
        context=build_context(session_id, world_id),
        db=db,
    )

    if result.success and not result.detected:
        # NPC stole from player
        emit_notification(player, f"{npc.name} pickpocketed you!")
```

This requires backend plugins, not just frontend ones.

---

## Summary

**GPT-5's advice:** "Backend symmetry later"

✅ **Correct approach:**
1. Ship frontend plugin system now
2. Keep individual backend endpoints
3. Add backend plugin system when you need:
   - Server-driven interactions
   - NPC AI triggering interactions
   - Better validation/anti-cheat
4. Don't over-engineer too early

The frontend plugin system is already a huge win. Backend symmetry is a nice-to-have for future features.
