import {
  parseNpcKey,
  getNpcRelationshipState,
} from '@pixsim7/game.engine';
import { Panel, Badge, Button, ProgressBar } from '@pixsim7/shared.ui';
import { useEffect, useState } from 'react';

import type { GameSessionDTO } from '@lib/api/game';

interface RelationshipDashboardProps {
  session: GameSessionDTO | null;
  onClose?: () => void;
}

interface NpcRelationship {
  npcId: number;
  affinity: number;
  trust: number;
  chemistry: number;
  tension: number;
  flags: string[];
  tier: string;
  intimacyLevel: string | null;
}

export function RelationshipDashboard({ session, onClose }: RelationshipDashboardProps) {
  const [relationships, setRelationships] = useState<NpcRelationship[]>([]);

  useEffect(() => {
    if (!session) {
      setRelationships([]);
      return;
    }

    // Use stats.relationships as the canonical source
    const relationshipData = session.stats?.relationships;

    if (!relationshipData || typeof relationshipData !== 'object') {
      setRelationships([]);
      return;
    }

    const npcRelationships: NpcRelationship[] = [];

    for (const [key] of Object.entries(relationshipData)) {
      const npcId = parseNpcKey(key);
      if (npcId !== null) {
        // Use game-core helper instead of manual extraction
        const relState = getNpcRelationshipState(session, npcId);

        if (!relState) {
          continue;
        }

        npcRelationships.push({
          npcId,
          affinity: relState.values.affinity ?? 0,
          trust: relState.values.trust ?? 0,
          chemistry: relState.values.chemistry ?? 0,
          tension: relState.values.tension ?? 0,
          flags: relState.flags ?? [],
          tier: relState.tierId || 'stranger',
          intimacyLevel: relState.levelId || null,
        });
      }
    }

    // Sort by affinity descending
    npcRelationships.sort((a, b) => b.affinity - a.affinity);
    setRelationships(npcRelationships);
  }, [session]);

  if (!session) {
    return (
      <Panel className="p-4">
        <p className="text-sm text-neutral-500">No active game session</p>
      </Panel>
    );
  }

  return (
    <Panel className="space-y-0" padded={false}>
      <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
        <div>
          <h2 className="text-lg font-semibold">Relationships</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Your connections with NPCs in this world
          </p>
        </div>
        {onClose && (
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
        {relationships.length === 0 ? (
          <p className="text-sm text-neutral-500">No relationships established yet</p>
        ) : (
          relationships.map((rel) => (
            <RelationshipCard key={rel.npcId} relationship={rel} />
          ))
        )}
      </div>
    </Panel>
  );
}

interface RelationshipCardProps {
  relationship: NpcRelationship;
}

function RelationshipCard({ relationship }: RelationshipCardProps) {
  const { npcId, affinity, trust, chemistry, tension, tier, intimacyLevel } = relationship;

  const getTierColor = (tier: string): 'blue' | 'green' | 'purple' | 'pink' | 'gray' => {
    switch (tier) {
      case 'lover':
        return 'pink';
      case 'close_friend':
        return 'purple';
      case 'friend':
        return 'green';
      case 'acquaintance':
        return 'blue';
      default:
        return 'gray';
    }
  };

  const getIntimacyColor = (level: string | null): 'pink' | 'red' | 'orange' | 'yellow' | 'gray' => {
    if (!level) return 'gray';
    switch (level) {
      case 'very_intimate':
        return 'pink';
      case 'intimate':
        return 'red';
      case 'deep_flirt':
        return 'orange';
      case 'light_flirt':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  return (
    <Panel className="space-y-3 bg-neutral-50 dark:bg-neutral-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">NPC #{npcId}</span>
          <Badge color={getTierColor(tier)}>
            {tier.replace(/_/g, ' ')}
          </Badge>
          {intimacyLevel && (
            <Badge color={getIntimacyColor(intimacyLevel)}>
              {intimacyLevel.replace(/_/g, ' ')}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ProgressBar label="Affinity" value={affinity} color="blue" />
        <ProgressBar label="Trust" value={trust} color="green" />
        <ProgressBar label="Chemistry" value={chemistry} color="pink" />
        <ProgressBar label="Tension" value={tension} color="red" />
      </div>

      {relationship.flags.length > 0 && (
        <div className="pt-2 border-t border-neutral-200 dark:border-neutral-600">
          <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
            Relationship Flags
          </p>
          <div className="flex flex-wrap gap-1">
            {relationship.flags.map((flag) => (
              <Badge key={flag} color="gray">
                {flag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
