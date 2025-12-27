/**
 * Campaign Map Visualization (v1)
 *
 * v1 scope:
 * - List arcs in a campaign with basic dependency badges
 * - Highlight broken references / unmet prerequisites
 *
 * v2 (follow-up task):
 * - Full visual flowchart with edges and layout
 * - Completion state color-coded from GameSession flags
 */

import React from 'react';
import type { Campaign, CampaignProgression } from '@domain/campaign';
import { validateCampaign } from '@domain/campaign';

interface CampaignMapViewProps {
  /** Campaign to visualize */
  campaign: Campaign;
  /** Available arc graph IDs for validation */
  availableArcGraphIds: Set<string>;
  /** Optional: All campaigns for circular dependency validation */
  allCampaigns?: Campaign[];
  /** Optional: Campaign progression state */
  progression?: CampaignProgression | null;
}

export const CampaignMapView: React.FC<CampaignMapViewProps> = ({
  campaign,
  availableArcGraphIds,
  allCampaigns,
  progression,
}) => {
  const validationIssues = validateCampaign(campaign, availableArcGraphIds, { allCampaigns });
  const errors = validationIssues.filter((i) => i.severity === 'error');
  const warnings = validationIssues.filter((i) => i.severity === 'warning');

  // Get arc reference errors
  const brokenArcRefs = new Set(
    errors
      .filter((e) => e.type === 'broken-arc-reference')
      .map((e) => {
        // Extract arc graph ID from error message
        const match = e.message.match(/arc graph: (.+)$/);
        return match ? match[1] : null;
      })
      .filter((id): id is string => id !== null)
  );

  return (
    <div className="campaign-map-view p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">{campaign.title}</h2>
        <p className="text-gray-400">{campaign.description}</p>
        <div className="mt-2 flex gap-3 text-sm">
          <span className="text-gray-400">Type: {campaign.type}</span>
          <span className="text-gray-400">
            {campaign.arcs.length} arc graph{campaign.arcs.length !== 1 ? 's' : ''}
          </span>
          {campaign.metadata.estimated_playtime_hours && (
            <span className="text-gray-400">
              ~{campaign.metadata.estimated_playtime_hours}h playtime
            </span>
          )}
        </div>
      </div>

      {/* Validation summary */}
      {validationIssues.length > 0 && (
        <div className="mb-6 bg-gray-800 rounded p-4">
          <h3 className="font-semibold mb-2">Validation Status</h3>
          <div className="flex gap-4 text-sm">
            {errors.length > 0 && (
              <div className="flex items-center gap-2 text-red-400">
                <span className="text-lg">🔴</span>
                <span>{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
              </div>
            )}
            {warnings.length > 0 && (
              <div className="flex items-center gap-2 text-yellow-400">
                <span className="text-lg">⚠️</span>
                <span>{warnings.length} warning{warnings.length !== 1 ? 's' : ''}</span>
              </div>
            )}
            {validationIssues.length === 0 && (
              <div className="flex items-center gap-2 text-green-400">
                <span className="text-lg">✓</span>
                <span>All checks passed</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Progression overview */}
      {progression && (
        <div className="mb-6 bg-gray-800 rounded p-4">
          <h3 className="font-semibold mb-3">Campaign Progression</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Status:</span>
              <span className={`px-2 py-1 rounded text-sm ${
                progression.status === 'completed' ? 'bg-green-600' :
                progression.status === 'in_progress' ? 'bg-blue-600' :
                'bg-gray-600'
              }`}>
                {progression.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            {progression.currentArcId && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Current Arc:</span>
                <span className="text-blue-400">{progression.currentArcId}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Progress:</span>
              <span className="text-white">
                {progression.completedArcIds.length} / {campaign.arcs.length} arcs completed
              </span>
            </div>
            {progression.completedArcIds.length > 0 && (
              <div className="mt-2">
                <div className="h-2 bg-gray-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-600"
                    style={{
                      width: `${(progression.completedArcIds.length / campaign.arcs.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prerequisites */}
      {campaign.metadata.prerequisite_campaigns && campaign.metadata.prerequisite_campaigns.length > 0 && (
        <div className="mb-6 bg-gray-800 rounded p-4">
          <h3 className="font-semibold mb-2">Prerequisites</h3>
          <div className="text-sm text-gray-400">
            The following campaigns must be completed first:
          </div>
          <ul className="mt-2 space-y-1">
            {campaign.metadata.prerequisite_campaigns.map((prereqId) => (
              <li key={prereqId} className="flex items-center gap-2">
                <span className="text-yellow-400">→</span>
                <span className="text-white">{prereqId}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Arc graph list with status */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Arc Graph Sequence</h3>

        {campaign.arcs.length > 0 ? (
          <div className="space-y-3">
            {campaign.arcs
              .sort((a, b) => a.order - b.order)
              .map((arc, index) => {
                const isBroken = brokenArcRefs.has(arc.arcGraphId);
                const isCompleted = progression?.completedArcIds.includes(arc.arcGraphId);
                const isCurrent = progression?.currentArcId === arc.arcGraphId;
                const isLocked = !isCompleted && !isCurrent && index > 0;

                return (
                  <div
                    key={arc.arcGraphId}
                    className={`relative p-4 rounded border-2 ${
                      isBroken ? 'border-red-500 bg-red-900/20' :
                      isCurrent ? 'border-blue-500 bg-blue-900/20' :
                      isCompleted ? 'border-green-500 bg-green-900/20' :
                      'border-gray-600 bg-gray-800'
                    }`}
                  >
                    {/* Order number */}
                    <div className="absolute -left-3 -top-3 w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-sm font-bold border-2 border-gray-600">
                      {arc.order}
                    </div>

                    {/* Arc info */}
                    <div className="ml-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-lg font-medium mb-1">{arc.arcGraphId}</h4>

                          {/* Status badges */}
                          <div className="flex flex-wrap gap-2 mb-2">
                            {isBroken && (
                              <span className="px-2 py-1 bg-red-600 text-white text-xs rounded">
                                🔴 Broken Reference
                              </span>
                            )}
                            {isCompleted && (
                              <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">
                                ✓ Completed
                              </span>
                            )}
                            {isCurrent && (
                              <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
                                ▶ Current
                              </span>
                            )}
                            {isLocked && (
                              <span className="px-2 py-1 bg-gray-600 text-white text-xs rounded">
                                🔒 Locked
                              </span>
                            )}
                            {arc.optional && (
                              <span className="px-2 py-1 bg-yellow-600 text-white text-xs rounded">
                                Optional
                              </span>
                            )}
                            {arc.parallel && (
                              <span className="px-2 py-1 bg-purple-600 text-white text-xs rounded">
                                Parallel
                              </span>
                            )}
                          </div>

                          {/* Unlock conditions */}
                          {arc.unlockConditions && arc.unlockConditions.length > 0 && (
                            <div className="text-sm text-gray-400">
                              <strong>Unlock conditions:</strong>
                              <ul className="ml-4 mt-1 space-y-1">
                                {arc.unlockConditions.map((cond, idx) => (
                                  <li key={idx}>
                                    • {cond.type}: {JSON.stringify(cond.data)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Connection line to next arc (if not last) */}
                    {!arc.parallel && index < campaign.arcs.length - 1 && (
                      <div className="absolute left-1/2 -bottom-4 transform -translate-x-1/2">
                        <div className="w-0.5 h-4 bg-gray-600" />
                        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2">
                          ▼
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-800 rounded">
            <div className="text-gray-500 mb-2">No arc graphs in this campaign</div>
            <div className="text-sm text-gray-600">Add arcs to visualize the campaign flow</div>
          </div>
        )}
      </div>

      {/* Parallel campaigns */}
      {campaign.metadata.parallel_campaigns && campaign.metadata.parallel_campaigns.length > 0 && (
        <div className="mt-6 bg-gray-800 rounded p-4">
          <h3 className="font-semibold mb-2">Parallel Campaigns</h3>
          <div className="text-sm text-gray-400">
            These campaigns can run simultaneously:
          </div>
          <ul className="mt-2 space-y-1">
            {campaign.metadata.parallel_campaigns.map((parallelId) => (
              <li key={parallelId} className="flex items-center gap-2">
                <span className="text-purple-400">⇄</span>
                <span className="text-white">{parallelId}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
