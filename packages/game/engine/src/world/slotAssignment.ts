import type { NpcSlot2d, NpcPresenceDTO, GameWorldDetail } from '@pixsim7/shared.types';

export interface NpcSlotAssignment {
  slot: NpcSlot2d;
  npcId: number | null;
  npcPresence?: NpcPresenceDTO;
}

export interface NpcRoleMap {
  [npcId: string]: string[];
}

/**
 * Extract NPC role hints from world metadata
 */
export function getNpcRoles(world: GameWorldDetail | null): NpcRoleMap {
  if (!world?.meta) return {};
  const meta = world.meta as any;
  return meta.npcRoles || {};
}

/**
 * Assign NPCs to slots based on presence, fixed assignments, and role matching
 *
 * @param slots - Available NPC slots from the location
 * @param presentNpcs - NPCs currently present at the location
 * @param npcRoles - Optional role hints for NPCs from world metadata
 * @returns Array of slot assignments
 */
export function assignNpcsToSlots(
  slots: NpcSlot2d[],
  presentNpcs: NpcPresenceDTO[],
  npcRoles: NpcRoleMap = {}
): NpcSlotAssignment[] {
  const assignments: NpcSlotAssignment[] = [];
  const assignedNpcIds = new Set<number>();
  const remainingNpcs = [...presentNpcs];

  // Phase 1: Assign fixed NPCs first
  for (const slot of slots) {
    if (slot.fixedNpcId) {
      const npcPresence = presentNpcs.find(p => p.npc_id === slot.fixedNpcId);
      if (npcPresence) {
        assignments.push({
          slot,
          npcId: slot.fixedNpcId,
          npcPresence,
        });
        assignedNpcIds.add(slot.fixedNpcId);
        // Remove from remaining NPCs
        const index = remainingNpcs.findIndex(n => n.npc_id === slot.fixedNpcId);
        if (index !== -1) {
          remainingNpcs.splice(index, 1);
        }
      } else {
        // Fixed NPC is not present, slot remains empty
        assignments.push({
          slot,
          npcId: null,
        });
      }
    }
  }

  // Phase 2: Assign remaining NPCs based on role matching
  const unassignedSlots = slots.filter(
    slot => !slot.fixedNpcId && !assignments.some(a => a.slot.id === slot.id)
  );

  for (const slot of unassignedSlots) {
    let bestMatch: NpcPresenceDTO | null = null;
    let bestMatchScore = -1;

    // Find best matching NPC based on roles
    for (const npcPresence of remainingNpcs) {
      if (assignedNpcIds.has(npcPresence.npc_id)) continue;

      let score = 0;
      const npcRoleList = npcRoles[String(npcPresence.npc_id)] || [];

      // Calculate role match score
      if (slot.roles && slot.roles.length > 0 && npcRoleList.length > 0) {
        for (const slotRole of slot.roles) {
          if (npcRoleList.includes(slotRole)) {
            score += 10; // High score for exact role match
          }
        }
      }

      // Small bonus for any unassigned NPC (to fill empty slots)
      if (score === 0 && (!slot.roles || slot.roles.length === 0)) {
        score = 1;
      }

      if (score > bestMatchScore) {
        bestMatch = npcPresence;
        bestMatchScore = score;
      }
    }

    if (bestMatch) {
      assignments.push({
        slot,
        npcId: bestMatch.npc_id,
        npcPresence: bestMatch,
      });
      assignedNpcIds.add(bestMatch.npc_id);
      // Remove from remaining NPCs
      const index = remainingNpcs.findIndex(n => n.npc_id === bestMatch!.npc_id);
      if (index !== -1) {
        remainingNpcs.splice(index, 1);
      }
    } else {
      // No NPC to assign to this slot
      assignments.push({
        slot,
        npcId: null,
      });
    }
  }

  return assignments;
}

/**
 * Get unassigned NPCs (those present but without slots)
 */
export function getUnassignedNpcs(
  presentNpcs: NpcPresenceDTO[],
  assignments: NpcSlotAssignment[]
): NpcPresenceDTO[] {
  const assignedNpcIds = new Set(
    assignments.filter(a => a.npcId !== null).map(a => a.npcId!)
  );

  return presentNpcs.filter(npc => !assignedNpcIds.has(npc.npc_id));
}
