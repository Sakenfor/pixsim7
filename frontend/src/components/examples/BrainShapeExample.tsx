/**
 * BrainShape Example - Demonstrates the complete NPC Brain visualization
 * This shows how all the pieces come together
 */

import { useState, useEffect } from 'react';
import { BrainShape } from '../shapes/BrainShape';
import { mockCore } from '../../lib/core/mockCore';
import type { NpcBrainState } from '@pixsim7/game-core';
import { BrainFace } from '@pixsim7/semantic-shapes';
import { sciFiTheme } from '../../lib/theme/scifi-tokens';
import './BrainShapeExample.css';

/**
 * Example integration showing the NPC Brain Shape in action
 * This component demonstrates:
 * - Loading NPC data from the core
 * - Rendering the 3D brain visualization
 * - Handling face interactions
 * - Live updates from core events
 */
export const BrainShapeExample: React.FC = () => {
  const [selectedNpc, setSelectedNpc] = useState<number>(1);
  const [brainState, setBrainState] = useState<NpcBrainState | null>(null);
  const [activeFace, setActiveFace] = useState<BrainFace>('cortex');
  const [hoveredFace, setHoveredFace] = useState<BrainFace | null>(null);
  const [visualStyle, setVisualStyle] = useState<'holographic' | 'organic' | 'circuit'>('holographic');
  const [showConnections, setShowConnections] = useState(true);

  // Initialize and load session
  useEffect(() => {
    mockCore.loadSession(1).then(() => {
      const brain = mockCore.getNpcBrainState(selectedNpc);
      if (brain) setBrainState(brain);
    });
  }, []);

  // Subscribe to brain updates
  useEffect(() => {
    const unsubscribe = mockCore.on('npcBrainChanged', (payload) => {
      if (payload.npcId === selectedNpc) {
        setBrainState(payload.brain);
      }
    });

    return unsubscribe;
  }, [selectedNpc]);

  // Load brain state when NPC changes
  useEffect(() => {
    const brain = mockCore.getNpcBrainState(selectedNpc);
    if (brain) setBrainState(brain);
  }, [selectedNpc]);

  if (!brainState) {
    return (
      <div className="loading-container">
        <div className="loading-text">Initializing Neural Interface...</div>
        <div className="loading-bar" />
      </div>
    );
  }

  return (
    <div className="brain-example-container">
      {/* Header */}
      <header className="brain-example-header">
        <h1 className="title">NPC Neural Interface</h1>
        <div className="subtitle">Semantic Brain Visualization System</div>
      </header>

      {/* Control Bar */}
      <div className="control-bar">
        <div className="control-group">
          <label>NPC:</label>
          <select
            value={selectedNpc}
            onChange={(e) => setSelectedNpc(Number(e.target.value))}
            className="control-select"
          >
            <option value={1}>Alice (Friendly)</option>
            <option value={2}>Bob (Rival)</option>
          </select>
        </div>

        <div className="control-group">
          <label>Visual Style:</label>
          <div className="style-buttons">
            <button
              className={`style-btn ${visualStyle === 'holographic' ? 'active' : ''}`}
              onClick={() => setVisualStyle('holographic')}
            >
              Holographic
            </button>
            <button
              className={`style-btn ${visualStyle === 'organic' ? 'active' : ''}`}
              onClick={() => setVisualStyle('organic')}
            >
              Organic
            </button>
            <button
              className={`style-btn ${visualStyle === 'circuit' ? 'active' : ''}`}
              onClick={() => setVisualStyle('circuit')}
            >
              Circuit
            </button>
          </div>
        </div>

        <div className="control-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showConnections}
              onChange={(e) => setShowConnections(e.target.checked)}
            />
            Show Neural Connections
          </label>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="brain-example-content">
        {/* Brain Visualization */}
        <div className="brain-visualization">
          <BrainShape
            npcId={selectedNpc}
            brainState={brainState}
            onFaceClick={setActiveFace}
            onFaceHover={setHoveredFace}
            activeFace={activeFace}
            showConnections={showConnections}
            style={visualStyle}
            size={400}
          />

          {/* Hover Info */}
          {hoveredFace && (
            <div className="hover-info">
              <div className="hover-face">{hoveredFace.toUpperCase()}</div>
              <div className="hover-hint">Click to inspect</div>
            </div>
          )}
        </div>

        {/* Face Inspector Panel */}
        <div className="face-inspector">
          <h2 className="inspector-title">
            {activeFace.charAt(0).toUpperCase() + activeFace.slice(1)} Analysis
          </h2>

          <div className="inspector-content">
            {activeFace === 'cortex' && (
              <PersonalityInspector traits={brainState.traits} tags={brainState.personaTags} />
            )}
            {activeFace === 'memory' && (
              <MemoryInspector memories={brainState.memories} />
            )}
            {activeFace === 'emotion' && (
              <MoodInspector mood={brainState.mood} />
            )}
            {activeFace === 'logic' && (
              <LogicInspector logic={brainState.logic} />
            )}
            {activeFace === 'instinct' && (
              <InstinctInspector instincts={brainState.instincts} />
            )}
            {activeFace === 'social' && (
              <SocialInspector
                social={brainState.social}
                onUpdate={(updates) => {
                  mockCore.updateNpcRelationship(selectedNpc, updates);
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-item">
          <span className="status-label">Neural Activity:</span>
          <span className="status-value">{Math.round(brainState.mood.arousal * 100)}%</span>
        </div>
        <div className="status-item">
          <span className="status-label">Emotional Valence:</span>
          <span className="status-value">
            {brainState.mood.valence > 0 ? '+' : ''}{(brainState.mood.valence * 100).toFixed(0)}
          </span>
        </div>
        <div className="status-item">
          <span className="status-label">Relationship Tier:</span>
          <span className="status-value">{brainState.social.tierId || 'Stranger'}</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Face Inspector Components
// ============================================================================

const PersonalityInspector: React.FC<{
  traits: Record<string, number>;
  tags: string[];
}> = ({ traits, tags }) => (
  <div className="inspector-section">
    <h3>Personality Traits</h3>
    {Object.entries(traits).map(([trait, value]) => (
      <div key={trait} className="trait-item">
        <span className="trait-name">{trait}:</span>
        <div className="trait-bar">
          <div
            className="trait-fill"
            style={{ width: `${value * 100}%` }}
          />
        </div>
        <span className="trait-value">{(value * 100).toFixed(0)}%</span>
      </div>
    ))}

    <h3>Persona Tags</h3>
    <div className="tag-list">
      {tags.map(tag => (
        <span key={tag} className="persona-tag">{tag}</span>
      ))}
    </div>
  </div>
);

const MemoryInspector: React.FC<{
  memories: any[];
}> = ({ memories }) => (
  <div className="inspector-section">
    <h3>Recent Memories</h3>
    <div className="memory-list">
      {memories.length === 0 ? (
        <div className="empty-state">No memories yet</div>
      ) : (
        memories.slice(0, 5).map(memory => (
          <div key={memory.id} className="memory-item">
            <div className="memory-summary">{memory.summary}</div>
            <div className="memory-meta">
              <span className="memory-time">
                {new Date(memory.timestamp).toLocaleDateString()}
              </span>
              {memory.tags.map(tag => (
                <span key={tag} className="memory-tag">{tag}</span>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

const MoodInspector: React.FC<{
  mood: any;
}> = ({ mood }) => (
  <div className="inspector-section">
    <h3>Current Mood: {mood.label || 'Neutral'}</h3>

    <div className="mood-grid">
      <div className="mood-axis">
        <span className="axis-label">Valence</span>
        <div className="axis-bar">
          <div
            className="axis-indicator"
            style={{ left: `${(mood.valence + 1) * 50}%` }}
          />
        </div>
        <div className="axis-labels">
          <span>Negative</span>
          <span>Positive</span>
        </div>
      </div>

      <div className="mood-axis">
        <span className="axis-label">Arousal</span>
        <div className="axis-bar">
          <div
            className="axis-indicator"
            style={{ left: `${mood.arousal * 100}%` }}
          />
        </div>
        <div className="axis-labels">
          <span>Calm</span>
          <span>Excited</span>
        </div>
      </div>
    </div>
  </div>
);

const LogicInspector: React.FC<{
  logic: any;
}> = ({ logic }) => (
  <div className="inspector-section">
    <h3>Decision Strategies</h3>
    <div className="strategy-list">
      {logic.strategies.map((strategy: string) => (
        <div key={strategy} className="strategy-item">
          <span className="strategy-icon">⚡</span>
          <span className="strategy-name">{strategy}</span>
        </div>
      ))}
    </div>
  </div>
);

const InstinctInspector: React.FC<{
  instincts: string[];
}> = ({ instincts }) => (
  <div className="inspector-section">
    <h3>Base Instincts</h3>
    <div className="instinct-list">
      {instincts.map(instinct => (
        <div key={instinct} className="instinct-item">
          <span className="instinct-icon">🔥</span>
          <span className="instinct-name">{instinct}</span>
        </div>
      ))}
    </div>
  </div>
);

const SocialInspector: React.FC<{
  social: any;
  onUpdate: (updates: any) => void;
}> = ({ social, onUpdate }) => (
  <div className="inspector-section">
    <h3>Relationship Status</h3>

    <div className="relationship-metrics">
      <div className="metric">
        <label>Affinity</label>
        <input
          type="range"
          min="0"
          max="100"
          value={social.affinity}
          onChange={(e) => onUpdate({ affinity: Number(e.target.value) })}
          className="metric-slider affinity"
        />
        <span className="metric-value">{social.affinity}</span>
      </div>

      <div className="metric">
        <label>Trust</label>
        <input
          type="range"
          min="0"
          max="100"
          value={social.trust}
          onChange={(e) => onUpdate({ trust: Number(e.target.value) })}
          className="metric-slider trust"
        />
        <span className="metric-value">{social.trust}</span>
      </div>

      <div className="metric">
        <label>Chemistry</label>
        <input
          type="range"
          min="0"
          max="100"
          value={social.chemistry}
          onChange={(e) => onUpdate({ chemistry: Number(e.target.value) })}
          className="metric-slider chemistry"
        />
        <span className="metric-value">{social.chemistry}</span>
      </div>

      <div className="metric">
        <label>Tension</label>
        <input
          type="range"
          min="0"
          max="100"
          value={social.tension}
          onChange={(e) => onUpdate({ tension: Number(e.target.value) })}
          className="metric-slider tension"
        />
        <span className="metric-value">{social.tension}</span>
      </div>
    </div>

    <div className="relationship-info">
      <div className="info-row">
        <span>Tier:</span>
        <span className="info-value">{social.tierId || 'Stranger'}</span>
      </div>
      <div className="info-row">
        <span>Intimacy:</span>
        <span className="info-value">{social.intimacyLevelId || 'None'}</span>
      </div>
    </div>

    {social.flags.length > 0 && (
      <>
        <h4>Relationship Flags</h4>
        <div className="flag-list">
          {social.flags.map((flag: string) => (
            <span key={flag} className="relationship-flag">{flag}</span>
          ))}
        </div>
      </>
    )}
  </div>
);