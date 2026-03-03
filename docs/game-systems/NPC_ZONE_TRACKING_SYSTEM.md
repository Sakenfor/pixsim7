# NPC Zone Tracking & Persistence System

## Overview

Advanced zone system that allows **defining zones once** on a reference frame and **tracking them across video segments**. Instead of manually defining zones for each segment, zones are tracked and persisted automatically.

## Problem

Current system requires manually defining zones for each video segment:
```typescript
{
  segmentId: 'standing_idle',
  zones: [{ id: 'left_foot', coords: { cx: 35, cy: 85, radius: 8 } }],
},
{
  segmentId: 'sitting_down',
  zones: [{ id: 'left_foot', coords: { cx: 40, cy: 75, radius: 8 } }],  // Different!
}
```

**Tedious for many segments!** What if we could:
1. Define zones **once** on a reference frame
2. **Track** those zones across other segments
3. **Persist** tracking data for reuse

## Solution: Zone Tracking System

### Architecture

```
Reference Frame (define zones here)
  ↓
Visual Tracking / Correspondence Mapping
  ↓
Tracked Zones (per segment)
  ↓
Persistence Layer (save/load tracking data)
```

## Core Types

### 1. Reference Frame & Zone Definition

```typescript
/**
 * Reference frame where zones are initially defined
 */
export interface ZoneReferenceFrame {
  /** Segment ID used as reference */
  referenceSegmentId: string;

  /** Frame timestamp within segment (seconds) */
  referenceTimestamp?: number;

  /** Optional: Reference image URL for visual tracking */
  referenceImageUrl?: string;

  /** Zones defined on this reference frame */
  zones: NpcBodyZone[];

  /** When this reference was created */
  createdAt: string;

  /** Metadata */
  metadata?: {
    createdBy?: string;
    notes?: string;
    version?: number;
  };
}
```

### 2. Zone Tracking Data

```typescript
/**
 * Tracking method used
 */
export type ZoneTrackingMethod =
  | 'manual'           // Manually defined for each segment
  | 'template'         // Visual template matching
  | 'keypoint'         // Keypoint-based tracking
  | 'correspondence'   // Manual correspondence mapping
  | 'pose'             // ML pose estimation
  | 'interpolation';   // Interpolated between keyframes

/**
 * Tracking result for a zone in a specific segment
 */
export interface ZoneTrackingResult {
  /** Zone ID from reference frame */
  zoneId: string;

  /** Segment where this zone was tracked */
  segmentId: string;

  /** Tracked coordinates */
  coords: ZoneCoords;

  /** Tracking method used */
  method: ZoneTrackingMethod;

  /** Confidence score (0-1) */
  confidence: number;

  /** Whether this was manually corrected */
  manuallyAdjusted?: boolean;

  /** Visual template data (for template matching) */
  template?: {
    /** Template image (base64 or URL) */
    imageData: string;
    /** Template dimensions */
    width: number;
    height: number;
  };

  /** Keypoint data (for keypoint tracking) */
  keypoints?: Array<{
    id: string;
    x: number;
    y: number;
  }>;
}

/**
 * Complete tracking data for an NPC
 */
export interface NpcZoneTrackingData {
  /** NPC identifier */
  npcId: string;

  /** Reference frame */
  reference: ZoneReferenceFrame;

  /** Tracked zones per segment */
  trackedZones: {
    [segmentId: string]: ZoneTrackingResult[];
  };

  /** Tracking settings */
  settings: {
    /** Auto-track new segments */
    autoTrack: boolean;
    /** Minimum confidence for auto-tracking */
    minConfidence: number;
    /** Preferred tracking method */
    preferredMethod: ZoneTrackingMethod;
  };

  /** Persistence metadata */
  metadata: {
    version: number;
    lastUpdated: string;
    totalSegments: number;
  };
}
```

### 3. Zone Correspondence Mapping

For manual correspondence (simplest method):

```typescript
/**
 * Manual correspondence between reference zones and segment zones
 * User marks "this is the same zone in a different pose"
 */
export interface ZoneCorrespondence {
  /** Zone ID from reference frame */
  referenceZoneId: string;

  /** Segment ID */
  segmentId: string;

  /** Corresponding coordinates in this segment */
  coords: ZoneCoords;

  /** Timestamp within segment (if applicable) */
  timestamp?: number;

  /** Notes */
  notes?: string;
}

/**
 * Correspondence map for all zones across segments
 */
export interface ZoneCorrespondenceMap {
  /** Reference frame info */
  reference: {
    segmentId: string;
    timestamp?: number;
  };

  /** All correspondences */
  correspondences: ZoneCorrespondence[];

  /** Interpolation settings */
  interpolation?: {
    /** Interpolate zones for segments between keyframes */
    enabled: boolean;
    /** Interpolation method */
    method: 'linear' | 'ease' | 'cubic';
  };
}
```

### 4. Visual Template Tracking

```typescript
/**
 * Visual template for template matching
 */
export interface ZoneVisualTemplate {
  zoneId: string;

  /** Template image (cropped from reference frame) */
  template: {
    /** Image data (base64 or blob URL) */
    imageData: string;
    /** Dimensions */
    width: number;
    height: number;
    /** Original position in reference frame */
    origin: { x: number; y: number };
  };

  /** Template matching parameters */
  matching: {
    /** Search radius around expected position */
    searchRadius: number;
    /** Similarity threshold (0-1) */
    threshold: number;
    /** Scale tolerance */
    scaleRange: { min: number; max: number };
  };
}

/**
 * Template tracking result
 */
export interface TemplateMatchResult {
  /** Whether a match was found */
  found: boolean;

  /** Match confidence (0-1) */
  confidence: number;

  /** Matched position */
  position?: { x: number; y: number };

  /** Matched scale (relative to original) */
  scale?: number;

  /** Match quality metrics */
  metrics?: {
    similarity: number;
    coverage: number;
  };
}
```

## Implementation Approaches

### Approach 1: Manual Correspondence (Simplest)

User defines zones once, then marks corresponding zones in other segments manually.

**Pros:**
- No complex algorithms needed
- Works for any pose/movement
- User has full control
- Very reliable

**Cons:**
- Manual work for each segment
- Time-consuming for many segments

**Use case:** When you have 5-10 segments with different poses.

```typescript
// 1. Define zones on reference frame (segment: 'standing_idle')
const reference = {
  referenceSegmentId: 'standing_idle',
  zones: [
    { id: 'left_foot', shape: 'circle', coords: { cx: 35, cy: 85, radius: 8 } },
    { id: 'right_foot', shape: 'circle', coords: { cx: 65, cy: 85, radius: 8 } },
  ],
};

// 2. Mark correspondences in other segments
const correspondences = [
  // Sitting pose
  { referenceZoneId: 'left_foot', segmentId: 'sitting_down',
    coords: { cx: 30, cy: 75, radius: 8 } },
  { referenceZoneId: 'right_foot', segmentId: 'sitting_down',
    coords: { cx: 55, cy: 75, radius: 8 } },

  // Lying pose
  { referenceZoneId: 'left_foot', segmentId: 'lying_stomach',
    coords: { cx: 85, cy: 60, radius: 7 } },
];

// 3. Auto-generate zones for all segments
const allZones = generateZonesFromCorrespondences(reference, correspondences);
```

### Approach 2: Template Matching (Semi-Automatic)

Extract visual templates from reference frame, match them in other segments.

**Pros:**
- Semi-automatic (less manual work)
- Good for similar poses
- Can track subtle movements

**Cons:**
- Requires computer vision library
- May fail on drastically different poses
- Needs fallback to manual

**Use case:** Tracking zones in segments with similar poses (idle → slight movement).

```typescript
// 1. Extract template from reference frame
const template = extractZoneTemplate(
  referenceFrameImage,
  { id: 'left_foot', coords: { cx: 35, cy: 85, radius: 8 } }
);

// 2. Match template in target segment
const result = matchTemplate(targetSegmentImage, template, {
  searchRadius: 20,  // Search within 20% of expected position
  threshold: 0.7,    // 70% similarity required
});

// 3. Use matched position or fall back to manual
const trackedZone = result.found
  ? { id: 'left_foot', coords: { cx: result.position.x, cy: result.position.y, radius: 8 } }
  : null;  // Require manual placement
```

### Approach 3: Keypoint-Based (Advanced)

Define anchor keypoints (e.g., "center of foot", "heel", "toe"), track those.

**Pros:**
- Flexible for different poses
- Can handle rotation/scaling
- More robust than template matching

**Cons:**
- Requires defining keypoints
- More complex implementation
- Still needs CV library

**Use case:** Tracking complex zones across very different poses.

```typescript
// 1. Define zone with keypoints
const zoneWithKeypoints = {
  id: 'left_foot',
  shape: 'polygon',
  keypoints: [
    { id: 'heel', x: 30, y: 90 },
    { id: 'toe', x: 40, y: 80 },
    { id: 'ankle', x: 35, y: 85 },
  ],
  // Polygon coords derived from keypoints
  coords: { type: 'polygon', points: [/* derived */] },
};

// 2. Track keypoints in target segment
const trackedKeypoints = trackKeypoints(
  targetSegmentImage,
  zoneWithKeypoints.keypoints
);

// 3. Reconstruct zone from tracked keypoints
const trackedZone = reconstructZoneFromKeypoints(
  zoneWithKeypoints,
  trackedKeypoints
);
```

### Approach 4: ML Pose Estimation (Fully Automatic)

Use pose estimation model (e.g., MediaPipe, OpenPose) to detect body parts automatically.

**Pros:**
- Fully automatic
- Works across all poses
- No manual work

**Cons:**
- Requires ML model (large dependency)
- May not detect custom zones (e.g., specific clothing areas)
- Overkill for simple use cases

**Use case:** When you have hundreds of segments and need full automation.

```typescript
// 1. Run pose estimation on reference frame
const refPose = estimatePose(referenceFrameImage);

// 2. Map zones to detected body parts
const zoneToBodyPartMap = {
  'left_foot': refPose.landmarks.left_ankle,
  'right_foot': refPose.landmarks.right_ankle,
  'back': refPose.landmarks.spine,
};

// 3. For each target segment, estimate pose and map zones
const targetPose = estimatePose(targetSegmentImage);
const trackedZones = mapZonesToPose(zoneToBodyPartMap, targetPose);
```

## Persistence Layer

### Storage Format

```typescript
/**
 * Persisted zone tracking data (JSON)
 */
interface PersistedZoneData {
  version: '1.0.0';
  npcId: string;

  // Reference frame
  reference: ZoneReferenceFrame;

  // Tracked zones (indexed by segment)
  segments: {
    [segmentId: string]: {
      zones: ZoneTrackingResult[];
      lastUpdated: string;
    };
  };

  // Settings
  settings: {
    autoTrack: boolean;
    preferredMethod: ZoneTrackingMethod;
    minConfidence: number;
  };
}
```

### Storage Locations

**Option 1: Database (Recommended for production)**
```typescript
// Store in database (PostgreSQL, MongoDB, etc.)
await db.npcZoneTracking.upsert({
  npcId: 'emma',
  trackingData: zoneTrackingData,
});
```

**Option 2: JSON Files (Recommended for development)**
```typescript
// Store as JSON file alongside video segments
// Structure:
// /assets/npcs/emma/
//   ├── segments/
//   │   ├── standing_idle.mp4
//   │   ├── sitting_down.mp4
//   │   └── lying_stomach.mp4
//   └── zones.json  ← Tracking data here

// Save
await fs.writeFile(
  '/assets/npcs/emma/zones.json',
  JSON.stringify(zoneTrackingData, null, 2)
);

// Load
const data = await fs.readFile('/assets/npcs/emma/zones.json', 'utf-8');
const zoneTrackingData = JSON.parse(data);
```

**Option 3: Scene Metadata**
```typescript
// Embed in scene node metadata
const sceneNode = {
  id: 'npc_emma',
  type: 'npc_response',
  metadata: {
    // ... other NPC metadata
    zoneTracking: zoneTrackingData,
  },
};
```

## Zone Editor UI Concept

### Workflow

```
1. Load NPC with reference segment
   ↓
2. Define zones on reference frame (draw on video)
   ↓
3. Choose tracking method:
   - Manual correspondence (mark zones in each segment)
   - Template matching (auto-track similar poses)
   - Keypoints (define anchor points)
   ↓
4. Review & adjust tracked zones
   ↓
5. Save tracking data
   ↓
6. Zones automatically load for all segments
```

### UI Components

```typescript
function ZoneEditor() {
  const [referenceFrame, setReferenceFrame] = useState<ZoneReferenceFrame>();
  const [currentSegment, setCurrentSegment] = useState('standing_idle');
  const [trackingData, setTrackingData] = useState<NpcZoneTrackingData>();
  const [mode, setMode] = useState<'define' | 'track' | 'review'>('define');

  return (
    <div className="zone-editor">
      {/* Reference Frame Panel */}
      <div className="reference-panel">
        <h3>Reference Frame</h3>
        <VideoPlayer segmentId={referenceFrame?.referenceSegmentId} />
        <ZoneCanvas
          zones={referenceFrame?.zones}
          onDraw={(zone) => addZoneToReference(zone)}
          mode="draw"
        />
      </div>

      {/* Segment Tracking Panel */}
      <div className="tracking-panel">
        <h3>Track Zones in Segments</h3>
        <SegmentSelector
          segments={allSegments}
          currentSegment={currentSegment}
          onSelect={setCurrentSegment}
          trackedStatus={(segmentId) =>
            trackingData?.trackedZones[segmentId]
              ? '✓ Tracked'
              : '○ Not tracked'
          }
        />

        <VideoPlayer segmentId={currentSegment} />

        {/* Tracking mode selector */}
        <div className="tracking-mode">
          <button onClick={() => trackManually(currentSegment)}>
            📍 Mark Manually
          </button>
          <button onClick={() => trackWithTemplate(currentSegment)}>
            🔍 Auto-Track (Template)
          </button>
          <button onClick={() => trackWithKeypoints(currentSegment)}>
            🎯 Track Keypoints
          </button>
        </div>

        {/* Zone overlay */}
        <ZoneOverlay
          zones={trackingData?.trackedZones[currentSegment]}
          editable={true}
          onAdjust={(zoneId, newCoords) =>
            adjustZone(currentSegment, zoneId, newCoords)
          }
        />
      </div>

      {/* Zone List & Settings */}
      <div className="zone-list">
        <h3>Zones</h3>
        {referenceFrame?.zones.map((zone) => (
          <ZoneItem
            key={zone.id}
            zone={zone}
            trackingStatus={getTrackingStatus(zone.id)}
            onEdit={() => editZone(zone.id)}
            onDelete={() => deleteZone(zone.id)}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="actions">
        <button onClick={() => saveTrackingData()}>
          💾 Save Tracking Data
        </button>
        <button onClick={() => loadTrackingData()}>
          📂 Load Tracking Data
        </button>
        <button onClick={() => exportZones()}>
          📤 Export Zones (JSON)
        </button>
      </div>
    </div>
  );
}
```

### Manual Correspondence Mode

```typescript
function ManualCorrespondenceMode({
  referenceZones,
  currentSegment,
  onMarkCorrespondence,
}: ManualCorrespondenceModeProps) {
  const [selectedRefZone, setSelectedRefZone] = useState<string>();

  return (
    <div className="correspondence-mode">
      {/* Reference frame (read-only) */}
      <div className="reference-side">
        <h4>Reference: {referenceFrame.segmentId}</h4>
        <VideoPlayer segmentId={referenceFrame.segmentId} />
        <ZoneOverlay
          zones={referenceZones}
          onSelect={(zoneId) => setSelectedRefZone(zoneId)}
          highlightedZone={selectedRefZone}
        />
      </div>

      {/* Target segment (editable) */}
      <div className="target-side">
        <h4>Target: {currentSegment}</h4>
        <VideoPlayer segmentId={currentSegment} />

        {selectedRefZone && (
          <div className="instruction">
            Click where "{selectedRefZone}" is in this segment
          </div>
        )}

        <ZoneCanvas
          mode="place"
          onPlace={(coords) => {
            if (selectedRefZone) {
              onMarkCorrespondence({
                referenceZoneId: selectedRefZone,
                segmentId: currentSegment,
                coords,
              });
            }
          }}
        />
      </div>
    </div>
  );
}
```

## Practical Workflow Example

### Step 1: Define Reference Zones

```typescript
// Load Emma's standing_idle segment as reference
const reference: ZoneReferenceFrame = {
  referenceSegmentId: 'standing_idle',
  zones: [
    {
      id: 'left_foot',
      label: 'Left Foot',
      shape: 'circle',
      coords: { type: 'circle', cx: 35, cy: 85, radius: 8 },
      sensitivity: 0.9,
      ticklishness: 1.0,
      toolModifiers: { feather: 2.0 },
    },
    {
      id: 'right_foot',
      label: 'Right Foot',
      shape: 'circle',
      coords: { type: 'circle', cx: 65, cy: 85, radius: 8 },
      sensitivity: 0.9,
      ticklishness: 1.0,
      toolModifiers: { feather: 2.0 },
    },
    // ... more zones
  ],
};
```

### Step 2: Mark Correspondences (Manual Method)

```typescript
// For each segment, mark where zones moved to
const correspondences: ZoneCorrespondence[] = [
  // Sitting segment
  { referenceZoneId: 'left_foot', segmentId: 'sitting_down',
    coords: { type: 'circle', cx: 30, cy: 75, radius: 8 } },
  { referenceZoneId: 'right_foot', segmentId: 'sitting_down',
    coords: { type: 'circle', cx: 55, cy: 75, radius: 8 } },

  // Lying segment
  { referenceZoneId: 'left_foot', segmentId: 'lying_stomach',
    coords: { type: 'circle', cx: 85, cy: 60, radius: 7 } },
  { referenceZoneId: 'right_foot', segmentId: 'lying_stomach',
    coords: { type: 'circle', cx: 85, cy: 45, radius: 7 } },
];
```

### Step 3: Generate Tracking Data

```typescript
const trackingData: NpcZoneTrackingData = {
  npcId: 'emma',
  reference,
  trackedZones: {
    'standing_idle': reference.zones.map(z => ({
      zoneId: z.id,
      segmentId: 'standing_idle',
      coords: z.coords,
      method: 'manual',
      confidence: 1.0,
    })),
    'sitting_down': correspondences
      .filter(c => c.segmentId === 'sitting_down')
      .map(c => ({
        zoneId: c.referenceZoneId,
        segmentId: c.segmentId,
        coords: c.coords,
        method: 'correspondence',
        confidence: 1.0,
      })),
    'lying_stomach': correspondences
      .filter(c => c.segmentId === 'lying_stomach')
      .map(c => ({
        zoneId: c.referenceZoneId,
        segmentId: c.segmentId,
        coords: c.coords,
        method: 'correspondence',
        confidence: 1.0,
      })),
  },
  settings: {
    autoTrack: false,
    minConfidence: 0.7,
    preferredMethod: 'correspondence',
  },
  metadata: {
    version: 1,
    lastUpdated: new Date().toISOString(),
    totalSegments: 3,
  },
};
```

### Step 4: Save & Load

```typescript
// Save to JSON file
await saveZoneTracking('emma', trackingData);

// Load later
const loaded = await loadZoneTracking('emma');

// Get zones for any segment
const sitZones = getTrackedZonesForSegment(loaded, 'sitting_down');
// Returns: zones with correct coords for sitting pose
```

## Benefits

✅ **Define once, use everywhere**: Define zones on reference, track across segments
✅ **Flexible methods**: Manual, template, keypoints, or ML - choose what works
✅ **Persistent**: Save tracking data, reuse across sessions
✅ **Confidence scores**: Know which zones are reliably tracked
✅ **Manual correction**: Override auto-tracking when needed
✅ **Version controlled**: Track changes to zone definitions

## Recommended Approach

**Start Simple → Add Complexity as Needed**

1. **Phase 1**: Manual correspondence (5-10 segments)
   - Define zones on reference
   - Manually mark in each segment
   - Save tracking data

2. **Phase 2**: Template matching (similar poses)
   - Extract templates from reference
   - Auto-track in similar segments
   - Manual fallback for different poses

3. **Phase 3**: Keypoints or ML (many segments, automation needed)
   - Define keypoints or use pose estimation
   - Fully automated tracking
   - Manual review for edge cases

## Summary

This system allows you to:
- **Define zones once** on a reference frame
- **Track them** across segments (manual, template, keypoints, or ML)
- **Persist** tracking data for reuse
- **Load automatically** when playing segments

Much better than manually defining zones for each segment!
