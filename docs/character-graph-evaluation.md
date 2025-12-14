# Character Graph Evaluation: Keep, Drop, or Evolve?

**Date**: 2025-12-14
**Context**: Evaluating whether the Characters graph layer justifies its existence vs folding into arc/campaign layer

---

## Executive Summary

**Recommendation**: **Keep but evolve** into a **"Content Graph"** that broadens beyond just characters.

**Rationale**:
1. Already provides unique cross-cutting value (query abstraction, usage tracking, cross-arc validation)
2. Already broader than characters (9 node types, 13 edge types)
3. Fills a gap that arc/campaign layer can't cleanly handle
4. Needs better naming and clearer scope to justify existence

---

## Current State Analysis

### What Characters Graph Does Today

The Characters graph is **not just about characters** - it's a queryable abstraction layer connecting:

**9 Node Types**:
- `character_template`, `character_instance`, `game_npc` (character layer)
- `scene`, `scene_role` (content layer)
- `asset`, `generation` (media layer)
- `prompt_version`, `action_block` (narrative layer)

**13 Edge Types**:
- Character lifecycle: `instantiates`, `syncs_with`
- Role binding: `fills_role`, `appears_in`
- Relationships: `references` (character↔character)
- Content: `contains_asset`, `generated_by`, `created_for`
- Usage: `uses_character`, `uses_prompt`, `has_capability`
- Requirements: `requires_character`, `expresses_as`

**Key Capabilities**:
1. **Cross-arc character tracking** - Who appears where, across multiple worlds/arcs
2. **Usage analytics** - Which characters used in which scenes/prompts/actions
3. **Dependency validation** - "Can we generate this scene? Do we have required characters?"
4. **Asset discovery** - Find all assets for a character (scenes + NPC expressions)
5. **Reverse queries** - "Which character templates does this NPC represent?"

---

## Option 1: Drop Characters Graph → Fold into Arc/Campaign

### What This Means

Move all character graph responsibilities to the arc/campaign layer:
- **Cast lists per arc/campaign** - Bind roles to character templates
- **Relationship/state via stat system** - Use existing affinity/trust metrics
- **Template↔runtime via ObjectLink** - Already exists for generic linking

### Implementation Changes

```python
# Instead of separate Character graph, arcs/campaigns get:
class ArcCastList:
    arc_id: UUID
    roles: dict[str, CharacterRoleBinding]
    # Example:
    # {
    #   "protagonist": {"template": "gorilla_01", "min_version": 2},
    #   "antagonist": {"template": "female_dancer_01"}
    # }

class CampaignCastList:
    campaign_id: UUID
    global_cast: dict[str, CharacterTemplate]
    cross_arc_relationships: list[CharacterRelationship]
```

### Pros
✅ **Simpler mental model** - One less abstraction layer
✅ **Direct role binding** - Arc manifests directly reference characters
✅ **Reduced duplication** - Don't track "appears_in" in graph AND manifest
✅ **Clearer ownership** - Arc/campaign owns its cast

### Cons
❌ **No global character view** - "Show me all scenes using gorilla_01" requires scanning all arcs
❌ **Lost usage analytics** - Can't easily answer "How many prompts reference this character?"
❌ **Harder cross-arc validation** - "This character appears in arcs A, B, C - ensure continuity" now scattered
❌ **No reverse queries** - "Which character template is this NPC?" requires manual lookups
❌ **Asset discovery complexity** - Finding character assets means walking arc→scene→manifest→assets
❌ **Rebuild query infrastructure** - Arc/campaign layer doesn't have graph query capabilities

### Scenarios Where This Fails

**Scenario 1: Character Portfolio View**
```
User: "Show me everywhere gorilla_01 is used - scenes, prompts, arcs, assets"
```
- **With Graph**: Single `get_character_graph(gorilla_01, max_depth=3)` call
- **Without Graph**: Query all arcs → all scenes → all manifests → all prompts → all action blocks → all assets
  - Requires JOIN across 6+ tables
  - No query optimization
  - Slow, complex query

**Scenario 2: Character Retirement Check**
```
Developer: "Can I safely delete female_dancer_01?"
```
- **With Graph**: `get_character_usage_stats(female_dancer_01)` shows all dependencies
- **Without Graph**: Manual audit of arcs, scenes, prompts, action blocks, generations, assets
  - Risk missing dependencies
  - No safety net

**Scenario 3: NPC Debug - "Who Am I?"**
```
Game Runtime: NPC_1234 exists in game. Which character templates does it represent?
```
- **With Graph**: `find_characters_for_npc(1234)` returns all linked character instances/templates
- **Without Graph**:
  1. Query character_npc_links for NPC_1234
  2. Get character instances
  3. For each instance, get character template
  4. Manually aggregate
  - Requires business logic in every call site

**Scenario 4: Cross-Arc Continuity Validation**
```
Narrative Designer: "gorilla_01 appears in Arc A (friendly) and Arc B (hostile). Are relationship states consistent?"
```
- **With Graph**: `get_character_graph()` shows all arcs, relationships can be compared
- **Without Graph**: Query each arc separately, manually compare relationship requirements
  - No centralized validation
  - Easy to miss conflicts

**Scenario 5: Asset Manager - "Show All Character Art"**
```
Art Lead: "I need all assets for gorilla_01 to review art consistency"
```
- **With Graph**: `find_assets_for_character(gorilla_01)` returns all scene assets + NPC expressions
- **Without Graph**:
  1. Find all arcs with gorilla_01
  2. For each arc, find scenes
  3. For each scene, find manifest with gorilla_01
  4. For each scene, find assets
  5. Also query NPC expressions separately
  - Complex, slow, error-prone

---

## Option 2: Keep Characters Graph → Evolve to "Content Graph"

### What This Means

Rename and broaden the Characters graph to justify its existence:
- **Not just characters** - Model roles, cast, key props, locations, factions
- **Unique value prop** - Cross-cutting queries, dependency validation, usage analytics
- **Clear scope** - Template-level graph, runtime resolution via ObjectLink

### Implementation Changes

```python
# Rename: Characters Graph → Content Graph
# New node types (add to existing 9):
ContentNodeType = Literal[
    # Character layer (existing)
    "character_template", "character_instance", "game_npc",

    # Content layer (existing)
    "scene", "scene_role",

    # Media layer (existing)
    "asset", "generation",

    # Narrative layer (existing)
    "prompt_version", "action_block",

    # NEW: Expand to justify broader scope
    "faction",            # Groups of characters
    "location_template",  # Location definitions (not runtime instances)
    "prop_template",      # Key props (items, vehicles, etc.)
    "campaign",           # Top-level campaign node
    "arc"                 # Arc node
]

# New edge types:
ContentEdgeType = Literal[
    # Character edges (existing 13)
    ...,

    # NEW: Faction edges
    "member_of",          # Character is member of faction
    "allied_with",        # Faction allied with faction
    "at_war_with",        # Faction conflict

    # NEW: Location edges
    "set_in",            # Scene set in location
    "native_to",         # Character native to location
    "traveled_to",       # Character instance traveled to location

    # NEW: Prop edges
    "owns",              # Character owns prop
    "requires_prop",     # Scene requires prop

    # NEW: Campaign/Arc edges
    "part_of_arc",       # Scene part of arc
    "part_of_campaign",  # Arc part of campaign
    "requires_completion" # Arc requires another arc completed
]
```

### Pros
✅ **Justifies existence** - Clear unique value: cross-cutting queries
✅ **Broader utility** - Not just characters, handles entire content ecosystem
✅ **Keeps existing benefits** - Usage analytics, reverse queries, asset discovery
✅ **Leverages investment** - Already built, just needs evolution
✅ **Arc/campaign integration** - Graph can model campaign/arc structure too
✅ **Validation powerhouse** - Can validate dependencies across entire content graph

### Cons
❌ **More complex** - Larger scope means more to maintain
❌ **Potential overlap** - Need clear boundaries with arc/campaign domain layer
❌ **Migration needed** - Renaming, adding new node/edge types
❌ **Documentation debt** - Must clearly explain when to use graph vs domain layer

### Scenarios Where This Excels

**Scenario 1: Campaign Dependency View**
```
Campaign Manager: "Show me the dependency graph for Campaign: Rise of the Gorillas"
```
- **With Content Graph**:
  ```
  get_content_graph("campaign:rise_of_gorillas", max_depth=5)
  → Shows: Campaign → Arcs → Scenes → Characters → Assets → Prompts
  → Visual dependency graph with all content connections
  ```
- **Value**: Single view of entire campaign content ecosystem

**Scenario 2: Faction Conflict Validation**
```
Narrative Designer: "Show me all faction conflicts and ensure no character is in conflicting factions"
```
- **With Content Graph**:
  ```
  Query: faction nodes + member_of edges + at_war_with edges
  → Detect: gorilla_01 is member_of "Rebel Faction" AND "Empire Faction"
  → Validate: These factions are at_war_with each other → ERROR
  ```
- **Value**: Cross-cutting validation that domain layer can't easily do

**Scenario 3: Location-Based Content Discovery**
```
Art Lead: "Show me all content set in 'Jungle Temple' location"
```
- **With Content Graph**:
  ```
  get_content_graph("location:jungle_temple")
  → Returns: Scenes set_in location, characters native_to location, props in location
  → Also: Assets for scenes, generations for assets
  ```
- **Value**: Location-centric view across all content types

**Scenario 4: Prop Dependency Tracking**
```
Game Designer: "This 'Magic Sword' prop is being removed. What breaks?"
```
- **With Content Graph**:
  ```
  get_content_graph("prop:magic_sword")
  → Shows: Characters who own it, scenes that require it, assets depicting it
  → Validation: Can't remove - Scene_X requires it
  ```
- **Value**: Dependency safety for non-character content

**Scenario 5: Content Reuse Analysis**
```
Producer: "Which characters/props/locations are most reused? Are we over-using any?"
```
- **With Content Graph**:
  ```
  get_content_usage_stats() for all templates
  → Returns: gorilla_01 used in 45 scenes, female_dancer_01 in 12 scenes
  → Returns: jungle_temple used in 30 scenes (reuse efficiency)
  ```
- **Value**: Content portfolio management

**Scenario 6: Campaign Continuity Checker**
```
QA: "Ensure all character state changes across arcs in this campaign are consistent"
```
- **With Content Graph**:
  ```
  get_content_graph("campaign:main_story")
  → Shows: All arcs, all characters in those arcs
  → For each character: Check instance_requirements across arcs
  → Validate: Arc_2 requires gorilla_01 v2 (evolved), but Arc_1 doesn't evolve him → ERROR
  ```
- **Value**: Cross-arc continuity validation

---

## Option 3: Hybrid Approach (Recommended)

### What This Means

Keep a **lightweight Content Graph** focused on cross-cutting concerns, while arc/campaign layer handles execution:

**Content Graph Responsibilities**:
- **Template-level graph** - Characters, locations, props, factions as templates
- **Cross-cutting queries** - "Show me all content using X"
- **Dependency validation** - "Can I safely delete X?"
- **Usage analytics** - "How much is X used?"
- **Global consistency** - "Do these templates conflict?"

**Arc/Campaign Layer Responsibilities**:
- **Cast lists** - Which templates used in which arcs
- **Runtime binding** - Resolve templates to instances via ObjectLink
- **State management** - Character/prop state during gameplay
- **Execution** - Scene generation, progression gates, stat changes

### Clear Boundaries

```python
# CONTENT GRAPH: Template-level, read-mostly, cross-cutting
content_graph.get_all_scenes_using_character("gorilla_01")
content_graph.validate_faction_conflicts()
content_graph.get_usage_stats("female_dancer_01")

# ARC/CAMPAIGN: Execution-level, write-heavy, specific
arc.resolve_cast_to_instances(world_id=1)
arc.validate_can_start(world_id=1)  # Uses content graph for dependency check
campaign.apply_state_changes(interaction_result)
```

### Migration Path

1. **Rename**: `CharacterGraph` → `ContentGraph`
2. **Expand node types**: Add faction, location_template, prop_template
3. **Expand edge types**: Add faction/location/prop edges
4. **Add campaign/arc nodes**: Make graph aware of campaign structure
5. **Keep existing APIs**: Backward compatible
6. **Document boundaries**: Clear guide on when to use graph vs domain layer

---

## Comparison Matrix

| Feature | Drop Graph | Keep & Evolve | Hybrid |
|---------|------------|---------------|--------|
| **Simplicity** | ✅ Fewer layers | ❌ More complex | ⚖️ Moderate |
| **Cross-arc queries** | ❌ Hard | ✅ Easy | ✅ Easy |
| **Usage analytics** | ❌ Requires custom queries | ✅ Built-in | ✅ Built-in |
| **Dependency validation** | ❌ Manual | ✅ Automatic | ✅ Automatic |
| **Asset discovery** | ❌ Complex JOINs | ✅ Single query | ✅ Single query |
| **Reverse lookups** | ❌ Manual | ✅ Built-in | ✅ Built-in |
| **Arc/campaign integration** | ✅ Direct | ⚖️ Via graph | ✅ Clear separation |
| **Faction/location support** | ❌ Not naturally fits | ✅ Natural fit | ✅ Natural fit |
| **Maintenance burden** | ✅ Less code | ❌ More code | ⚖️ Moderate |
| **Query performance** | ❌ Slow (many JOINs) | ✅ Fast (indexed graph) | ✅ Fast (indexed graph) |

---

## Recommendation: Hybrid Approach with Evolution

### Why Hybrid?

1. **Content Graph provides unique value** that arc/campaign layer can't cleanly replicate:
   - Cross-cutting queries (usage analytics, dependency tracking)
   - Global validation (faction conflicts, character continuity)
   - Performance (indexed graph vs complex JOINs)

2. **Arc/Campaign layer does what it does best**:
   - Execution (state management, scene generation)
   - Runtime binding (template → instance resolution)
   - Gameplay (progression, stat changes)

3. **Already implemented** - Content graph exists, just needs evolution not rebuild

### Evolution Steps

#### Phase 1: Rename & Document (1-2 days)
- Rename `CharacterGraph` → `ContentGraph`
- Update all references
- Document clear boundaries between graph and domain layer
- Add architecture decision record (ADR)

#### Phase 2: Expand Node Types (3-5 days)
- Add `faction`, `location_template`, `prop_template` nodes
- Add corresponding edge types
- Update graph query functions
- Add tests

#### Phase 3: Campaign/Arc Integration (5-7 days)
- Add `campaign`, `arc` nodes to graph
- Add `part_of_arc`, `part_of_campaign`, `requires_completion` edges
- Enable campaign-level dependency queries
- Update frontend graph visualizer

#### Phase 4: Migration (2-3 days)
- Migrate existing character data to new structure (backward compatible)
- Update documentation
- Update API endpoints (versioned)

### Success Metrics

After evolution, Content Graph should answer:
1. **"Show me everything related to X"** - Character, faction, location, prop, campaign
2. **"Can I safely delete X?"** - Dependency validation
3. **"What's being over/under-used?"** - Usage analytics
4. **"Are there conflicts in my content?"** - Validation (faction conflicts, character continuity)
5. **"What's the structure of my campaign?"** - Campaign→Arc→Scene hierarchy

### Long-Term Vision

Content Graph becomes the **content management backbone**:
- **Content Browser**: Visual graph explorer for entire game content
- **Content Validator**: Pre-commit hooks to catch dependency/conflict issues
- **Content Analyzer**: Usage analytics for content portfolio management
- **Content Planner**: AI-assisted content planning based on graph structure

---

## Appendix: Code Examples

### Example 1: Current Character Graph Query

```python
# What we have today
result = get_character_graph(
    character_id="gorilla_01",
    world_id=1,
    max_depth=2
)

# Returns:
{
    "nodes": [
        {"type": "character_template", "id": "gorilla_01", ...},
        {"type": "character_instance", "id": "inst_123", "world_id": 1, ...},
        {"type": "game_npc", "id": 5678, ...},
        {"type": "scene", "id": "jungle_chase", ...}
    ],
    "edges": [
        {"type": "instantiates", "from": "gorilla_01", "to": "inst_123"},
        {"type": "syncs_with", "from": "inst_123", "to": 5678},
        {"type": "appears_in", "from": "inst_123", "to": "jungle_chase"}
    ]
}
```

### Example 2: Evolved Content Graph Query

```python
# What we could have with Content Graph
result = get_content_graph(
    node_id="campaign:rise_of_gorillas",
    max_depth=3,
    include_types=["campaign", "arc", "scene", "character", "faction"]
)

# Returns:
{
    "nodes": [
        {"type": "campaign", "id": "rise_of_gorillas", ...},
        {"type": "arc", "id": "arc_1_introduction", ...},
        {"type": "scene", "id": "jungle_chase", ...},
        {"type": "character_template", "id": "gorilla_01", ...},
        {"type": "faction", "id": "rebel_gorillas", ...}
    ],
    "edges": [
        {"type": "part_of_campaign", "from": "arc_1_introduction", "to": "rise_of_gorillas"},
        {"type": "part_of_arc", "from": "jungle_chase", "to": "arc_1_introduction"},
        {"type": "appears_in", "from": "gorilla_01", "to": "jungle_chase"},
        {"type": "member_of", "from": "gorilla_01", "to": "rebel_gorillas"}
    ]
}
```

### Example 3: Validation Use Case

```python
# Content Graph enables powerful validation
def validate_campaign_continuity(campaign_id: str) -> list[ValidationError]:
    """Validate entire campaign for content conflicts/issues"""
    errors = []

    # Get full campaign graph
    graph = get_content_graph(campaign_id, max_depth=5)

    # Validate 1: No character in conflicting factions
    for char_node in graph.nodes_of_type("character_template"):
        factions = graph.outgoing_edges(char_node.id, "member_of")
        for f1, f2 in combinations(factions, 2):
            if graph.has_edge(f1, f2, "at_war_with"):
                errors.append(f"{char_node.id} in conflicting factions: {f1}, {f2}")

    # Validate 2: Character evolution consistent across arcs
    arcs = graph.nodes_of_type("arc")
    for char_node in graph.nodes_of_type("character_template"):
        char_in_arcs = [a for a in arcs if graph.has_path(char_node.id, a.id)]
        # Check version requirements are sequential
        versions = [a.character_requirements[char_node.id].min_version for a in char_in_arcs]
        if not is_sequential(versions):
            errors.append(f"{char_node.id} version inconsistent across arcs")

    # Validate 3: Required props available in scenes
    for scene_node in graph.nodes_of_type("scene"):
        required_props = graph.outgoing_edges(scene_node.id, "requires_prop")
        for prop in required_props:
            # Ensure prop owned by character in scene or exists in location
            if not (has_prop_ownership(scene_node, prop) or prop_in_location(scene_node, prop)):
                errors.append(f"Scene {scene_node.id} requires unavailable prop {prop}")

    return errors
```

---

## Conclusion

**Drop the graph?** No - too much unique value lost, queries become complex.

**Keep as-is?** No - needs clearer scope and naming to justify existence.

**Evolve to Content Graph?** Yes - with clear boundaries:
- **Content Graph**: Template-level, cross-cutting queries, validation, analytics
- **Arc/Campaign**: Execution-level, runtime binding, state management, gameplay

The Characters graph already does more than characters - it just needs to own that identity and evolve accordingly.
