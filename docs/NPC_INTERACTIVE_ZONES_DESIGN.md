# NPC Interactive Zones System

## Overview

Enhance the NPC response system with designated body regions/zones where tools have different effectiveness. Since NPCs use video segments (not continuous video), we use **static zone definitions per segment** with metadata-driven coordinates.

## Problem

- Tools (feather, brush, etc.) should be more/less effective on different body parts
- NPCs move between video segments, so zones need to adapt
- Can't use real-time tracking (too complex for segmented video)
- Need interactive UI to show where tools can be used

## Solution: Metadata-Driven Zone System

### Architecture

```
Video Segment
  ↓
Zone Metadata (static per segment)
  ↓
Interactive Zone Overlay (UI)
  ↓
Tool Effectiveness Calculation
  ↓
NPC Response Graph (updated with zone context)
```

## Core Types

### 1. Zone Definition (Per Video Segment)

```typescript
/**
 * Interactive zone on NPC body
 * Coordinates are percentage-based (0-100) relative to video dimensions
 */
export interface NpcBodyZone {
  id: string;                    // e.g., "left_foot", "back", "arms"
  label: string;                 // Display name: "Left Foot"

  // Visual representation
  shape: 'rect' | 'circle' | 'polygon';

  // Coordinates (percentage-based, 0-100)
  // For rect: { x, y, width, height }
  // For circle: { cx, cy, radius }
  // For polygon: { points: [{x, y}, ...] }
  coords: ZoneCoords;

  // Zone properties
  sensitivity: number;           // 0.0-1.0 (how sensitive to touch)
  ticklishness?: number;         // 0.0-1.0 (for tickle tools)
  pleasure?: number;             // 0.0-1.0 (for pleasure tools)

  // Tool effectiveness modifiers
  toolModifiers?: {
    [toolId: string]: number;    // Multiplier (e.g., feather: 1.5)
  };

  // Visual feedback
  highlightColor?: string;
  hoverEffect?: 'glow' | 'pulse' | 'outline';
}

export type ZoneCoords =
  | { type: 'rect'; x: number; y: number; width: number; height: number }
  | { type: 'circle'; cx: number; cy: number; radius: number }
  | { type: 'polygon'; points: Array<{ x: number; y: number }> };

/**
 * Zone configuration for a video segment
 */
export interface VideoSegmentZones {
  segmentId: string;             // Which video segment
  zones: NpcBodyZone[];          // Active zones in this segment

  // Optional: Timestamp-based zones (for segments with movement)
  timelineZones?: {
    timestamp: number;           // Seconds into segment
    zones: NpcBodyZone[];        // Zones active at this time
  }[];
}
```

### 2. Tool Effectiveness System

```typescript
/**
 * Extend InteractiveTool with zone effectiveness
 */
export interface InteractiveToolWithZones extends InteractiveTool {
  // Zone-specific effectiveness
  zoneEffectiveness?: {
    [zoneId: string]: {
      multiplier: number;        // Effectiveness multiplier
      sensation?: string;        // Override sensation type
      description?: string;      // "Extra ticklish here!"
    };
  };

  // Default effectiveness for unlisted zones
  defaultZoneMultiplier?: number;
}

// Example: Feather tool
const featherTool: InteractiveToolWithZones = {
  id: 'feather',
  name: 'Feather',
  // ... existing tool config
  zoneEffectiveness: {
    'feet': { multiplier: 2.0, description: 'Very ticklish!' },
    'ribs': { multiplier: 1.8, description: 'Extremely sensitive' },
    'back': { multiplier: 1.2, description: 'Lightly ticklish' },
    'arms': { multiplier: 1.0, description: 'Normal sensitivity' },
  },
  defaultZoneMultiplier: 0.8,
};
```

### 3. Zone Interaction Event

```typescript
/**
 * Extended tool interaction event with zone context
 */
export interface ZoneToolInteractionEvent extends ToolInteractionEvent {
  // Zone that was interacted with
  zone?: {
    id: string;
    sensitivity: number;
    effectivenessMultiplier: number;  // Tool effectiveness in this zone
  };

  // Calculated effective intensity (base * zone multiplier)
  effectiveIntensity: number;
}

// Example usage in evaluator
const event: ZoneToolInteractionEvent = {
  tool: 'feather',
  pressure: 0.7,
  duration: 2.5,
  zone: {
    id: 'left_foot',
    sensitivity: 0.9,
    effectivenessMultiplier: 2.0,  // Feather is 2x effective on feet
  },
  effectiveIntensity: 0.7 * 2.0 * 0.9 = 1.26,  // Clamped to 1.0
};
```

### 4. NPC Response Metadata (Extended)

```typescript
export interface NpcResponseMetadata {
  // ... existing fields

  // Zone configuration
  zones?: {
    // Zone definitions per video segment
    segments: VideoSegmentZones[];

    // Global zone templates (reusable across segments)
    templates?: {
      [templateId: string]: NpcBodyZone[];
    };

    // Zone-specific response modifiers
    zoneResponseModifiers?: {
      [zoneId: string]: {
        pleasureMultiplier?: number;
        tickleMultiplier?: number;
        expressionOverride?: string;
      };
    };
  };
}

// Example: Define zones for different video segments
const npcMetadata: NpcResponseMetadata = {
  npc: { name: 'Emma' },
  zones: {
    segments: [
      {
        segmentId: 'idle_standing',
        zones: [
          {
            id: 'left_foot',
            label: 'Left Foot',
            shape: 'circle',
            coords: { type: 'circle', cx: 35, cy: 85, radius: 8 },
            sensitivity: 0.9,
            ticklishness: 1.0,
            toolModifiers: { feather: 2.0, brush: 1.5 },
          },
          {
            id: 'right_foot',
            label: 'Right Foot',
            shape: 'circle',
            coords: { type: 'circle', cx: 65, cy: 85, radius: 8 },
            sensitivity: 0.9,
            ticklishness: 1.0,
            toolModifiers: { feather: 2.0, brush: 1.5 },
          },
          {
            id: 'back',
            label: 'Back',
            shape: 'rect',
            coords: { type: 'rect', x: 40, y: 30, width: 20, height: 30 },
            sensitivity: 0.6,
            ticklishness: 0.7,
            toolModifiers: { feather: 1.2, massage: 1.8 },
          },
        ],
      },
      {
        segmentId: 'sitting_chair',
        zones: [
          // Different zone layout when sitting
          {
            id: 'lap',
            label: 'Lap',
            shape: 'rect',
            coords: { type: 'rect', x: 30, y: 50, width: 40, height: 20 },
            sensitivity: 0.5,
          },
          // Feet might be in different position
          {
            id: 'feet',
            label: 'Feet',
            shape: 'polygon',
            coords: {
              type: 'polygon',
              points: [
                { x: 20, y: 80 },
                { x: 40, y: 75 },
                { x: 45, y: 90 },
                { x: 25, y: 95 },
              ]
            },
            sensitivity: 0.9,
            ticklishness: 1.0,
          },
        ],
      },
    ],

    // Zone-specific response modifiers
    zoneResponseModifiers: {
      'left_foot': {
        tickleMultiplier: 1.5,
        expressionOverride: 'giggling',
      },
      'back': {
        pleasureMultiplier: 1.3,
      },
    },
  },
};
```

## Implementation

### 1. Interactive Zone Overlay Component

**File: `apps/main/src/components/npc/InteractiveZoneOverlay.tsx`**

```typescript
import { useState, useRef } from 'react';
import type { NpcBodyZone, VideoSegmentZones } from '@pixsim7/types';

interface InteractiveZoneOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  currentSegmentId: string;
  segmentZones: VideoSegmentZones[];
  activeTool?: string;
  onZoneInteraction: (zoneId: string, coords: { x: number; y: number }) => void;
}

export function InteractiveZoneOverlay({
  videoRef,
  currentSegmentId,
  segmentZones,
  activeTool,
  onZoneInteraction,
}: InteractiveZoneOverlayProps) {
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Get zones for current segment
  const currentZones = segmentZones.find(s => s.segmentId === currentSegmentId)?.zones || [];

  const handleClick = (e: React.MouseEvent) => {
    if (!overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Check which zone was clicked
    const clickedZone = currentZones.find(zone => isPointInZone(x, y, zone));
    if (clickedZone) {
      onZoneInteraction(clickedZone.id, { x, y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Check which zone is hovered
    const hovered = currentZones.find(zone => isPointInZone(x, y, zone));
    setHoveredZone(hovered?.id || null);
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-auto cursor-pointer"
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredZone(null)}
    >
      {/* Render zones */}
      {currentZones.map(zone => (
        <ZoneShape
          key={zone.id}
          zone={zone}
          isHovered={hoveredZone === zone.id}
          activeTool={activeTool}
        />
      ))}

      {/* Show zone tooltip on hover */}
      {hoveredZone && (
        <ZoneTooltip
          zone={currentZones.find(z => z.id === hoveredZone)!}
          activeTool={activeTool}
        />
      )}
    </div>
  );
}

function ZoneShape({ zone, isHovered, activeTool }: {
  zone: NpcBodyZone;
  isHovered: boolean;
  activeTool?: string;
}) {
  const effectiveness = activeTool && zone.toolModifiers?.[activeTool];
  const opacity = isHovered ? 0.4 : 0.1;
  const color = zone.highlightColor || (effectiveness && effectiveness > 1 ? '#ff6b6b' : '#4dabf7');

  if (zone.coords.type === 'rect') {
    return (
      <div
        className="absolute transition-opacity duration-200"
        style={{
          left: `${zone.coords.x}%`,
          top: `${zone.coords.y}%`,
          width: `${zone.coords.width}%`,
          height: `${zone.coords.height}%`,
          backgroundColor: color,
          opacity,
          border: isHovered ? `2px solid ${color}` : 'none',
          borderRadius: '4px',
          pointerEvents: 'none',
        }}
      />
    );
  }

  if (zone.coords.type === 'circle') {
    return (
      <div
        className="absolute transition-opacity duration-200"
        style={{
          left: `${zone.coords.cx - zone.coords.radius}%`,
          top: `${zone.coords.cy - zone.coords.radius}%`,
          width: `${zone.coords.radius * 2}%`,
          height: `${zone.coords.radius * 2}%`,
          backgroundColor: color,
          opacity,
          border: isHovered ? `2px solid ${color}` : 'none',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />
    );
  }

  // Polygon (SVG)
  if (zone.coords.type === 'polygon') {
    const points = zone.coords.points.map(p => `${p.x}%,${p.y}%`).join(' ');
    return (
      <svg className="absolute inset-0 pointer-events-none">
        <polygon
          points={points}
          fill={color}
          opacity={opacity}
          stroke={isHovered ? color : 'none'}
          strokeWidth={isHovered ? 2 : 0}
        />
      </svg>
    );
  }

  return null;
}

function ZoneTooltip({ zone, activeTool }: { zone: NpcBodyZone; activeTool?: string }) {
  const effectiveness = activeTool && zone.toolModifiers?.[activeTool];
  const description = effectiveness && effectiveness > 1
    ? `${zone.label} - Very effective! (${effectiveness}x)`
    : zone.label;

  return (
    <div className="absolute top-2 left-2 bg-black/80 text-white px-3 py-2 rounded text-sm pointer-events-none">
      {description}
      {zone.ticklishness && zone.ticklishness > 0.7 && (
        <div className="text-xs text-red-300">⚡ Highly ticklish!</div>
      )}
    </div>
  );
}

function isPointInZone(x: number, y: number, zone: NpcBodyZone): boolean {
  if (zone.coords.type === 'rect') {
    return (
      x >= zone.coords.x &&
      x <= zone.coords.x + zone.coords.width &&
      y >= zone.coords.y &&
      y <= zone.coords.y + zone.coords.height
    );
  }

  if (zone.coords.type === 'circle') {
    const dx = x - zone.coords.cx;
    const dy = y - zone.coords.cy;
    return Math.sqrt(dx * dx + dy * dy) <= zone.coords.radius;
  }

  if (zone.coords.type === 'polygon') {
    // Point-in-polygon algorithm (ray casting)
    const points = zone.coords.points;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  return false;
}
```

### 2. Update NpcResponseEvaluator with Zone Context

**File: `packages/scene-gizmos/src/npcResponseEvaluator.ts`**

```typescript
export class NpcResponseEvaluator {
  private metadata: NpcResponseMetadata;
  private state: EvaluationState;
  private nodeOutputCache: Map<string, Map<string, any>>;
  private currentSegmentId?: string;  // NEW

  /**
   * Set current video segment (to determine active zones)
   */
  setCurrentSegment(segmentId: string): void {
    this.currentSegmentId = segmentId;
  }

  /**
   * Get zones for current segment
   */
  getCurrentZones(): NpcBodyZone[] {
    if (!this.currentSegmentId || !this.metadata.zones?.segments) {
      return [];
    }

    const segmentZones = this.metadata.zones.segments.find(
      s => s.segmentId === this.currentSegmentId
    );

    return segmentZones?.zones || [];
  }

  /**
   * Evaluate with zone context
   */
  evaluate(event: ToolInteractionEvent, zoneId?: string): VideoGenerationOutput | null {
    // Clear cache
    this.nodeOutputCache.clear();

    // Calculate zone effectiveness
    let effectiveIntensity = event.pressure || 0.5;
    let zoneContext: any = null;

    if (zoneId) {
      const zones = this.getCurrentZones();
      const zone = zones.find(z => z.id === zoneId);

      if (zone) {
        // Apply zone sensitivity
        effectiveIntensity *= zone.sensitivity;

        // Apply tool-specific modifiers
        const toolModifier = zone.toolModifiers?.[event.tool] || 1.0;
        effectiveIntensity *= toolModifier;

        // Apply zone response modifiers
        const responseModifier = this.metadata.zones?.zoneResponseModifiers?.[zoneId];

        zoneContext = {
          zone,
          effectivenessMultiplier: toolModifier,
          responseModifier,
        };
      }
    }

    // Clamp intensity
    effectiveIntensity = Math.min(1.0, effectiveIntensity);

    // Create extended event
    const extendedEvent: any = {
      ...event,
      effectiveIntensity,
      zoneContext,
    };

    // Evaluate graph with zone context
    const outputNode = this.metadata.responseGraph.nodes.find(
      n => n.type === 'video.output'
    );

    if (!outputNode) {
      console.error('[NpcResponseEvaluator] No output node found');
      return null;
    }

    const outputs = this.evaluateNode(outputNode, extendedEvent);
    return this.buildVideoOutput(outputs, zoneContext);
  }

  private buildVideoOutput(
    outputs: Map<string, any>,
    zoneContext: any
  ): VideoGenerationOutput | null {
    const expression = outputs.get('expression') as string;
    const emotion = outputs.get('emotion') as string;
    const intensity = outputs.get('intensity') as number;
    const animation = outputs.get('animation') as string;

    // Apply zone-specific expression overrides
    let finalExpression = expression;
    if (zoneContext?.responseModifier?.expressionOverride) {
      finalExpression = zoneContext.responseModifier.expressionOverride;
    }

    return {
      npcId: this.metadata.npc.id,
      npcName: this.metadata.npc.name,
      npcBaseImage: this.metadata.npc.avatarUrl,
      expression: finalExpression,
      emotion,
      animation,
      intensity,
      prompt: outputs.get('prompt') as string | undefined,
      negativePrompt: this.metadata.videoGen.basePrompt,
      style: this.metadata.videoGen.style,
      loras: this.metadata.videoGen.style?.loras,
      seed: outputs.get('seed') as number | undefined,
      // Include zone context in output
      zoneId: zoneContext?.zone?.id,
    };
  }
}
```

### 3. Response Graph Nodes - Add Zone Input

Add new node types to the response graph:

```typescript
// New node type: Zone Context Input
{
  type: 'input.zone',
  outputs: ['zone_id', 'sensitivity', 'effectiveness']
}

// Example usage in graph:
const graph = {
  nodes: [
    {
      id: 'zone_input',
      type: 'input.zone',
      outputs: ['zone_id', 'sensitivity', 'effectiveness'],
    },
    {
      id: 'tickle_check',
      type: 'logic.compare',
      inputs: ['zone_id'],
      config: { operation: 'equals', value: 'feet' },
      outputs: ['result'],
    },
    {
      id: 'intense_giggle',
      type: 'video.expression',
      inputs: ['tickle_check.result'],
      config: {
        expression: 'giggling',
        intensity: 0.9,
      },
      outputs: ['expression'],
    },
  ],
  connections: [
    { from: 'zone_input.zone_id', to: 'tickle_check.zone_id' },
    { from: 'tickle_check.result', to: 'intense_giggle.active' },
  ],
};
```

## Benefits

1. **Intuitive Interaction**: Visual zones show where tools work
2. **Variable Effectiveness**: Different zones have different sensitivity
3. **Segment-Aware**: Zones adapt to different video segments/poses
4. **Tool Specialization**: Each tool can be effective on different zones
5. **Rich Feedback**: Tooltips and highlights guide player
6. **Graph Integration**: Zone context flows through response graph
7. **No Tracking Needed**: Static zones avoid complex video analysis

## Example Use Cases

### Use Case 1: Tickle Minigame

```typescript
// Emma is tied up, player uses feather on different zones
const tickleGame = {
  npc: 'Emma',
  zones: {
    segments: [{
      segmentId: 'tied_standing',
      zones: [
        { id: 'feet', ticklishness: 1.0, toolModifiers: { feather: 3.0 } },
        { id: 'ribs', ticklishness: 0.9, toolModifiers: { feather: 2.5 } },
        { id: 'armpits', ticklishness: 0.95, toolModifiers: { feather: 2.8 } },
        { id: 'back', ticklishness: 0.6, toolModifiers: { feather: 1.2 } },
      ],
    }],
  },
};

// Player clicks on feet with feather
// → Effectiveness: 3.0x multiplier
// → Expression: "giggling" or "laughing"
// → Animation: "wiggling_toes"
```

### Use Case 2: Massage Scene

```typescript
// Relaxing massage with pressure-sensitive zones
const massageScene = {
  npc: 'Emma',
  zones: {
    segments: [{
      segmentId: 'lying_stomach',
      zones: [
        { id: 'shoulders', sensitivity: 0.8, toolModifiers: { massage: 2.0 } },
        { id: 'lower_back', sensitivity: 0.9, toolModifiers: { massage: 2.5 } },
        { id: 'legs', sensitivity: 0.6, toolModifiers: { massage: 1.5 } },
      ],
    }],
  },
};

// Player uses massage tool on lower_back
// → Effectiveness: 2.5x multiplier
// → Expression: "relaxed" or "pleased"
// → Emotion: "content"
```

### Use Case 3: Multi-Segment Interaction

```typescript
// NPC can move between segments
const multiSegment = {
  zones: {
    segments: [
      {
        segmentId: 'standing_idle',
        zones: [
          { id: 'hair', coords: { type: 'circle', cx: 50, cy: 15, radius: 10 } },
          { id: 'face', coords: { type: 'circle', cx: 50, cy: 25, radius: 12 } },
        ],
      },
      {
        segmentId: 'sitting_down',
        zones: [
          // Same zones, different positions
          { id: 'hair', coords: { type: 'circle', cx: 50, cy: 20, radius: 10 } },
          { id: 'face', coords: { type: 'circle', cx: 50, cy: 30, radius: 12 } },
          { id: 'lap', coords: { type: 'rect', x: 30, y: 55, width: 40, height: 20 } },
        ],
      },
    ],
  },
};

// When video segment changes, zones automatically update
evaluator.setCurrentSegment('sitting_down');
```

## Tooling: Zone Editor

Consider building a zone editor UI:

```typescript
// Zone editor for content creators
function ZoneEditor() {
  return (
    <div>
      <VideoPlayer />
      <ZoneCanvas
        onDrawZone={(zone) => {
          // Save zone definition
          saveZone(currentSegment, zone);
        }}
      />
      <ZoneList
        zones={currentZones}
        onEdit={(zone) => editZone(zone)}
        onDelete={(zoneId) => deleteZone(zoneId)}
      />
    </div>
  );
}
```

## Summary

This zone system provides:
- ✅ **Static zone definitions** per video segment (no tracking needed)
- ✅ **Tool effectiveness modifiers** per zone
- ✅ **Interactive UI overlay** with visual feedback
- ✅ **Integration with response graphs** (zone context as input)
- ✅ **Segment-aware** (zones adapt to different poses)
- ✅ **Rich metadata** (sensitivity, ticklishness, pleasure)
- ✅ **Creator-friendly** (could build zone editor)

Works perfectly with your segmented video approach!
