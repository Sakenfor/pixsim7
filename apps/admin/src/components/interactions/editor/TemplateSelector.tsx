/**
 * Template Selector
 *
 * Allows selecting from pre-built interaction templates
 */

import React, { useState } from 'react';
import type { NpcInteractionDefinition } from '@pixsim7/shared.types';
import {
  getTemplatesByCategory,
  createFromTemplate,
  type InteractionTemplate,
  type TemplateOptions,
} from '@pixsim7/game-core/interactions';
import './TemplateSelector.css';

export interface TemplateSelectorProps {
  /** NPCs available for selection */
  npcs: Array<{ id: number; name: string }>;
  /** Callback when template is selected and configured */
  onSelect: (interaction: NpcInteractionDefinition) => void;
  /** Callback when selector is cancelled */
  onCancel: () => void;
}

/**
 * Template selector component
 */
export function TemplateSelector({ npcs, onSelect, onCancel }: TemplateSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    'social' | 'transactional' | 'narrative' | 'romantic' | 'hostile'
  >('social');
  const [selectedTemplate, setSelectedTemplate] = useState<InteractionTemplate | null>(
    null
  );
  const [options, setOptions] = useState<Partial<TemplateOptions>>({});

  const templates = getTemplatesByCategory(selectedCategory);

  const handleCreateFromTemplate = () => {
    if (!selectedTemplate || !options.id || !options.label) {
      alert('Please fill in required fields: ID and Label');
      return;
    }

    const interaction = createFromTemplate(selectedTemplate.id, options as TemplateOptions);
    if (interaction) {
      onSelect(interaction);
    }
  };

  return (
    <div className="template-selector">
      <div className="selector-header">
        <h2>Choose a Template</h2>
        <button className="btn-close" onClick={onCancel}>
          ✕
        </button>
      </div>

      <div className="selector-content">
        <div className="category-tabs">
          {(['social', 'transactional', 'narrative', 'romantic', 'hostile'] as const).map(
            (category) => (
              <button
                key={category}
                className={`category-tab ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => {
                  setSelectedCategory(category);
                  setSelectedTemplate(null);
                }}
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </button>
            )
          )}
        </div>

        <div className="template-grid">
          {templates.map((template) => (
            <div
              key={template.id}
              className={`template-card ${
                selectedTemplate?.id === template.id ? 'selected' : ''
              }`}
              onClick={() => setSelectedTemplate(template)}
            >
              <h4>{template.name}</h4>
              <p>{template.description}</p>
              <div className="template-surface">{template.defaultSurface}</div>
            </div>
          ))}
        </div>

        {selectedTemplate && (
          <div className="template-config">
            <h3>Configure "{selectedTemplate.name}"</h3>

            <div className="form-group">
              <label>
                ID <span className="required">*</span>
              </label>
              <input
                type="text"
                value={options.id || ''}
                onChange={(e) => setOptions({ ...options, id: e.target.value })}
                placeholder="e.g., sophia:greeting"
              />
            </div>

            <div className="form-group">
              <label>
                Label <span className="required">*</span>
              </label>
              <input
                type="text"
                value={options.label || ''}
                onChange={(e) => setOptions({ ...options, label: e.target.value })}
                placeholder="e.g., Greet Sophia"
              />
            </div>

            <div className="form-group">
              <label>Target NPC</label>
              <select
                value={options.targetNpcIds?.[0] || ''}
                onChange={(e) => {
                  const npcId = parseInt(e.target.value, 10);
                  const npc = npcs.find((n) => n.id === npcId);
                  setOptions({
                    ...options,
                    targetNpcIds: npcId ? [npcId] : undefined,
                    npcName: npc?.name,
                  });
                }}
              >
                <option value="">All NPCs</option>
                {npcs.map((npc) => (
                  <option key={npc.id} value={npc.id}>
                    {npc.name} (#{npc.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Template-specific fields */}
            {selectedTemplate.id === 'giftGiving' && (
              <>
                <div className="form-group">
                  <label>Item ID</label>
                  <input
                    type="text"
                    value={(options as any).itemId || ''}
                    onChange={(e) => setOptions({ ...options, itemId: e.target.value })}
                    placeholder="e.g., item_flowers"
                  />
                </div>
                <div className="form-group">
                  <label>Item Name</label>
                  <input
                    type="text"
                    value={(options as any).itemName || ''}
                    onChange={(e) => setOptions({ ...options, itemName: e.target.value })}
                    placeholder="e.g., flowers"
                  />
                </div>
                <div className="form-group">
                  <label>Affinity Boost</label>
                  <input
                    type="number"
                    value={(options as any).affinityBoost || 5}
                    onChange={(e) =>
                      setOptions({ ...options, affinityBoost: parseInt(e.target.value, 10) })
                    }
                  />
                </div>
              </>
            )}

            {(selectedTemplate.id === 'questStart' || selectedTemplate.id === 'questComplete') && (
              <>
                <div className="form-group">
                  <label>Quest ID</label>
                  <input
                    type="text"
                    value={(options as any).questId || ''}
                    onChange={(e) => setOptions({ ...options, questId: e.target.value })}
                    placeholder="e.g., main_quest_01"
                  />
                </div>
                <div className="form-group">
                  <label>Quest Name</label>
                  <input
                    type="text"
                    value={(options as any).questName || ''}
                    onChange={(e) => setOptions({ ...options, questName: e.target.value })}
                    placeholder="e.g., The Lost Artifact"
                  />
                </div>
              </>
            )}

            <div className="config-actions">
              <button className="btn-secondary" onClick={() => setSelectedTemplate(null)}>
                Back
              </button>
              <button className="btn-primary" onClick={handleCreateFromTemplate}>
                Create from Template
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
