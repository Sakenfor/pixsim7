/**
 * Visual Interaction Editor
 *
 * Complete visual editor for creating and editing NPC interactions.
 * No backend changes - everything stays in types + React.
 */

import { validateInteraction } from '@pixsim7/game.engine';
import React, { useState } from 'react';

import type { InteractionDefinition } from '@lib/registries';
import './InteractionEditor.css';

export interface InteractionEditorProps {
  /** Initial interaction to edit (undefined for new) */
  initialInteraction?: InteractionDefinition;
  /** Available NPCs for selection */
  npcs?: Array<{ id: number; name: string }>;
  /** Callback when interaction is saved */
  onSave: (interaction: InteractionDefinition) => void;
  /** Callback when editor is cancelled */
  onCancel: () => void;
  /** Show template selector */
  showTemplates?: boolean;
}

/**
 * Main interaction editor component
 */
export function InteractionEditor({
  initialInteraction,
  npcs = [],
  onSave,
  onCancel,
  // showTemplates - reserved for future template selector UI
}: InteractionEditorProps) {
  const [interaction, setInteraction] = useState<Partial<InteractionDefinition>>(
    initialInteraction || {
      id: '',
      label: '',
      surface: 'dialogue',
      priority: 50,
    }
  );

  const [activeTab, setActiveTab] = useState<'basic' | 'gating' | 'outcome'>('basic');
  const [errors, setErrors] = useState<string[]>([]);

  // Validate interaction
  const handleValidate = () => {
    if (!interaction.id || !interaction.label || !interaction.surface) {
      setErrors(['Please fill in required fields: ID, Label, and Surface']);
      return false;
    }

    const result = validateInteraction(interaction as InteractionDefinition);
    if (!result.valid) {
      setErrors(result.errors.map((e) => `${e.field}: ${e.message}`));
      return false;
    }

    setErrors([]);
    return true;
  };

  // Save interaction
  const handleSave = () => {
    if (handleValidate()) {
      onSave(interaction as InteractionDefinition);
    }
  };

  return (
    <div className="interaction-editor">
      <div className="editor-header">
        <h2>{initialInteraction ? 'Edit Interaction' : 'New Interaction'}</h2>
        <div className="editor-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="editor-errors">
          <h4>Validation Errors:</h4>
          <ul>
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="editor-tabs">
        <button
          className={`tab ${activeTab === 'basic' ? 'active' : ''}`}
          onClick={() => setActiveTab('basic')}
        >
          Basic Info
        </button>
        <button
          className={`tab ${activeTab === 'gating' ? 'active' : ''}`}
          onClick={() => setActiveTab('gating')}
        >
          Gating Rules
        </button>
        <button
          className={`tab ${activeTab === 'outcome' ? 'active' : ''}`}
          onClick={() => setActiveTab('outcome')}
        >
          Outcomes
        </button>
      </div>

      <div className="editor-content">
        {activeTab === 'basic' && (
          <BasicInfoEditor
            interaction={interaction}
            npcs={npcs}
            onChange={setInteraction}
          />
        )}
        {activeTab === 'gating' && (
          <GatingEditor
            interaction={interaction}
            onChange={setInteraction}
          />
        )}
        {activeTab === 'outcome' && (
          <OutcomeEditor
            interaction={interaction}
            onChange={setInteraction}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Basic info editor tab
 */
function BasicInfoEditor({
  interaction,
  npcs,
  onChange,
}: {
  interaction: Partial<InteractionDefinition>;
  npcs: Array<{ id: number; name: string }>;
  onChange: (updated: Partial<InteractionDefinition>) => void;
}) {
  return (
    <div className="editor-section">
      <div className="form-group">
        <label>
          ID <span className="required">*</span>
        </label>
        <input
          type="text"
          value={interaction.id || ''}
          onChange={(e) => onChange({ ...interaction, id: e.target.value })}
          placeholder="e.g., sophia:greeting"
        />
        <small>Unique identifier (letters, numbers, _, -, :)</small>
      </div>

      <div className="form-group">
        <label>
          Label <span className="required">*</span>
        </label>
        <input
          type="text"
          value={interaction.label || ''}
          onChange={(e) => onChange({ ...interaction, label: e.target.value })}
          placeholder="e.g., Greet Sophia"
        />
        <small>Display text shown to player</small>
      </div>

      <div className="form-group">
        <label>Icon</label>
        <input
          type="text"
          value={interaction.icon || ''}
          onChange={(e) => onChange({ ...interaction, icon: e.target.value })}
          placeholder="e.g., 👋"
        />
        <small>Emoji or icon character</small>
      </div>

      <div className="form-group">
        <label>
          Surface <span className="required">*</span>
        </label>
        <select
          value={interaction.surface || 'dialogue'}
          onChange={(e) =>
            onChange({
              ...interaction,
              surface: e.target.value as InteractionDefinition['surface'],
            })
          }
        >
          <option value="inline">Inline (quick action)</option>
          <option value="dialogue">Dialogue (conversation)</option>
          <option value="scene">Scene (immersive)</option>
          <option value="notification">Notification (passive)</option>
          <option value="menu">Menu (detailed)</option>
        </select>
        <small>How the interaction appears to the player</small>
      </div>

      <div className="form-group">
        <label>Priority</label>
        <input
          type="number"
          min="0"
          max="100"
          value={interaction.priority || 50}
          onChange={(e) =>
            onChange({ ...interaction, priority: parseInt(e.target.value, 10) })
          }
        />
        <small>Display order (higher = shown first)</small>
      </div>

      <div className="form-group">
        <label>Target NPCs</label>
        <select
          multiple
          value={interaction.targetIds?.map(String) || []}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions).map((opt) =>
              parseInt(opt.value, 10)
            );
            onChange({ ...interaction, targetIds: selected });
          }}
        >
          {npcs.map((npc) => (
            <option key={npc.id} value={npc.id}>
              {npc.name} (#{npc.id})
            </option>
          ))}
        </select>
        <small>Leave empty for all NPCs</small>
      </div>

      <div className="form-group checkbox">
        <label>
          <input
            type="checkbox"
            checked={interaction.targetCanInitiate || false}
            onChange={(e) =>
              onChange({ ...interaction, targetCanInitiate: e.target.checked })
            }
          />
          NPC can initiate this interaction
        </label>
      </div>
    </div>
  );
}

/**
 * Gating rules editor tab
 */
function GatingEditor({
  interaction,
  onChange,
}: {
  interaction: Partial<InteractionDefinition>;
  onChange: (updated: Partial<InteractionDefinition>) => void;
}) {
  const gating = interaction.gating || {};
  const statGating = gating.statGating;

  const getRelationshipGateValue = (axis: string): number | undefined => {
    const gates = statGating?.allOf || [];
    const gate = gates.find(
      (entry) =>
        entry.definitionId === 'relationships' &&
        entry.axis === axis
    );
    return gate?.minValue;
  };

  const updateRelationshipGate = (axis: string, value?: number) => {
    const existing = statGating?.allOf || [];
    const filtered = existing.filter(
      (entry) =>
        !(
          entry.definitionId === 'relationships' &&
          entry.axis === axis
        )
    );
    const nextAllOf = value !== undefined
      ? [
          ...filtered,
          {
            definitionId: 'relationships',
            axis,
            minValue: value,
            entityType: 'npc' as const,
          },
        ]
      : filtered;

    const nextStatGating = nextAllOf.length
      ? { ...statGating, allOf: nextAllOf }
      : undefined;

    onChange({
      ...interaction,
      gating: { ...gating, statGating: nextStatGating },
    });
  };

  const updateGating = (updates: Partial<typeof gating>) => {
    onChange({
      ...interaction,
      gating: { ...gating, ...updates },
    });
  };

  return (
    <div className="editor-section">
      <h3>Relationship Requirements</h3>
      <div className="form-group">
        <label>Min Affinity</label>
        <input
          type="number"
          min="0"
          max="100"
          value={getRelationshipGateValue('affinity') || ''}
          onChange={(e) =>
            updateRelationshipGate(
              'affinity',
              e.target.value ? parseInt(e.target.value, 10) : undefined
            )
          }
        />
      </div>

      <div className="form-group">
        <label>Min Trust</label>
        <input
          type="number"
          min="0"
          max="100"
          value={getRelationshipGateValue('trust') || ''}
          onChange={(e) =>
            updateRelationshipGate(
              'trust',
              e.target.value ? parseInt(e.target.value, 10) : undefined
            )
          }
        />
      </div>

      <h3>Time of Day</h3>
      <div className="form-group">
        <label>Min Hour (0-23)</label>
        <input
          type="number"
          min="0"
          max="23"
          value={gating.timeOfDay?.minHour || ''}
          onChange={(e) =>
            updateGating({
              timeOfDay: {
                ...gating.timeOfDay,
                minHour: e.target.value ? parseInt(e.target.value, 10) : undefined,
              },
            })
          }
        />
      </div>

      <div className="form-group">
        <label>Max Hour (0-23)</label>
        <input
          type="number"
          min="0"
          max="23"
          value={gating.timeOfDay?.maxHour || ''}
          onChange={(e) =>
            updateGating({
              timeOfDay: {
                ...gating.timeOfDay,
                maxHour: e.target.value ? parseInt(e.target.value, 10) : undefined,
              },
            })
          }
        />
      </div>

      <h3>Cooldown</h3>
      <div className="form-group">
        <label>Cooldown (seconds)</label>
        <input
          type="number"
          min="0"
          value={gating.cooldownSeconds || ''}
          onChange={(e) =>
            updateGating({
              cooldownSeconds: e.target.value ? parseInt(e.target.value, 10) : undefined,
            })
          }
        />
        <small>Time before interaction can be used again</small>
      </div>
    </div>
  );
}

/**
 * Outcome effects editor tab
 */
function OutcomeEditor({
  interaction,
  onChange,
}: {
  interaction: Partial<InteractionDefinition>;
  onChange: (updated: Partial<InteractionDefinition>) => void;
}) {
  const outcome = interaction.outcome || {};

  const updateOutcome = (updates: Partial<typeof outcome>) => {
    onChange({
      ...interaction,
      outcome: { ...outcome, ...updates },
    });
  };

  const getRelationshipDeltaValue = (axis: string): number | undefined => {
    const delta = outcome.statDeltas?.find(
      (entry) =>
        entry.packageId === 'core.relationships' &&
        (!entry.definitionId || entry.definitionId === 'relationships')
    );
    return delta?.axes?.[axis];
  };

  const updateRelationshipDelta = (axis: string, value?: number) => {
    const existing = outcome.statDeltas || [];
    const relationship = existing.find(
      (entry) =>
        entry.packageId === 'core.relationships' &&
        (!entry.definitionId || entry.definitionId === 'relationships')
    );
    const otherDeltas = existing.filter((entry) => entry !== relationship);
    const nextAxes = { ...(relationship?.axes || {}) };

    if (value === undefined || Number.isNaN(value)) {
      delete nextAxes[axis];
    } else {
      nextAxes[axis] = value;
    }

    const hasAxes = Object.keys(nextAxes).length > 0;
    const nextRelationshipDelta = hasAxes
      ? {
          packageId: 'core.relationships',
          definitionId: 'relationships',
          axes: nextAxes,
          entityType: 'npc' as const,
        }
      : null;

    const nextStatDeltas = nextRelationshipDelta
      ? [...otherDeltas, nextRelationshipDelta]
      : otherDeltas;

    updateOutcome({
      statDeltas: nextStatDeltas.length > 0 ? nextStatDeltas : undefined,
    });
  };

  return (
    <div className="editor-section">
      <div className="form-group">
        <label>Success Message</label>
        <textarea
          value={outcome.successMessage || ''}
          onChange={(e) => updateOutcome({ successMessage: e.target.value })}
          placeholder="e.g., Sophia smiles warmly at your greeting."
          rows={3}
        />
      </div>

      <h3>Relationship Changes</h3>
      <div className="form-row">
        <div className="form-group">
          <label>Affinity</label>
          <input
            type="number"
            min="-20"
            max="20"
            value={getRelationshipDeltaValue('affinity') || ''}
            onChange={(e) =>
              updateRelationshipDelta(
                'affinity',
                e.target.value ? parseInt(e.target.value, 10) : undefined
              )
            }
          />
        </div>

        <div className="form-group">
          <label>Trust</label>
          <input
            type="number"
            min="-20"
            max="20"
            value={getRelationshipDeltaValue('trust') || ''}
            onChange={(e) =>
              updateRelationshipDelta(
                'trust',
                e.target.value ? parseInt(e.target.value, 10) : undefined
              )
            }
          />
        </div>

        <div className="form-group">
          <label>Chemistry</label>
          <input
            type="number"
            min="-20"
            max="20"
            value={getRelationshipDeltaValue('chemistry') || ''}
            onChange={(e) =>
              updateRelationshipDelta(
                'chemistry',
                e.target.value ? parseInt(e.target.value, 10) : undefined
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
