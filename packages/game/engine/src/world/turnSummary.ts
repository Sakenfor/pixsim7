/**
 * Turn Summary System
 *
 * Tracks changes between turns in turn-based world mode.
 * Provides "What happened this turn?" functionality.
 */

export interface NpcArrival {
  npcId: number;
  npcName: string;
  locationId: number;
  locationName: string;
}

export interface NpcDeparture {
  npcId: number;
  npcName: string;
  locationId: number;
  locationName: string;
}

export interface RelationshipChange {
  npcId: number;
  npcName: string;
  oldValue: number;
  newValue: number;
  oldTier?: string;
  newTier?: string;
}

export interface EventTriggered {
  eventId: string;
  eventName: string;
  description?: string;
}

export interface TurnSummary {
  /** NPCs that arrived at locations since last turn */
  npcsArrived: NpcArrival[];
  /** NPCs that departed from locations since last turn */
  npcsDeparted: NpcDeparture[];
  /** Relationship changes */
  relationshipChanges: RelationshipChange[];
  /** Events that triggered */
  eventsTriggered: EventTriggered[];
  /** Turn metadata */
  metadata: {
    fromWorldTime: number;
    toWorldTime: number;
    deltaSeconds: number;
    turnNumber?: number;
  };
}

export interface NpcPresenceSnapshot {
  npcId: number;
  npcName: string;
  locationId: number;
  locationName: string;
}

/**
 * Compare two NPC presence snapshots and generate arrivals/departures
 */
export function compareNpcPresence(
  before: NpcPresenceSnapshot[],
  after: NpcPresenceSnapshot[]
): { arrivals: NpcArrival[]; departures: NpcDeparture[] } {
  const beforeMap = new Map<string, NpcPresenceSnapshot>();
  const afterMap = new Map<string, NpcPresenceSnapshot>();

  // Build lookup maps (key = "npcId:locationId")
  for (const presence of before) {
    const key = `${presence.npcId}:${presence.locationId}`;
    beforeMap.set(key, presence);
  }

  for (const presence of after) {
    const key = `${presence.npcId}:${presence.locationId}`;
    afterMap.set(key, presence);
  }

  const arrivals: NpcArrival[] = [];
  const departures: NpcDeparture[] = [];

  // Find arrivals (in after but not before)
  for (const [key, presence] of afterMap) {
    if (!beforeMap.has(key)) {
      arrivals.push({
        npcId: presence.npcId,
        npcName: presence.npcName,
        locationId: presence.locationId,
        locationName: presence.locationName,
      });
    }
  }

  // Find departures (in before but not after)
  for (const [key, presence] of beforeMap) {
    if (!afterMap.has(key)) {
      departures.push({
        npcId: presence.npcId,
        npcName: presence.npcName,
        locationId: presence.locationId,
        locationName: presence.locationName,
      });
    }
  }

  return { arrivals, departures };
}

/**
 * Compare relationship states and find changes
 */
export function compareRelationships(
  before: Record<string, { affinity?: number; tierId?: string }>,
  after: Record<string, { affinity?: number; tierId?: string }>,
  npcNames: Map<number, string>
): RelationshipChange[] {
  const changes: RelationshipChange[] = [];

  // Check all NPCs in both before and after
  const allNpcKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allNpcKeys) {
    if (!key.startsWith('npc:')) continue;

    const npcId = parseInt(key.split(':')[1]);
    if (isNaN(npcId)) continue;

    const beforeRel = before[key] || {};
    const afterRel = after[key] || {};

    const beforeAffinity = beforeRel.affinity ?? 0;
    const afterAffinity = afterRel.affinity ?? 0;

    // Only report if affinity changed
    if (beforeAffinity !== afterAffinity) {
      changes.push({
        npcId,
        npcName: npcNames.get(npcId) || `NPC ${npcId}`,
        oldValue: beforeAffinity,
        newValue: afterAffinity,
        oldTier: beforeRel.tierId,
        newTier: afterRel.tierId,
      });
    }
  }

  return changes;
}

/**
 * Format turn summary as human-readable text
 */
export function formatTurnSummary(summary: TurnSummary): string {
  const lines: string[] = [];

  lines.push(`=== Turn Summary ===`);
  lines.push(`Time: ${summary.metadata.fromWorldTime} → ${summary.metadata.toWorldTime} (+${summary.metadata.deltaSeconds}s)`);

  if (summary.npcsArrived.length > 0) {
    lines.push('');
    lines.push('NPCs Arrived:');
    for (const arrival of summary.npcsArrived) {
      lines.push(`  • ${arrival.npcName} arrived at ${arrival.locationName}`);
    }
  }

  if (summary.npcsDeparted.length > 0) {
    lines.push('');
    lines.push('NPCs Departed:');
    for (const departure of summary.npcsDeparted) {
      lines.push(`  • ${departure.npcName} left ${departure.locationName}`);
    }
  }

  if (summary.relationshipChanges.length > 0) {
    lines.push('');
    lines.push('Relationships Changed:');
    for (const change of summary.relationshipChanges) {
      const delta = change.newValue - change.oldValue;
      const sign = delta > 0 ? '+' : '';
      lines.push(`  • ${change.npcName}: ${change.oldValue} → ${change.newValue} (${sign}${delta})`);
      if (change.oldTier && change.newTier && change.oldTier !== change.newTier) {
        lines.push(`    Tier: ${change.oldTier} → ${change.newTier}`);
      }
    }
  }

  if (summary.eventsTriggered.length > 0) {
    lines.push('');
    lines.push('Events Triggered:');
    for (const event of summary.eventsTriggered) {
      lines.push(`  • ${event.eventName}`);
      if (event.description) {
        lines.push(`    ${event.description}`);
      }
    }
  }

  if (
    summary.npcsArrived.length === 0 &&
    summary.npcsDeparted.length === 0 &&
    summary.relationshipChanges.length === 0 &&
    summary.eventsTriggered.length === 0
  ) {
    lines.push('');
    lines.push('Nothing significant happened this turn.');
  }

  return lines.join('\n');
}

/**
 * Create empty turn summary
 */
export function createEmptyTurnSummary(
  fromWorldTime: number,
  toWorldTime: number,
  turnNumber?: number
): TurnSummary {
  return {
    npcsArrived: [],
    npcsDeparted: [],
    relationshipChanges: [],
    eventsTriggered: [],
    metadata: {
      fromWorldTime,
      toWorldTime,
      deltaSeconds: toWorldTime - fromWorldTime,
      turnNumber,
    },
  };
}
