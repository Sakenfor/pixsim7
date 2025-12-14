# Generic Template↔Runtime Link Pattern

## Overview

The generic link pattern provides a reusable infrastructure for connecting any template entity (Character, ItemTemplate, PropTemplate) to any runtime entity (NPC, Item, Prop) with:

- **Bidirectional sync** with field-level authority
- **Priority-based conflict resolution** when multiple links target the same runtime entity
- **Context-based activation** (location, time, state-aware linking)
- **Declarative FieldMapping** configuration for sync behavior
- **Composition over inheritance** - no base classes, pure data structures

This pattern generalizes the existing CharacterInstance↔GameNPC link into a reusable system for any entity pair.

## Core Concepts

### ObjectLink

A generic link contract that connects a template entity to a runtime entity:

- **Template**: The design/definition entity (Character, ItemTemplate, PropTemplate)
- **Runtime**: The in-game instance entity (NPC, Item, Prop)
- **Mapping**: FieldMapping config that defines field-level sync behavior
- **Priority**: For conflict resolution when multiple links are active
- **Activation Conditions**: Optional context-based activation (e.g., location, time)

```typescript
interface ObjectLink {
  linkId: string;
  templateKind: 'character' | 'itemTemplate' | 'propTemplate' | ...;
  templateId: string;
  runtimeKind: 'npc' | 'item' | 'prop' | ...;
  runtimeId: number;
  mappingId: string;  // e.g., 'character->npc'
  priority: number;
  activationConditions?: Record<string, unknown>;
  // ... metadata fields
}
```

### FieldMapping

Declarative configuration that specifies:

- **Which fields** sync between template and runtime
- **Authority**: Which entity is the source of truth per field
- **Fallback**: What happens when primary source is unavailable
- **Transform functions**: Optional per-field value transformations
- **Stat integration**: Optional StatEngine normalization

```python
FieldMapping(
    target_path="traits.openness",
    source="instance",           # Instance is authoritative
    fallback="npc",              # Fall back to NPC if instance missing
    instance_path="personality_traits.openness",
    npc_path="personality.openness",
    stat_axis="openness",        # Normalize via StatEngine
    stat_package_id="core.personality"
)
```

### Mapping Registry

Central registry that maps `mappingId` (e.g., `'character->npc'`) to FieldMapping configurations.

Each entity pair registers its FieldMapping configuration on service startup, making it available for links to reference.

```python
registry = get_mapping_registry()
registry.register('character->npc', NPC_FIELD_MAPPING)
registry.register('itemTemplate->item', ITEM_FIELD_MAPPING)
```

### Entity Loader Registry

Registry of loader functions that fetch entities by kind and ID.

Each domain registers loaders for its entity types, enabling the generic sync service to load any entity without domain-specific code.

```python
registry = get_entity_loader_registry()

async def load_character_instance(instance_id, db):
    return await db.get(CharacterInstance, instance_id)

registry.register_loader('character', load_character_instance)
```

## Architecture

### Composition-Based Design

The link pattern respects the existing composition-based GameObject architecture:

- **GameObjectBase** is a shape (id/kind/transform/tags), not a base class
- **ObjectLink** is a data structure, not a class hierarchy
- Systems that need "any object" use GameObjectBase union types
- Systems that need template↔runtime sync use ObjectLink

No inheritance. No instanceof checks. Pure composition.

### Data Flow

```
Template Entity (CharacterInstance)
          ↓
    ObjectLink (character->npc)
          ↓  (FieldMapping: character->npc)
          ↓  (Sync direction, priority, activation)
          ↓
Runtime Entity (GameNPC)
```

1. **Link Creation**: Create ObjectLink connecting template→runtime
2. **Mapping Lookup**: Retrieve FieldMapping config via mappingId
3. **Entity Loading**: Load template and runtime entities via entity loaders
4. **Snapshot Building**: Use generic_resolver to merge fields per mapping
5. **Sync**: Apply field changes in specified direction (optional)

## Usage

### 1. Define a FieldMapping

Create a FieldMapping configuration for your entity pair:

```python
# In services/links/default_mappings.py
def get_my_entity_mapping() -> Dict[str, FieldMapping]:
    return {
        "name": FieldMapping(
            target_path="name",
            source="template",
            fallback="runtime",
            source_paths={
                "template": "name",
                "runtime": "name"
            }
        ),
        "state.health": FieldMapping(
            target_path="state.health",
            source="runtime",  # Runtime authoritative for state
            fallback="template",
            source_paths={
                "template": "default_health",
                "runtime": "health"
            }
        ),
        # More fields...
    }

# Register in register_default_mappings()
# Mapping ID format: "templateKind->runtimeKind"
registry.register('myTemplate->myRuntime', get_my_entity_mapping())
```

### 2. Create a Link

Use the LinkService to create a template↔runtime link:

```python
from services.links.link_service import LinkService

link_service = LinkService(db)

link = await link_service.create_link(
    template_kind='myTemplate',
    template_id='abc-123',
    runtime_kind='myRuntime',
    runtime_id=456,
    mapping_id='myTemplate->myRuntime',  # Format: "templateKind->runtimeKind"
    sync_direction='bidirectional',
    priority=10,
    activation_conditions={'location.zone': 'downtown'}  # Optional
)
```

### 3. Build a Snapshot

Use GenericSyncService to build a snapshot of merged field values:

```python
from services.links.sync_service import GenericSyncService

sync_service = GenericSyncService(db)

snapshot = await sync_service.build_snapshot(
    link.link_id,
    prefer_live=True  # Prefer runtime values over template values
)

# snapshot contains merged field values based on FieldMapping
```

### 4. Query Links

Get links for a template or runtime entity:

```python
# Get all links for a template
template_links = await link_service.get_links_for_template(
    'character', 'abc-123'
)

# Get all links for a runtime entity
runtime_links = await link_service.get_links_for_runtime(
    'npc', 456
)

# Get highest-priority active link for a runtime entity
context = {'location': {'zone': 'downtown'}, 'time': {'hour': 18}}
active_link = await link_service.get_active_link_for_runtime(
    'npc', 456, context
)
```

## Relationship to Other Systems

### GameObjectBase

**GameObjectBase is a shape, not a base class.**

- Use `GameObjectBase` for systems that need "any object" (spatial queries, rendering, tags)
- Use `ObjectLink` for systems that need template↔runtime sync
- They are orthogonal: An NPC can be a GameObject AND have an ObjectLink
- No inheritance; composition only

### StatEngine and Relationships

**Stats and relationships are separate from links.**

- **Links** connect template↔runtime entities (structural)
- **Stats** (affinity, trust, etc.) are applied via StatEngine and stat packages (gameplay)
- **Relationships** are actor-level (NPC↔NPC, Player↔NPC), not object-level
- FieldMapping can reference stat axes for normalization, but stats are not stored in links

### Prompt Context System

The link pattern integrates with the existing prompt context infrastructure:

- **FieldMapping** defines how to map fields (reused from npc_prompt_mapping.py)
- **generic_resolver** processes mappings to produce snapshots
- **Enrichers** can augment snapshots with link-derived data
- **Overlays** allow per-link FieldMapping customization

## Naming Conventions

### Mapping IDs

- **Format**: `templateKind->runtimeKind` (e.g., `character->npc`)
- **Delimiter**: Use `->` (ASCII-safe, easy to type)
- **Case**: Use camelCase to match TypeScript conventions
- **Examples**:
  - `character->npc`
  - `itemTemplate->item`
  - `propTemplate->prop`
  - `locationTemplate->location`

### Template Kinds

- Use singular nouns in camelCase
- Examples: `character`, `itemTemplate`, `propTemplate`
- Match the domain model name when possible
- Avoid abbreviations unless standard (e.g., `npc` is OK)

### Runtime Kinds

- Use singular nouns in camelCase
- Examples: `npc`, `item`, `prop`, `player`
- Match the GameObject `kind` field for consistency
- Keep consistent with TypeScript union types

### ID Types

- **Template IDs**: Usually UUIDs (strings)
- **Runtime IDs**: Usually integers, but can be UUIDs for some domains
- Use branded types in TypeScript for type safety where possible
- Document any domain-specific ID format deviations

## Migration Path

The existing CharacterNPCLink system continues to work unchanged:

### Current State

- **CharacterNPCLink table**: Remains as-is, no breaking changes
- **CharacterNPCSyncService**: Continues using CharacterNPCLink
- **npc_prompt_mapping**: Registered as `character->npc` in mapping registry

### Gradual Migration

1. **Phase 1 (Current)**: Both systems coexist
   - New code can use ObjectLink via `create_link_via_generic_service()`
   - Existing code continues using CharacterNPCLink via `create_link()`

2. **Phase 2 (Optional)**: Migrate data
   - Script to copy CharacterNPCLink → ObjectLink rows
   - Verify data integrity
   - Dual-write to both tables for safety

3. **Phase 3 (Future)**: Deprecate old system
   - Switch CharacterNPCSyncService to use ObjectLink internally
   - Deprecate CharacterNPCLink table
   - Remove after migration period

No forced migration. Teams can adopt the generic pattern at their own pace.

## Example: Character-NPC Link

### Create a Link

```python
from services.characters.npc_sync_service import CharacterNPCSyncService

service = CharacterNPCSyncService(db)

# Option 1: Use existing CharacterNPCLink (unchanged)
link = await service.create_link(
    character_instance_id=instance_id,
    npc_id=npc_id,
    priority=10
)

# Option 2: Use generic ObjectLink (new)
link = await service.create_link_via_generic_service(
    character_instance_id=instance_id,
    npc_id=npc_id,
    priority=10,
    activation_conditions={'location.zone': 'downtown'}
)
```

### Context-Based Activation

Links can be context-aware for dynamic behavior:

```python
# Day appearance (low priority)
day_link = await service.create_link_via_generic_service(
    character_instance_id=instance_id,
    npc_id=npc_id,
    priority=5,
    activation_conditions={'time.period': 'day'}
)

# Night appearance (higher priority)
night_link = await service.create_link_via_generic_service(
    character_instance_id=instance_id,
    npc_id=npc_id,
    priority=10,
    activation_conditions={'time.period': 'night'}
)

# At night, the night_link is active (higher priority + matches condition)
# At day, the day_link is active
# The NPC can switch appearance based on time of day
```

## Implementation Files

### TypeScript Types

- `packages/shared/types/src/links.ts` - Generic ObjectLink types with branded IDs

### Backend Domain

- `pixsim7/backend/main/domain/links.py` - ObjectLink SQLAlchemy model

### Backend Services

- `pixsim7/backend/main/services/links/mapping_registry.py` - Mapping registry
- `pixsim7/backend/main/services/links/entity_loaders.py` - Entity loader registry
- `pixsim7/backend/main/services/links/activation.py` - Activation evaluator
- `pixsim7/backend/main/services/links/default_mappings.py` - Default mapping configs
- `pixsim7/backend/main/services/links/link_service.py` - Generic CRUD service
- `pixsim7/backend/main/services/links/sync_service.py` - Generic sync service

### Integration

- `pixsim7/backend/main/services/characters/npc_sync_service.py` - CharacterNPCSyncService with `create_link_via_generic_service()` method

### Database

- Migration: `YYYYMMDD_HHMM_add_object_links.py` - Creates `object_links` table

## Future Extensions

### Additional Entity Types

As new entity types are added, register their mappings:

```python
# In services/links/default_mappings.py
def get_vehicle_template_mapping():
    return { ... }

registry.register('vehicleTemplate->vehicle', get_vehicle_template_mapping())
```

### Custom Activation Logic

For more complex activation conditions, extend the activation evaluator:

```python
# Current: Simple JSON matching
# Future: Expression language, rule engine, etc.
```

### Frontend Integration

When needed, expose ObjectLink via GraphQL:

```graphql
mutation CreateLink($input: CreateObjectLinkInput!) {
  createObjectLink(input: $input) {
    linkId
    templateKind
    runtimeKind
  }
}
```

## Design Principles

1. **Composition over inheritance** - No base classes, pure data structures
2. **Declarative over imperative** - FieldMapping config, not hardcoded logic
3. **Registry pattern** - Extensible without modifying core code
4. **Non-breaking** - Additive changes, existing systems unaffected
5. **2D-first, 3D-ready** - Spatial model compatibility maintained
6. **Entity-agnostic** - Works for any template↔runtime pair

## References

- Current spatial model: `packages/shared/types/src/game.ts`
- FieldMapping and generic_resolver: `services/prompt_context/`
- Existing CharacterNPCLink: `domain/character_integrations.py`
- CharacterNPCSyncService: `services/characters/npc_sync_service.py`
- npc_prompt_mapping: `services/characters/npc_prompt_mapping.py`
