# Prompt System Review & Modernization Recommendations

**Date**: 2025-11-18
**Status**: Analysis Complete
**Priority**: High

## Executive Summary

The PixSim7 prompt system has **strong backend foundations** (prompt versioning, action blocks, narrative programs) but has **not been integrated with recent architectural changes**. The system is functionally complete but isolated from:

1. Plugin system (UI plugins, node type plugins, generation plugins)
2. Provider capability registry
3. Frontend generation workflows
4. Dynamic node type system
5. Generation strategy modes

This document identifies gaps and provides actionable recommendations.

---

## Current State Assessment

### ✅ What's Working Well

#### 1. Prompt Versioning System (Backend)
**Location**: `pixsim7_backend/services/prompts/`

**Status**: Phase 3 Complete (Nov 2025)

**Features**:
- Git-like prompt versioning (families, versions, parent tracking)
- Diff generation and comparison
- Analytics and performance metrics
- Batch operations, import/export
- Template validation with variable substitution
- Similarity search
- Historical inference from existing assets

**API Endpoints**: `/api/v1/prompts/*` (14+ endpoints)

**Assessment**: ✅ **Production-ready backend** with comprehensive features

---

#### 2. Action Block Engine (Backend)
**Location**: `pixsim7_backend/domain/narrative/action_blocks/`

**Status**: Fully Implemented

**Features**:
- Single-state and transition block types
- Camera movement specifications (static, rotation, dolly, tracking, handheld)
- Consistency flags (pose, lighting, clothing, position)
- Intensity progression patterns
- Layered prompt builder
- Action block library (bench_park, bar_lounge, intimate actions)
- LLM-based generator for creating new blocks
- Pose taxonomy
- Package loader system

**Assessment**: ✅ **Sophisticated system** ready for visual generation workflows

---

#### 3. Narrative Prompt Engine (Backend)
**Location**: `pixsim7_backend/domain/narrative/`

**Status**: Fully Implemented

**Features**:
- Stage-based prompt programs (template, conditional, selector, formatter)
- Condition expression evaluation
- Variable substitution with dot notation
- Integration with NPC personality, relationship state, arcs
- Example programs for romantic arcs
- Intent mapping
- Context building

**Assessment**: ✅ **Complete dialogue/narrative system** aligned with relationship mechanics

---

### ❌ Critical Gaps

#### 1. Frontend Integration: **MISSING ENTIRELY**

**Evidence**:
```bash
# Search for prompt versioning in frontend
grep -r "PromptVersion|prompt_version" frontend/
# Result: No matches found
```

**Impact**:
- Users cannot access prompt versioning features
- No UI for browsing prompt families or versions
- Generation workflows don't leverage versioned prompts
- Prompt analytics invisible to users

**Recommendation**: **HIGH PRIORITY** - Build frontend UI for prompt management

---

#### 2. Provider Capability Integration: **NOT CONNECTED**

**Current State**:
- Provider capability registry exists in frontend (`frontend/src/lib/providers/capabilityRegistry.ts`)
- Capabilities include `prompt_limit`, `supported_operations`, `parameter_hints`
- Prompt system has NO knowledge of provider capabilities

**Problems**:
- Prompts can exceed provider character limits
- No validation against provider-supported parameters
- Provider hints not utilized in prompt construction
- Cost hints not factored into prompt optimization

**Example**:
```typescript
// CapabilityRegistry knows:
promptLimit: 800  // Pixverse limit

// But PromptVersionService doesn't check this before generation
```

**Recommendation**: Add provider-aware validation to prompt system

---

#### 3. Plugin System Integration: **ZERO AWARENESS**

**Current State**:
- Comprehensive plugin system for UI, node types, generation customization
- Plugins can register custom node types with arbitrary data structures
- Generation UI plugins can add provider-specific controls
- **Prompt system doesn't know plugins exist**

**Missing Capabilities**:
- No way to associate prompts with plugin node types (seduction nodes, quest triggers)
- Generation plugins can't contribute prompt enhancements
- Plugin-defined node data can't be referenced in prompt templates
- No hooks for plugins to modify or extend prompts

**Example Scenario**:
```typescript
// Seduction node plugin defines multi-stage interaction
// with affinity checks, but prompts can't reference:
//   - Current seduction stage
//   - Required affinity thresholds
//   - Stage-specific visual requirements
```

**Recommendation**: Add plugin integration hooks to prompt system

---

#### 4. Generation Strategy Awareness: **NOT IMPLEMENTED**

**Current State**:
- Generation nodes support strategies: `once`, `per_playthrough`, `per_player`, `always`
- Strategies affect caching and regeneration
- Prompt system treats all generations the same

**Problems**:
- No concept of "ephemeral" vs "canonical" prompts
- Cache-key computation doesn't consider prompt variations
- `always` strategy should allow prompt randomization but can't
- Performance optimization opportunities missed

**Example**:
```typescript
// Generation strategy: "per_player"
// Should allow per-player prompt customization (name, preferences)
// but prompt versioning has no way to express this
```

**Recommendation**: Extend prompt system with strategy-aware features

---

#### 5. Node Type Metadata Linkage: **WEAK**

**Current State**:
- Dynamic node type registry allows custom node types
- Node types have `defaultData`, `schema`, custom editors
- Prompt families can link to `scene_id` but not `node_type_id`

**Problems**:
- Can't find "all prompts for generation nodes"
- Can't auto-suggest prompts based on node type
- Node metadata not accessible in prompt templates
- No validation that prompt matches node requirements

**Recommendation**: Add node type linkage to prompt families

---

#### 6. Action Block → Prompt Version Bridge: **MISSING**

**Current State**:
- Action blocks have sophisticated prompt construction (`LayeredPromptBuilder`)
- Prompt versioning has families and versions
- **No connection between them**

**Problems**:
- Action block prompts not versioned
- Can't track which action block version generated which asset
- Can't A/B test action block variations
- No analytics on action block performance

**Example**:
```python
# Action block has:
block.prompt = "From this existing shot of {{lead}}..."

# But this isn't a PromptVersion, so:
# - No version history
# - No performance metrics
# - No diff tracking
```

**Recommendation**: Bridge action blocks with prompt versioning

---

## Modernization Recommendations

### Phase 1: Critical Integrations (1-2 weeks)

#### 1.1 Provider Capability Validation

**File**: `pixsim7_backend/services/prompts/prompt_version_service.py`

**Add**:
```python
async def validate_prompt_for_provider(
    self,
    prompt_text: str,
    provider_id: str,
    provider_service: ProviderService
) -> ValidationResult:
    """
    Validate prompt against provider capabilities.

    Checks:
    - Character limit
    - Supported parameter references
    - Provider-specific constraints
    """
    capabilities = await provider_service.get_capabilities(provider_id)

    # Check length
    if len(prompt_text) > capabilities.prompt_limit:
        return ValidationResult(
            valid=False,
            errors=[f"Prompt exceeds {capabilities.prompt_limit} chars"]
        )

    # Check parameter references
    # ... validation logic

    return ValidationResult(valid=True)
```

**Update API**: Add `/api/v1/prompts/validate` endpoint

---

#### 1.2 Frontend Prompt Manager UI

**Location**: `frontend/src/components/prompts/`

**Create**:
- `PromptFamilyList.tsx` - Browse families by category
- `PromptVersionHistory.tsx` - View version timeline
- `PromptEditor.tsx` - Edit with variable autocomplete
- `PromptAnalytics.tsx` - Performance metrics dashboard
- `PromptPicker.tsx` - Select prompt for generation nodes

**Integration Points**:
- Add to workspace presets
- Link from generation node inspector
- Add to asset context menu ("Find prompt for this asset")

---

#### 1.3 Generation Node → Prompt Linkage

**File**: `packages/types/src/generation.ts`

**Add to GenerationNodeConfig**:
```typescript
interface GenerationNodeConfig {
  // ... existing fields

  promptConfig?: {
    familyId?: string;
    versionId?: string;
    autoSelectLatest?: boolean;
    variables?: Record<string, any>;
  }
}
```

**Backend**: Update generation service to pull from prompt versioning

---

### Phase 2: Plugin Integration (2-3 weeks)

#### 2.1 Plugin Prompt Hooks

**File**: `frontend/src/lib/plugins/PluginAPI.ts`

**Add**:
```typescript
interface PluginAPI {
  // ... existing

  prompts: {
    // Register prompt transformers
    addTransformer(fn: PromptTransformer): void;

    // Contribute variable sources
    addVariableSource(source: VariableSource): void;

    // Add validation rules
    addValidator(validator: PromptValidator): void;
  }
}
```

**Example Plugin**:
```typescript
// Seduction node plugin
plugin.api.prompts.addVariableSource({
  scope: 'seduction_node',
  variables: {
    currentStage: () => node.data.currentStage,
    requiredAffinity: () => node.data.stages[stage].minAffinity,
    intimacyLevel: () => calculateIntimacy(npcState)
  }
});
```

---

#### 2.2 Node Type Prompt Extensions

**File**: `packages/types/src/nodeTypeRegistry.ts`

**Add to NodeTypeDefinition**:
```typescript
interface NodeTypeDefinition<TData> {
  // ... existing

  promptExtensions?: {
    // Suggested prompt families for this node type
    recommendedFamilies?: string[];

    // Variables this node type exposes
    variables?: Record<string, VariableDefinition>;

    // Validation requirements
    requiredPromptType?: 'visual' | 'narrative' | 'hybrid';
  }
}
```

---

### Phase 3: Advanced Features (3-4 weeks)

#### 3.1 Strategy-Aware Prompts

**File**: `pixsim7_backend/domain/prompt_versioning.py`

**Add**:
```python
class PromptVersion(SQLModel, table=True):
    # ... existing fields

    # New: Strategy compatibility
    compatible_strategies: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON)
    )

    # New: Randomization support
    allow_randomization: bool = Field(default=False)
    randomization_params: Optional[Dict] = Field(
        default=None,
        sa_column=Column(JSON)
    )
```

**Use Case**:
```python
# "always" strategy with randomized variations
version = PromptVersion(
    prompt_text="{{lead}} {{action_variant}}, {{mood_variant}}",
    compatible_strategies=["always", "per_playthrough"],
    allow_randomization=True,
    randomization_params={
        "action_variant": ["smiles softly", "laughs gently", "looks away"],
        "mood_variant": ["romantic mood", "playful mood", "tender mood"]
    }
)
```

---

#### 3.2 Action Block Versioning Bridge

**File**: `pixsim7_backend/domain/narrative/action_blocks/engine.py`

**Add**:
```python
class ActionEngine:
    async def create_versioned_block(
        self,
        block: ActionBlock,
        family_id: Optional[UUID] = None,
        prompt_service: Optional[PromptVersionService] = None
    ) -> Tuple[ActionBlock, PromptVersion]:
        """
        Create action block and corresponding prompt version.

        Links action block to prompt versioning for tracking.
        """
        if not prompt_service:
            return block, None

        # Create prompt family if needed
        if not family_id:
            family = await prompt_service.create_family(
                title=f"Action Block: {block.id}",
                prompt_type="visual",
                category=block.tags.get("location"),
                tags=[
                    f"intimacy:{block.tags.get('intimacy_level')}",
                    f"pose:{block.tags.get('pose')}",
                    f"mood:{block.tags.get('mood')}"
                ],
                action_concept_id=block.id
            )
            family_id = family.id

        # Create prompt version
        version = await prompt_service.create_version(
            family_id=family_id,
            prompt_text=block.prompt,
            commit_message=f"Action block: {block.id}",
            variables=block.__dict__.get("variables", {}),
            tags=["action_block"]
        )

        # Link back to action block
        block.prompt_version_id = version.id

        return block, version
```

---

#### 3.3 NPC-Aware Prompt Templates

**File**: `pixsim7_backend/services/prompts/template_utils.py`

**Add**:
```python
class NPCPromptContext:
    """
    Build prompt context from NPC state.

    Integrates with:
    - NPC personality
    - NPC preferences (tool preferences, patterns)
    - Relationship state (affinity, trust, chemistry)
    - NPC schedule and location
    """

    def __init__(self, npc: GameNPC, relationship: NPCRelationship):
        self.npc = npc
        self.relationship = relationship

    def build_variables(self) -> Dict[str, Any]:
        """Extract variables for prompt templates."""
        return {
            "npc": {
                "id": self.npc.id,
                "name": self.npc.name,
                "personality": self.npc.personality,
            },
            "relationship": {
                "affinity": self.relationship.affinity,
                "trust": self.relationship.trust,
                "chemistry": self.relationship.chemistry,
                "tier": self.relationship.current_tier,
                "intimacy_level": self.relationship.intimacy_level
            },
            # Add tool preferences
            "preferences": {
                "favorite_tools": get_favorite_tools(self.npc),
                "preferred_patterns": get_preferred_patterns(self.npc)
            }
        }
```

---

### Phase 4: Optimization & Analytics (2 weeks)

#### 4.1 Prompt Performance Dashboard

**Frontend**: `frontend/src/components/prompts/PromptAnalytics.tsx`

**Features**:
- Top performing prompts by success rate
- Cost analysis (average cost per generation)
- Provider comparison (same prompt, different providers)
- A/B test results
- Version comparison (which version performs better?)

**Data Sources**:
- `PromptVersion.generation_count`, `successful_assets`
- `Generation.completed_at` (latency)
- `ProviderSubmission.payload` (cost estimation)

---

#### 4.2 Smart Prompt Suggestions

**API**: `/api/v1/prompts/suggestions`

**Input**:
```json
{
  "nodeType": "generation",
  "nodeData": { "generationType": "dialogue", "npcId": 12 },
  "providerId": "pixverse",
  "context": { "sceneId": 456, "worldId": 789 }
}
```

**Output**:
```json
{
  "suggestions": [
    {
      "familyId": "uuid-123",
      "versionId": "uuid-v5",
      "reason": "Top performer for dialogue + this NPC (92% success)",
      "confidence": 0.92
    },
    {
      "familyId": "uuid-456",
      "versionId": "uuid-v3",
      "reason": "Most recent for this scene",
      "confidence": 0.78
    }
  ]
}
```

**Algorithm**:
- Filter by prompt_type (visual/narrative)
- Match node type and tags
- Rank by performance metrics
- Consider provider compatibility

---

## Updated Documentation Needs

### 1. PROMPT_VERSIONING_SYSTEM.md

**Add Sections**:
- Provider Capability Integration
- Plugin Hooks
- Node Type Linkage
- Generation Strategy Compatibility
- Frontend UI Guide

---

### 2. ACTION_PROMPT_ENGINE_SPEC.md

**Update**:
- Add prompt versioning integration section
- Document bridge between action blocks and prompt families
- Add analytics tracking for action blocks
- Update examples to show versioned blocks

---

### 3. NARRATIVE_PROMPT_ENGINE_SPEC.md

**Update**:
- Add NPC preference integration
- Document variable sources from plugins
- Add provider-specific template examples
- Link to prompt versioning for dialogue history

---

### 4. New: PROMPT_PLUGIN_GUIDE.md

**Create**:
- How plugins contribute prompt enhancements
- Variable source registration
- Prompt transformer patterns
- Validation hook examples
- Example: Seduction node prompt integration

---

## Migration Strategy

### Backward Compatibility

**Principle**: All changes should be **additive**, not breaking

**Safeguards**:
1. New fields in `PromptVersion` are optional
2. Existing prompt workflows continue unchanged
3. Provider validation is opt-in initially
4. Plugin hooks are optional extensions

---

### Rollout Plan

#### Week 1-2: Foundation
- [ ] Add provider capability validation
- [ ] Create basic frontend UI (family list, version history)
- [ ] Add node type linkage to prompt families

#### Week 3-4: Integration
- [ ] Implement plugin prompt hooks
- [ ] Update generation service to use prompt versioning
- [ ] Add prompt picker to node inspector

#### Week 5-6: Advanced Features
- [ ] Action block versioning bridge
- [ ] NPC-aware templates
- [ ] Strategy-aware prompts

#### Week 7-8: Polish
- [ ] Analytics dashboard
- [ ] Smart suggestions
- [ ] Documentation updates
- [ ] User testing

---

## Success Metrics

### Technical Metrics
- [ ] 100% of generation nodes can reference versioned prompts
- [ ] Provider validation prevents 95%+ of prompt limit errors
- [ ] Plugin prompt hooks used by 3+ plugins
- [ ] Action blocks linked to prompt versions for tracking

### User Metrics
- [ ] Prompt reuse increases by 40%
- [ ] Generation success rate improves by 15%
- [ ] Average time to create prompt decreases by 30%
- [ ] User satisfaction with prompt management: 8/10

---

## Risks & Mitigation

### Risk 1: Performance Impact
**Concern**: Provider capability lookups slow down generation

**Mitigation**:
- Cache capabilities (5 min TTL)
- Async validation
- Fail gracefully if validation times out

---

### Risk 2: Plugin API Complexity
**Concern**: Prompt hooks too complex for plugin authors

**Mitigation**:
- Provide high-level helpers
- Create example plugins
- Comprehensive documentation
- TypeScript types for safety

---

### Risk 3: Data Migration
**Concern**: Linking existing generations to prompt versions

**Mitigation**:
- Historical inference endpoint already exists
- Run batch inference during low-traffic period
- Make linkage optional (nullable foreign key)

---

## Conclusion

The PixSim7 prompt system has **excellent foundations** but is **disconnected from recent architecture**. The modernization plan is:

1. **Connect existing systems** (provider capabilities, frontend)
2. **Integrate with new features** (plugins, node types, strategies)
3. **Add missing bridges** (action blocks, analytics)
4. **Optimize for usability** (suggestions, validation, UI)

**Estimated Effort**: 8-10 weeks full-time
**Priority**: High (affects generation quality and user workflows)
**Risk**: Low (all changes are additive)

---

**Next Steps**:
1. Review this analysis with team
2. Prioritize phases based on user needs
3. Assign technical leads for each phase
4. Create detailed implementation tickets
5. Begin Phase 1 development

---

**Last Updated**: 2025-11-18
**Author**: Claude Sonnet 4.5
**Review Status**: Pending team review
