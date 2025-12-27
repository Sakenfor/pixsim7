/**
 * Campaign Editor Panel
 *
 * Features:
 * - Create/edit/delete campaigns
 * - Visualize arc graph progression
 * - Set prerequisites and parallel campaigns
 * - Track campaign progression state
 * - Assign featured characters
 */

import React, { useState } from 'react';
import { useCampaignStore } from '@/stores/campaignStore';
import { validateCampaign } from '@domain/campaign';
import type { Campaign, CampaignType } from '@domain/campaign';

interface CampaignPanelProps {
  /** Current world ID for filtering campaigns */
  worldId: number;
  /** Available arc graph IDs for validation */
  availableArcGraphIds: Set<string>;
  /** All campaigns for circular dependency validation */
  allCampaigns?: Campaign[];
  /** Optional: Currently selected campaign ID */
  selectedCampaignId?: string | null;
  /** Optional: Callback when campaign is selected */
  onCampaignSelect?: (campaignId: string | null) => void;
}

export const CampaignPanel: React.FC<CampaignPanelProps> = ({
  worldId,
  availableArcGraphIds,
  allCampaigns,
  selectedCampaignId,
  onCampaignSelect,
}) => {
  const {
    campaigns,
    currentCampaignId,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    addArcToCampaign,
    removeArcFromCampaign,
    reorderArcs,
    setCurrentCampaign,
    getCampaignsForWorld,
    exportCampaign,
    importCampaign,
    getCampaignProgression,
    startCampaign,
    completeCampaign,
  } = useCampaignStore();

  const [newCampaignTitle, setNewCampaignTitle] = useState('');
  const [newCampaignType, setNewCampaignType] = useState<CampaignType>('main_story');
  const [newArcGraphId, setNewArcGraphId] = useState('');

  const activeCampaignId = selectedCampaignId ?? currentCampaignId;
  const activeCampaign = activeCampaignId ? campaigns[activeCampaignId] : null;
  const worldCampaigns = getCampaignsForWorld(worldId);
  const campaignProgression = activeCampaignId
    ? getCampaignProgression(worldId, activeCampaignId)
    : null;

  const handleCreateCampaign = () => {
    if (!newCampaignTitle.trim()) return;
    const id = createCampaign(newCampaignTitle, newCampaignType, worldId);
    setNewCampaignTitle('');
    setCurrentCampaign(id);
    if (onCampaignSelect) {
      onCampaignSelect(id);
    }
  };

  const handleDeleteCampaign = (id: string) => {
    if (window.confirm('Are you sure you want to delete this campaign?')) {
      deleteCampaign(id);
      if (activeCampaignId === id) {
        setCurrentCampaign(null);
        if (onCampaignSelect) {
          onCampaignSelect(null);
        }
      }
    }
  };

  const handleSelectCampaign = (id: string) => {
    setCurrentCampaign(id);
    if (onCampaignSelect) {
      onCampaignSelect(id);
    }
  };

  const handleAddArc = () => {
    if (!activeCampaignId || !newArcGraphId.trim()) return;
    addArcToCampaign(activeCampaignId, newArcGraphId);
    setNewArcGraphId('');
  };

  const handleExport = (id: string) => {
    const json = exportCampaign(id);
    if (json) {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campaign-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const json = e.target?.result as string;
          const id = importCampaign(json);
          if (id) {
            alert('Campaign imported successfully!');
          } else {
            alert('Failed to import campaign. Please check the file format.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const validationIssues = activeCampaign
    ? validateCampaign(activeCampaign, availableArcGraphIds, {
        allCampaigns: allCampaigns || Object.values(campaigns),
      })
    : [];

  return (
    <div className="campaign-panel flex h-full">
      {/* Left sidebar - Campaign list */}
      <div className="w-64 border-r border-gray-700 bg-gray-800 p-4">
        <h2 className="text-lg font-semibold mb-4">Campaigns</h2>

        {/* Create new campaign */}
        <div className="mb-4 space-y-2">
          <input
            type="text"
            placeholder="Campaign title..."
            value={newCampaignTitle}
            onChange={(e) => setNewCampaignTitle(e.target.value)}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded"
          />
          <select
            value={newCampaignType}
            onChange={(e) => setNewCampaignType(e.target.value as CampaignType)}
            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded"
          >
            <option value="main_story">Main Story</option>
            <option value="side_story">Side Story</option>
            <option value="character_arc">Character Arc</option>
            <option value="seasonal_event">Seasonal Event</option>
            <option value="custom">Custom</option>
          </select>
          <button
            onClick={handleCreateCampaign}
            disabled={!newCampaignTitle.trim()}
            className="w-full px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded"
          >
            Create Campaign
          </button>
        </div>

        {/* Import/Export */}
        <div className="mb-4 space-y-1">
          <button
            onClick={handleImport}
            className="w-full px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded"
          >
            Import Campaign
          </button>
        </div>

        {/* Campaign list */}
        <div className="space-y-2">
          {worldCampaigns.map((campaign) => {
            const progression = getCampaignProgression(worldId, campaign.id);
            return (
              <div
                key={campaign.id}
                className={`p-2 rounded cursor-pointer ${
                  campaign.id === activeCampaignId
                    ? 'bg-blue-600'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
                onClick={() => handleSelectCampaign(campaign.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium truncate">{campaign.title}</div>
                    <div className="text-xs text-gray-400">{campaign.type}</div>
                    <div className="text-xs text-gray-500">
                      {campaign.arcs.length} arc{campaign.arcs.length !== 1 ? 's' : ''}
                    </div>
                    {progression && (
                      <div className={`text-xs mt-1 ${
                        progression.status === 'completed' ? 'text-green-400' :
                        progression.status === 'in_progress' ? 'text-blue-400' :
                        'text-gray-500'
                      }`}>
                        {progression.status === 'completed' ? '✓ Completed' :
                         progression.status === 'in_progress' ? '▶ In Progress' :
                         'Not Started'}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(campaign.id);
                      }}
                      className="text-xs px-1 hover:text-blue-400"
                      title="Export"
                    >
                      ⬇
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCampaign(campaign.id);
                      }}
                      className="text-xs px-1 hover:text-red-400"
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {worldCampaigns.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-8">
            No campaigns yet. Create one to get started!
          </div>
        )}
      </div>

      {/* Right panel - Campaign editor */}
      <div className="flex-1 p-6 overflow-auto">
        {activeCampaign ? (
          <div className="space-y-6">
            {/* Campaign header */}
            <div>
              <h2 className="text-2xl font-bold mb-2">{activeCampaign.title}</h2>
              <div className="text-sm text-gray-400">
                Type: {activeCampaign.type} • {activeCampaign.arcs.length} arc graphs
              </div>
              {campaignProgression && (
                <div className="mt-2">
                  <div className={`inline-block px-3 py-1 rounded text-sm ${
                    campaignProgression.status === 'completed' ? 'bg-green-600' :
                    campaignProgression.status === 'in_progress' ? 'bg-blue-600' :
                    'bg-gray-600'
                  }`}>
                    Status: {campaignProgression.status.replace('_', ' ').toUpperCase()}
                  </div>
                  {campaignProgression.status === 'in_progress' && (
                    <button
                      onClick={() => completeCampaign(worldId, activeCampaign.id)}
                      className="ml-2 px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                    >
                      Mark Complete
                    </button>
                  )}
                  {campaignProgression.status === 'not_started' && (
                    <button
                      onClick={() => startCampaign(worldId, activeCampaign.id)}
                      className="ml-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                    >
                      Start Campaign
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Validation issues */}
            {validationIssues.length > 0 && (
              <div className="bg-red-900/20 border border-red-700 rounded p-4">
                <h3 className="font-semibold mb-2">Validation Issues</h3>
                <ul className="space-y-1 text-sm">
                  {validationIssues.map((issue, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className={
                        issue.severity === 'error' ? 'text-red-400' :
                        issue.severity === 'warning' ? 'text-yellow-400' :
                        'text-blue-400'
                      }>
                        {issue.severity === 'error' ? '🔴' :
                         issue.severity === 'warning' ? '⚠️' : 'ℹ️'}
                      </span>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Arc graphs */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Arc Graphs</h3>

              {/* Add arc input */}
              <div className="mb-3 flex gap-2">
                <input
                  type="text"
                  placeholder="Arc Graph ID..."
                  value={newArcGraphId}
                  onChange={(e) => setNewArcGraphId(e.target.value)}
                  className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded"
                />
                <button
                  onClick={handleAddArc}
                  disabled={!newArcGraphId.trim()}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded"
                >
                  Add Arc
                </button>
              </div>

              {activeCampaign.arcs.length > 0 ? (
                <div className="space-y-2">
                  {activeCampaign.arcs
                    .sort((a, b) => a.order - b.order)
                    .map((arc) => {
                      const isCompleted = campaignProgression?.completedArcIds.includes(arc.arcGraphId);
                      const isCurrent = campaignProgression?.currentArcId === arc.arcGraphId;

                      return (
                        <div
                          key={arc.arcGraphId}
                          className={`bg-gray-700 p-3 rounded ${
                            isCurrent ? 'border-2 border-blue-500' : ''
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="font-medium">Arc: {arc.arcGraphId}</div>
                              <div className="text-sm text-gray-400">Order: {arc.order}</div>
                              <div className="flex gap-2 mt-1">
                                {arc.optional && (
                                  <span className="text-xs text-yellow-400">Optional</span>
                                )}
                                {arc.parallel && (
                                  <span className="text-xs text-blue-400">Parallel</span>
                                )}
                                {isCompleted && (
                                  <span className="text-xs text-green-400">✓ Completed</span>
                                )}
                                {isCurrent && (
                                  <span className="text-xs text-blue-400">▶ Current</span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                removeArcFromCampaign(activeCampaign.id, arc.arcGraphId)
                              }
                              className="px-2 py-1 text-sm bg-red-600 hover:bg-red-700 rounded"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="text-sm text-gray-500 text-center py-8 bg-gray-800 rounded">
                  No arc graphs in this campaign yet. Add arcs to get started!
                </div>
              )}
            </div>

            {/* Metadata editor */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Metadata</h3>
              <div className="space-y-2">
                <div>
                  <label className="text-sm text-gray-400">Description</label>
                  <textarea
                    value={activeCampaign.description ?? ''}
                    onChange={(e) =>
                      updateCampaign(activeCampaign.id, {
                        description: e.target.value || undefined,
                      })
                    }
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded"
                    rows={3}
                    placeholder="Campaign description..."
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400">Estimated Playtime (hours)</label>
                  <input
                    type="number"
                    value={activeCampaign.metadata.estimated_playtime_hours ?? ''}
                    onChange={(e) =>
                      updateCampaign(activeCampaign.id, {
                        metadata: {
                          ...activeCampaign.metadata,
                          estimated_playtime_hours: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        },
                      })
                    }
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded"
                    placeholder="e.g., 10"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400">Featured Character ID</label>
                  <input
                    type="number"
                    value={activeCampaign.metadata.featured_character_id ?? ''}
                    onChange={(e) =>
                      updateCampaign(activeCampaign.id, {
                        metadata: {
                          ...activeCampaign.metadata,
                          featured_character_id: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        },
                      })
                    }
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded"
                    placeholder="e.g., 42"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400">Color</label>
                  <input
                    type="text"
                    value={activeCampaign.metadata.color ?? ''}
                    onChange={(e) =>
                      updateCampaign(activeCampaign.id, {
                        metadata: {
                          ...activeCampaign.metadata,
                          color: e.target.value || undefined,
                        },
                      })
                    }
                    className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded"
                    placeholder="e.g., #3b82f6"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select or create a campaign to edit
          </div>
        )}
      </div>
    </div>
  );
};
