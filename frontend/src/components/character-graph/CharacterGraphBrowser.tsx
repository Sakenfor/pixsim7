/**
 * Character Graph Browser
 *
 * Interactive browser for the character identity graph.
 * Shows all connections between characters, instances, NPCs, scenes, and assets.
 */
import React, { useState, useEffect } from 'react';
import type {
  CharacterIdentityGraph,
  CharacterGraphNodeUnion,
  CharacterGraphEdge,
  CharacterUsageStats,
} from '@pixsim7/types';

interface CharacterGraphBrowserProps {
  /** Character UUID to display */
  characterId: string;
  /** Optional world filter */
  worldId?: number;
  /** Max graph depth */
  maxDepth?: number;
  /** API base URL */
  apiBaseUrl?: string;
}

interface GraphData {
  graph: CharacterIdentityGraph | null;
  stats: CharacterUsageStats | null;
  loading: boolean;
  error: string | null;
}

export const CharacterGraphBrowser: React.FC<CharacterGraphBrowserProps> = ({
  characterId,
  worldId,
  maxDepth = 3,
  apiBaseUrl = '/api/v1',
}) => {
  const [graphData, setGraphData] = useState<GraphData>({
    graph: null,
    stats: null,
    loading: true,
    error: null,
  });
  const [selectedNode, setSelectedNode] = useState<CharacterGraphNodeUnion | null>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'stats' | 'scenes' | 'assets'>('graph');

  // Fetch graph data
  useEffect(() => {
    const fetchGraph = async () => {
      setGraphData((prev) => ({ ...prev, loading: true, error: null }));

      try {
        // Fetch graph
        const graphUrl = new URL(
          `${apiBaseUrl}/character-graph/character/${characterId}`,
          window.location.origin
        );
        if (worldId) graphUrl.searchParams.set('world_id', worldId.toString());
        graphUrl.searchParams.set('max_depth', maxDepth.toString());

        const graphResponse = await fetch(graphUrl.toString());
        if (!graphResponse.ok) throw new Error('Failed to fetch graph');
        const graph = await graphResponse.json();

        // Fetch stats
        const statsUrl = `${apiBaseUrl}/character-graph/character/${characterId}/stats`;
        const statsResponse = await fetch(statsUrl);
        if (!statsResponse.ok) throw new Error('Failed to fetch stats');
        const stats = await statsResponse.json();

        setGraphData({ graph, stats, loading: false, error: null });
      } catch (err) {
        setGraphData((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        }));
      }
    };

    fetchGraph();
  }, [characterId, worldId, maxDepth, apiBaseUrl]);

  // Render loading state
  if (graphData.loading) {
    return (
      <div className="character-graph-browser loading">
        <div className="spinner" />
        <p>Loading character graph...</p>
      </div>
    );
  }

  // Render error state
  if (graphData.error) {
    return (
      <div className="character-graph-browser error">
        <h3>Error Loading Graph</h3>
        <p>{graphData.error}</p>
      </div>
    );
  }

  const { graph, stats } = graphData;
  if (!graph || !stats) return null;

  // Get root character node
  const rootNode = graph.nodes.find((n) => n.id === graph.meta?.rootNodeId);

  return (
    <div className="character-graph-browser">
      {/* Header */}
      <div className="graph-header">
        <h2>
          {rootNode?.label || 'Character Graph'}
        </h2>
        <div className="view-mode-tabs">
          <button
            className={viewMode === 'graph' ? 'active' : ''}
            onClick={() => setViewMode('graph')}
          >
            Graph
          </button>
          <button
            className={viewMode === 'stats' ? 'active' : ''}
            onClick={() => setViewMode('stats')}
          >
            Statistics
          </button>
          <button
            className={viewMode === 'scenes' ? 'active' : ''}
            onClick={() => setViewMode('scenes')}
          >
            Scenes
          </button>
          <button
            className={viewMode === 'assets' ? 'active' : ''}
            onClick={() => setViewMode('assets')}
          >
            Assets
          </button>
        </div>
      </div>

      {/* Content based on view mode */}
      {viewMode === 'graph' && (
        <GraphView
          graph={graph}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
        />
      )}

      {viewMode === 'stats' && <StatsView stats={stats} />}

      {viewMode === 'scenes' && (
        <ScenesView
          characterId={characterId}
          apiBaseUrl={apiBaseUrl}
        />
      )}

      {viewMode === 'assets' && (
        <AssetsView
          characterId={characterId}
          worldId={worldId}
          apiBaseUrl={apiBaseUrl}
        />
      )}
    </div>
  );
};

// ============================================================================
// Graph View
// ============================================================================

interface GraphViewProps {
  graph: CharacterIdentityGraph;
  selectedNode: CharacterGraphNodeUnion | null;
  onSelectNode: (node: CharacterGraphNodeUnion | null) => void;
}

const GraphView: React.FC<GraphViewProps> = ({ graph, selectedNode, onSelectNode }) => {
  // Group nodes by type
  const nodesByType = graph.nodes.reduce((acc, node) => {
    if (!acc[node.type]) acc[node.type] = [];
    acc[node.type].push(node);
    return acc;
  }, {} as Record<string, CharacterGraphNodeUnion[]>);

  return (
    <div className="graph-view">
      <div className="graph-summary">
        <h3>Graph Overview</h3>
        <div className="stats-grid">
          <div className="stat">
            <span className="label">Total Nodes:</span>
            <span className="value">{graph.meta?.stats?.totalNodes || 0}</span>
          </div>
          <div className="stat">
            <span className="label">Total Edges:</span>
            <span className="value">{graph.meta?.stats?.totalEdges || 0}</span>
          </div>
          <div className="stat">
            <span className="label">Built At:</span>
            <span className="value">
              {graph.meta?.builtAt ? new Date(graph.meta.builtAt).toLocaleString() : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      <div className="nodes-by-type">
        <h3>Nodes by Type</h3>
        {Object.entries(nodesByType).map(([type, nodes]) => (
          <NodeTypeSection
            key={type}
            type={type}
            nodes={nodes}
            selectedNode={selectedNode}
            onSelectNode={onSelectNode}
          />
        ))}
      </div>

      {selectedNode && (
        <div className="node-details">
          <h3>Node Details</h3>
          <NodeDetails node={selectedNode} graph={graph} />
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Node Type Section
// ============================================================================

interface NodeTypeSectionProps {
  type: string;
  nodes: CharacterGraphNodeUnion[];
  selectedNode: CharacterGraphNodeUnion | null;
  onSelectNode: (node: CharacterGraphNodeUnion) => void;
}

const NodeTypeSection: React.FC<NodeTypeSectionProps> = ({
  type,
  nodes,
  selectedNode,
  onSelectNode,
}) => {
  const [expanded, setExpanded] = useState(true);

  const typeLabels: Record<string, string> = {
    character_template: 'Character Templates',
    character_instance: 'Character Instances',
    game_npc: 'Game NPCs',
    scene: 'Scenes',
    scene_role: 'Scene Roles',
    asset: 'Assets',
    generation: 'Generations',
    prompt_version: 'Prompt Versions',
    action_block: 'Action Blocks',
  };

  return (
    <div className="node-type-section">
      <div className="section-header" onClick={() => setExpanded(!expanded)}>
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
        <h4>
          {typeLabels[type] || type} ({nodes.length})
        </h4>
      </div>

      {expanded && (
        <div className="node-list">
          {nodes.map((node) => (
            <div
              key={node.id}
              className={`node-item ${selectedNode?.id === node.id ? 'selected' : ''}`}
              onClick={() => onSelectNode(node)}
            >
              <span className="node-type-badge">{type}</span>
              <span className="node-label">{node.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Node Details
// ============================================================================

interface NodeDetailsProps {
  node: CharacterGraphNodeUnion;
  graph: CharacterIdentityGraph;
}

const NodeDetails: React.FC<NodeDetailsProps> = ({ node, graph }) => {
  // Find edges connected to this node
  const incomingEdges = graph.edges.filter((e) => e.to === node.id);
  const outgoingEdges = graph.edges.filter((e) => e.from === node.id);

  return (
    <div className="node-details-content">
      <div className="detail-section">
        <h4>Basic Info</h4>
        <dl>
          <dt>ID:</dt>
          <dd>{node.id}</dd>
          <dt>Type:</dt>
          <dd>{node.type}</dd>
          <dt>Label:</dt>
          <dd>{node.label}</dd>
        </dl>
      </div>

      {node.meta && Object.keys(node.meta).length > 0 && (
        <div className="detail-section">
          <h4>Metadata</h4>
          <pre>{JSON.stringify(node.meta, null, 2)}</pre>
        </div>
      )}

      {incomingEdges.length > 0 && (
        <div className="detail-section">
          <h4>Incoming Connections ({incomingEdges.length})</h4>
          <ul>
            {incomingEdges.map((edge, i) => (
              <li key={i}>
                <strong>{edge.type}:</strong> {edge.from}
                {edge.label && ` - ${edge.label}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {outgoingEdges.length > 0 && (
        <div className="detail-section">
          <h4>Outgoing Connections ({outgoingEdges.length})</h4>
          <ul>
            {outgoingEdges.map((edge, i) => (
              <li key={i}>
                <strong>{edge.type}:</strong> {edge.to}
                {edge.label && ` - ${edge.label}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Stats View
// ============================================================================

interface StatsViewProps {
  stats: CharacterUsageStats;
}

const StatsView: React.FC<StatsViewProps> = ({ stats }) => {
  return (
    <div className="stats-view">
      <h3>Usage Statistics</h3>

      <div className="stats-grid">
        <StatCard label="World Instances" value={stats.instanceCount} />
        <StatCard label="Linked NPCs" value={stats.npcCount} />
        <StatCard label="Scenes" value={stats.sceneCount} />
        <StatCard label="Assets" value={stats.assetCount} />
        <StatCard label="Generations" value={stats.generationCount} />
        <StatCard label="Prompt Versions" value={stats.promptVersionCount} />
      </div>

      {stats.worldIds.length > 0 && (
        <div className="detail-section">
          <h4>Worlds</h4>
          <ul>
            {stats.worldIds.map((worldId) => (
              <li key={worldId}>World {worldId}</li>
            ))}
          </ul>
        </div>
      )}

      {stats.relatedCharacterIds.length > 0 && (
        <div className="detail-section">
          <h4>Related Characters</h4>
          <p>{stats.relatedCharacterIds.length} related character(s)</p>
        </div>
      )}

      {stats.lastUsedAt && (
        <div className="detail-section">
          <h4>Last Used</h4>
          <p>{new Date(stats.lastUsedAt).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: number;
}

const StatCard: React.FC<StatCardProps> = ({ label, value }) => {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
};

// ============================================================================
// Scenes View
// ============================================================================

interface ScenesViewProps {
  characterId: string;
  apiBaseUrl: string;
}

const ScenesView: React.FC<ScenesViewProps> = ({ characterId, apiBaseUrl }) => {
  const [scenes, setScenes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchScenes = async () => {
      try {
        const url = `${apiBaseUrl}/character-graph/character/${characterId}/scenes`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch scenes');
        const data = await response.json();
        setScenes(data.scenes || []);
      } catch (err) {
        console.error('Error fetching scenes:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchScenes();
  }, [characterId, apiBaseUrl]);

  if (loading) return <div>Loading scenes...</div>;

  return (
    <div className="scenes-view">
      <h3>Scenes ({scenes.length})</h3>
      {scenes.length === 0 ? (
        <p>No scenes found for this character.</p>
      ) : (
        <div className="scene-list">
          {scenes.map((scene) => (
            <div key={scene.sceneId} className="scene-card">
              <h4>{scene.title}</h4>
              {scene.description && <p>{scene.description}</p>}
              {scene.role && (
                <div className="scene-role">
                  <strong>Role:</strong> {JSON.stringify(scene.role)}
                </div>
              )}
              {scene.required !== undefined && (
                <div className="scene-required">
                  {scene.required ? 'Required Character' : 'Optional Character'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Assets View
// ============================================================================

interface AssetsViewProps {
  characterId: string;
  worldId?: number;
  apiBaseUrl: string;
}

const AssetsView: React.FC<AssetsViewProps> = ({ characterId, worldId, apiBaseUrl }) => {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const url = new URL(
          `${apiBaseUrl}/character-graph/character/${characterId}/assets`,
          window.location.origin
        );
        if (worldId) url.searchParams.set('world_id', worldId.toString());

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error('Failed to fetch assets');
        const data = await response.json();
        setAssets(data.assets || []);
      } catch (err) {
        console.error('Error fetching assets:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAssets();
  }, [characterId, worldId, apiBaseUrl]);

  if (loading) return <div>Loading assets...</div>;

  return (
    <div className="assets-view">
      <h3>Assets ({assets.length})</h3>
      {assets.length === 0 ? (
        <p>No assets found for this character.</p>
      ) : (
        <div className="asset-list">
          {assets.map((asset) => (
            <div key={asset.assetId} className="asset-card">
              <div className="asset-type-badge">{asset.mediaType}</div>
              <div className="asset-info">
                <strong>Asset #{asset.assetId}</strong>
                {asset.description && <p>{asset.description}</p>}
                {asset.tags && asset.tags.length > 0 && (
                  <div className="asset-tags">
                    {asset.tags.map((tag: string, i: number) => (
                      <span key={i} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CharacterGraphBrowser;
