/**
 * Interaction Studio
 *
 * Main page for creating and managing NPC interactions visually.
 * No backend persistence - for design/prototyping purposes.
 */

import React, { useState } from 'react';

import type { NpcInteractionDefinition } from '@lib/registries';

import { InteractionEditor, TemplateSelector } from '@features/interactions';
import './InteractionStudio.css';

const getRelationshipGateSummary = (interaction: NpcInteractionDefinition): string | null => {
  const statGating = interaction.gating?.statGating;
  if (!statGating) {
    return null;
  }

  const gates = [...(statGating.allOf || []), ...(statGating.anyOf || [])];
  const relationshipGates = gates.filter((gate) => gate.definitionId === 'relationships');
  if (!relationshipGates.length) {
    return null;
  }

  const affinityGate = relationshipGates.find((gate) => gate.axis === 'affinity');
  if (affinityGate?.minValue !== undefined) {
    return `${affinityGate.minValue}+ affinity`;
  }
  if (affinityGate?.minTierId) {
    return `${affinityGate.minTierId} tier`;
  }

  return 'relationship';
};

const getRelationshipDeltaSummary = (interaction: NpcInteractionDefinition): string | null => {
  const deltas = interaction.outcome?.statDeltas;
  if (!deltas) {
    return null;
  }

  const relationshipDeltas = deltas.filter(
    (delta) =>
      delta.packageId === 'core.relationships' &&
      (!delta.definitionId || delta.definitionId === 'relationships')
  );

  if (!relationshipDeltas.length) {
    return null;
  }

  const axes = relationshipDeltas.reduce<Record<string, number>>((acc, delta) => {
    for (const [axis, value] of Object.entries(delta.axes)) {
      acc[axis] = (acc[axis] || 0) + value;
    }
    return acc;
  }, {});

  const summary = Object.entries(axes)
    .filter(([, v]) => v !== undefined && v !== 0)
    .map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k}`)
    .join(', ');

  return summary || null;
};

/**
 * Interaction Studio page
 */
export function InteractionStudio() {
  const [interactions, setInteractions] = useState<NpcInteractionDefinition[]>([]);
  const [editing, setEditing] = useState<NpcInteractionDefinition | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  // Mock NPCs (in real app, fetch from API)
  const npcs = [
    { id: 1, name: 'Sophia' },
    { id: 2, name: 'Marcus' },
    { id: 3, name: 'Elena' },
  ];

  const handleSaveInteraction = (interaction: NpcInteractionDefinition) => {
    if (editing) {
      // Update existing
      setInteractions(
        interactions.map((i) => (i.id === interaction.id ? interaction : i))
      );
    } else {
      // Add new
      setInteractions([...interactions, interaction]);
    }

    setEditing(null);
    setShowEditor(false);
  };

  const handleDeleteInteraction = (id: string) => {
    if (confirm('Delete this interaction?')) {
      setInteractions(interactions.filter((i) => i.id !== id));
    }
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(interactions, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'interactions.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        setInteractions(imported);
      } catch {
        alert('Failed to import: Invalid JSON');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="interaction-studio">
      <div className="studio-header">
        <div className="header-main">
          <h1>⚡ Interaction Studio</h1>
          <p className="subtitle">Visual editor for NPC interactions</p>
        </div>

        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setShowTemplateSelector(true)}>
            📋 Templates
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setShowEditor(true);
            }}
          >
            ✨ New Interaction
          </button>
        </div>
      </div>

      <div className="studio-toolbar">
        <div className="toolbar-stats">
          <span className="stat">
            <strong>{interactions.length}</strong> interactions
          </span>
          <span className="stat">
            <strong>{interactions.filter((i) => i.surface === 'dialogue').length}</strong>{' '}
            dialogue
          </span>
          <span className="stat">
            <strong>{interactions.filter((i) => i.surface === 'scene').length}</strong> scenes
          </span>
        </div>

        <div className="toolbar-actions">
          <label className="btn-secondary file-input-label">
            📁 Import
            <input
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              style={{ display: 'none' }}
            />
          </label>
          <button
            className="btn-secondary"
            onClick={handleExportJSON}
            disabled={interactions.length === 0}
          >
            💾 Export JSON
          </button>
        </div>
      </div>

      <div className="studio-content">
        {interactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <h2>No interactions yet</h2>
            <p>Create your first interaction using templates or from scratch</p>
            <div className="empty-actions">
              <button className="btn-primary" onClick={() => setShowTemplateSelector(true)}>
                Browse Templates
              </button>
              <button className="btn-secondary" onClick={() => setShowEditor(true)}>
                Start from Scratch
              </button>
            </div>
          </div>
        ) : (
          <div className="interaction-list">
            {interactions.map((interaction) => (
              <div key={interaction.id} className="interaction-item">
                <div className="item-header">
                  <div className="item-icon">{interaction.icon || '⚡'}</div>
                  <div className="item-info">
                    <h3>{interaction.label}</h3>
                    <div className="item-meta">
                      <span className="item-id">{interaction.id}</span>
                      <span className={`item-surface surface-${interaction.surface}`}>
                        {interaction.surface}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="item-details">
                  {getRelationshipGateSummary(interaction) && (
                    <div className="detail">
                      <span className="detail-icon">💕</span>
                      Requires: {getRelationshipGateSummary(interaction)}
                    </div>
                  )}
                  {getRelationshipDeltaSummary(interaction) && (
                    <div className="detail">
                      <span className="detail-icon">📈</span>
                      Grants: {getRelationshipDeltaSummary(interaction)}
                    </div>
                  )}
                </div>

                <div className="item-actions">
                  <button
                    className="btn-icon"
                    onClick={() => {
                      setEditing(interaction);
                      setShowEditor(true);
                    }}
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => {
                      const copy = { ...interaction, id: `${interaction.id}_copy` };
                      setInteractions([...interactions, copy]);
                    }}
                    title="Duplicate"
                  >
                    📋
                  </button>
                  <button
                    className="btn-icon danger"
                    onClick={() => handleDeleteInteraction(interaction.id)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showEditor && (
        <div className="modal-overlay">
          <InteractionEditor
            initialInteraction={editing || undefined}
            npcs={npcs}
            onSave={handleSaveInteraction}
            onCancel={() => {
              setShowEditor(false);
              setEditing(null);
            }}
          />
        </div>
      )}

      {showTemplateSelector && (
        <div className="modal-overlay">
          <TemplateSelector
            npcs={npcs}
            onSelect={(interaction) => {
              setInteractions([...interactions, interaction]);
              setShowTemplateSelector(false);
            }}
            onCancel={() => setShowTemplateSelector(false)}
          />
        </div>
      )}
    </div>
  );
}
