# Romance & Sensual Touch Plugin System

Comprehensive romance gameplay system with gizmo-based interactive mechanics, similar to the pickpocket plugin but for intimate/romantic interactions.

## Overview

The Romance Plugin provides a complete system for sensual touch and romantic interactions with NPCs:

- **Interaction Plugin**: Frontend interaction type (`sensualize`) that players can trigger
- **Backend API**: Game mechanics calculating pleasure scores, arousal, and relationship changes
- **Gizmo System**: Interactive body map UI for touch-based gameplay
- **Tool Registry**: Multiple unlockable touch tools (caress, feather, silk, pleasure)
- **NPC Preferences**: Each NPC has unique preferences for tools, patterns, and intensity

## Architecture

```
Frontend:
  ├── Interaction Plugin (sensualize.ts)
  │   └── Triggers API call to backend
  ├── Gizmo System (BodyMapGizmo.tsx)
  │   └── Interactive UI for touch gameplay
  └── Tool Registry (registry-romance.ts)
      └── Defines available touch tools

Backend:
  └── Romance Plugin (game_romance/manifest.py)
      ├── /game/romance/sensual-touch
      └── /game/romance/npc-preferences/{npc_id}

Types:
  └── @pixsim7/types (packages/types/src/game.ts)
      ├── SensualTouchRequest
      └── SensualTouchResponse
```

## File Structure

### Frontend Files

```
frontend/src/
├── lib/
│   ├── game/interactions/
│   │   └── sensualize.ts                 # Interaction plugin definition
│   ├── gizmos/
│   │   ├── registry-romance.ts           # Romance tool registry
│   │   └── loadDefaultPacks.ts           # Imports romance pack
│   └── api/
│       └── game.ts                       # API method: attemptSensualTouch
├── components/gizmos/
│   ├── BodyMapGizmo.tsx                  # Interactive body map UI (TODO: visual enhancements)
│   └── BodyMapGizmo.css                  # Styles for body map
```

### Backend Files

```
pixsim7/backend/main/
└── plugins/
    └── game_romance/
        ├── __init__.py
        └── manifest.py                    # Plugin manifest with routes
```

### Type Definitions

```
packages/types/src/game.ts                 # SensualTouchRequest/Response types
```

## Usage

### Player Perspective

1. **Trigger Interaction**: Player selects "Sensual Touch" 💕 on an NPC slot
2. **Check Prerequisites**:
   - Relationship level must be ≥50 OR NPC has consented
   - Selected tool must be unlocked
3. **Launch Gizmo**: Interactive body map opens
4. **Perform Touch**: Player uses tool on body zones
5. **Receive Feedback**:
   - Success: Pleasure score, arousal increase, affinity gain
   - Failure: Affinity penalty
   - Tool Unlock: New tools at threshold levels

### Configuration

The interaction plugin accepts these config parameters:

```typescript
{
  selectedTool: 'touch' | 'caress' | 'feather' | 'silk' | 'temperature' | 'pleasure',
  pattern: 'circular' | 'linear' | 'spiral' | 'wave' | 'pulse',
  baseIntensity: 0.5,      // 0-1
  duration: 30,            // seconds
  minimumAffinity: 50,     // Required relationship level
  onSuccessFlags: ['romance:intimate_moment', 'npc_aroused'],
  onFailFlags: ['romance:rejected', 'npc_uncomfortable']
}
```

## Interactive Tools

The romance system includes 6 touch tools with unique characteristics:

### 1. Touch (Hand) - Always Available
- **Type**: `touch`
- **Visual**: Hand model (TODO: 3D model)
- **Physics**: Moderate pressure (0.5), moderate speed (0.5)
- **Feedback**: Hearts particles, soft haptics
- **Unlock**: Level 0 (always available)

### 2. Caress - Level 10+
- **Type**: `caress`
- **Visual**: Gentle hand with pink glow
- **Physics**: Light pressure (0.4), slow speed (0.3)
- **Feedback**: Hearts particles, wave haptics
- **Best For**: NPCs who prefer gentle touch

### 3. Feather - Level 20+
- **Type**: `tease`
- **Visual**: White feather with petal particles
- **Physics**: Very light pressure (0.2), fast speed (0.6)
- **Feedback**: Petal particles, tickle haptics, giggles
- **Best For**: Playful, teasing interactions

### 4. Silk - Level 40+
- **Type**: `caress`
- **Visual**: Purple silk cloth with smooth trails
- **Physics**: Light pressure (0.35), slow speed (0.4), high viscosity
- **Feedback**: Flowing particles, smooth wave haptics
- **Best For**: Luxurious, sensual touch

### 5. Temperature - Level 60+
- **Type**: `temperature`
- **Visual**: Ice/flame with heat distortion
- **Physics**: Light pressure (0.3), variable temperature (0-1)
- **Feedback**: Frost/steam particles, gasps
- **Best For**: NPCs who like intense sensations

### 6. Pleasure - Level 80+
- **Type**: `pleasure`
- **Visual**: Electric pink with intense glow
- **Physics**: Firm pressure (0.7), vibration (0.8)
- **Feedback**: Intense particles, vibrate haptics, moans
- **Best For**: Advanced intimate interactions
- **Cooldown**: 2 seconds between uses

## NPC Preferences

Each NPC has unique preferences that affect pleasure scores:

### Preference Types

1. **Gentle NPCs** (Even IDs)
   - Preferred Tools: Feather (0.9), Caress (0.8)
   - Preferred Patterns: Circular (0.8), Wave (0.8)
   - Sensitivity: 1.5 (more sensitive)
   - Preferred Intensity: 0.3-0.6 (gentle)
   - Arousal Rate: 0.8 (slower build)

2. **Intense NPCs** (Odd IDs)
   - Preferred Tools: Temperature (0.9), Energy (0.9)
   - Preferred Patterns: Pulse (0.9), Zigzag (0.8)
   - Sensitivity: 0.8 (less sensitive)
   - Preferred Intensity: 0.6-0.9 (firm)
   - Arousal Rate: 1.2 (faster build)

### Pleasure Score Calculation

```python
score = 0.5  # Baseline

# Tool match (weight: 0.3)
score += (tool_affinity - 0.5) * 0.3

# Pattern match (weight: 0.2)
score += (pattern_affinity - 0.5) * 0.2

# Intensity match (weight: 0.3)
if min_intensity <= intensity <= max_intensity:
    score += 0.3
else:
    score -= abs(intensity - preferred) * 0.5

# Apply sensitivity multiplier
score *= sensitivity

# Add randomness (±0.1)
score += random(-0.1, 0.1)

# Clamp to 0-1
return clamp(score, 0, 1)
```

### Success Criteria

- **Success**: `pleasure_score >= 0.6`
- **Affinity Change**:
  - Success: `+0 to +15` points (based on pleasure)
  - Failure: `-5` points
- **Arousal Change**: `±0.2 to ±0.5` (based on pleasure × arousal_rate)

## Tool Unlocks

Tools unlock automatically at relationship thresholds:

```typescript
toolUnlockLevels = {
  touch: 0,        // Always available
  caress: 10,      // Unlocked at level 10
  feather: 20,     // Unlocked at level 20
  silk: 40,        // Unlocked at level 40
  temperature: 60, // Unlocked at level 60
  pleasure: 80,    // Unlocked at level 80
}
```

When crossing a threshold:
1. Backend checks `current_affinity < threshold <= new_affinity`
2. Unlocks tool and adds to `npc_rel.flags.unlocked_tools[]`
3. Returns `tool_unlocked` in response
4. Frontend shows notification: "🔓 New tool unlocked: feather!"

## Gizmo System

### Body Map Gizmo

The interactive UI for sensual touch gameplay:

**Features:**
- 12 body zones (face, neck, shoulders, chest, back, arms, hands, waist, hips, thighs, legs, feet)
- Real-time cursor tracking
- Zone highlighting on hover
- Particle effects on touch
- Pleasure meter visualization
- Touch intensity control (scroll wheel)

**TODO for Opus AI:**
- [ ] Create elegant body silhouette (SVG or 3D model)
- [ ] Implement animated cursor/hand following mouse
- [ ] Add beautiful particle effects system
- [ ] Design romantic pleasure meter UI
- [ ] Add ambient background effects
- [ ] Create 3D hand model with finger articulation
- [ ] Implement zone-specific animations
- [ ] Add audio feedback system

See `frontend/src/components/gizmos/BodyMapGizmo.tsx` for detailed TODO comments.

## API Reference

### POST `/api/v1/game/romance/sensual-touch`

Attempt a sensual touch interaction with an NPC.

**Request:**
```typescript
{
  npc_id: number;
  slot_id: string;
  tool_id: string;
  pattern: string;
  base_intensity: number;  // 0-1
  duration: number;        // seconds
  world_id?: number | null;
  session_id: number;
}
```

**Response:**
```typescript
{
  success: boolean;
  pleasure_score: number;      // 0-1
  arousal_change: number;      // -0.2 to 0.5
  affinity_change: number;     // -5 to +15
  tool_unlocked: string | null;
  updated_flags: Record<string, unknown>;
  message: string;
}
```

**Status Codes:**
- `200`: Success
- `400`: Invalid intensity (not 0-1)
- `404`: Session not found

### GET `/api/v1/game/romance/npc-preferences/{npc_id}`

Get NPC's romance preferences (for debugging/hints).

**Response:**
```typescript
{
  preferred_tools: Record<string, number>;    // Tool ID → affinity (0-1)
  preferred_patterns: Record<string, number>; // Pattern → affinity (0-1)
  sensitivity: number;                        // Sensitivity multiplier
  preferred_intensity: [number, number];      // [min, max] range
  arousal_rate: number;                       // Arousal build rate
}
```

**TODO**: Gate this by relationship level in production (players shouldn't see exact preferences unless they've learned them through gameplay).

## Session Data Structure

The romance system updates `GameSession` with:

### Relationship Data (`session.relationships[npc_key]`)

```typescript
{
  affinity: number;          // 0-100
  score: number;             // Legacy, synced with affinity
  arousal: number;           // 0-1, current arousal level
  flags: {
    'romance:consented': boolean;
    'romance:sensual_touch_success': boolean;
    'romance:sensual_touch_failed': boolean;
    'romance:tool_used_<tool_id>': boolean;
    'unlocked_tools': string[];
  }
}
```

### Session Flags (`session.flags.romance`)

```typescript
{
  sensual_touch_attempts: [
    {
      npc_id: number;
      slot_id: string;
      tool_id: string;
      pattern: string;
      intensity: number;
      success: boolean;
      pleasure_score: number;
      arousal_change: number;
      affinity_change: number;
    },
    // ... more attempts
  ]
}
```

## Integration with Existing Systems

### Similar to Pickpocket Plugin

The romance plugin follows the same architecture as pickpocket:

| Aspect | Pickpocket | Romance |
|--------|-----------|---------|
| Plugin ID | `pickpocket` | `sensualize` |
| Category | `stealth` | `romance` |
| Icon | 🤏 | 💕 |
| UI Mode | `notification` | `minigame` |
| Risk | Detection | Rejection |
| Backend | `/game/stealth/pickpocket` | `/game/romance/sensual-touch` |
| Success Metric | Random roll | Pleasure score calculation |
| Relationship Impact | -10 on detection | -5 to +15 based on performance |

### Integration Points

1. **Interaction System**: Registered in `interactionRegistry` alongside talk, pickpocket, persuade
2. **Gizmo System**: Uses existing `@pixsim7/scene-gizmos` infrastructure
3. **NPC Preferences**: Compatible with existing NPC preference system
4. **Tool System**: Extends `InteractiveTool` types
5. **Session Management**: Uses standard `GameSession` structure
6. **API Client**: Uses standard `apiClient` with type safety

## Testing

### Manual Testing Checklist

- [ ] Plugin appears in interaction menu
- [ ] Prerequisites enforced (relationship level, consent)
- [ ] Tool unlocks at correct thresholds
- [ ] Pleasure scores vary by NPC preferences
- [ ] Arousal meter updates correctly
- [ ] Affinity changes persist
- [ ] Success/fail flags set correctly
- [ ] Body map gizmo renders
- [ ] Cursor tracking works
- [ ] Particle effects appear
- [ ] Backend API responds correctly

### Test NPCs

Create test NPCs with known IDs:
- **NPC ID 2** (Gentle): Prefers feather, caress, circular patterns
- **NPC ID 3** (Intense): Prefers temperature, pulse patterns

## Future Enhancements

### Phase 2: Advanced Features
- [ ] Multi-stage seduction sequences
- [ ] Combo system (chain tools for bonuses)
- [ ] Mood system (NPC mood affects preferences)
- [ ] Location effects (privacy, ambiance)
- [ ] Relationship milestones with cutscenes
- [ ] Custom tool creation system

### Phase 3: Visual Polish
- [ ] Professional 3D hand models
- [ ] Full body character models
- [ ] Advanced particle systems
- [ ] Shader effects (heat waves, glow)
- [ ] Ambient audio system
- [ ] Voice lines for reactions

### Phase 4: Gameplay Depth
- [ ] Learning system (discover preferences through play)
- [ ] Consent/safe word mechanics
- [ ] Relationship progression trees
- [ ] Multiple interaction types (kissing, massage, etc.)
- [ ] Co-op scenarios (multiple NPCs)

## Troubleshooting

### Plugin doesn't appear in menu
- Check if `sensualizePlugin` is imported in `index.ts`
- Verify registration: `interactionRegistry.register(sensualizePlugin)`
- Check console for errors

### API calls fail
- Verify backend plugin is loaded: Check `/health` endpoint
- Confirm route: `/api/v1/game/romance/sensual-touch`
- Check session ID is valid

### Gizmo doesn't render
- Verify `BodyMapGizmo` component exists
- Check if romance pack is loaded in `loadDefaultPacks.ts`
- Look for TypeScript/runtime errors in console

### Tool not unlocking
- Check relationship level meets threshold
- Verify unlock logic in backend `determine_tool_unlock()`
- Check `unlocked_tools` array in session data

### Pleasure score always 0
- Verify NPC preferences are loaded
- Check tool/pattern IDs match exactly
- Ensure intensity is in valid range (0-1)

## Contributing

To extend the romance system:

1. **Add New Tools**: Register in `registry-romance.ts`
2. **Add New Patterns**: Update `TouchPattern` type in `@pixsim7/scene-gizmos`
3. **Add New Zones**: Update `bodyMapGizmo.defaultConfig.zones`
4. **Add NPC Presets**: Extend `get_npc_preferences()` in backend

## License

Part of the Pixsim7 project. See main LICENSE file.

## Credits

- **Architecture**: Based on pickpocket plugin system
- **Gizmo System**: Uses `@pixsim7/scene-gizmos` framework
- **Interactive Tools**: Inspired by NPC preference system
- **Visual Design**: TODO for Opus AI to implement

---

**Note**: This plugin contains mature content. Ensure proper content warnings and age gates are implemented in production.
