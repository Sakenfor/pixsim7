/**
 * Response graph contracts used by NpcResponseEvaluator.
 *
 * These interfaces intentionally mirror the response-graph shape used by
 * graph tooling, but live locally so interaction.gizmos can build standalone
 * without pulling in source-level graph package compilation.
 */

export type ResponseNodeType = string;

export interface ResponseGraphNode {
  id: string;
  type: ResponseNodeType;
  label?: string;
  position: { x: number; y: number };
  data: Record<string, any>;
}

export interface ResponseGraphConnection {
  id: string;
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}

export interface NpcResponseMetadata {
  responseGraph: {
    nodes: ResponseGraphNode[];
    connections: ResponseGraphConnection[];
  };
  videoGen: {
    enabled?: boolean;
    basePrompt?: string;
    style?: {
      artStyle: string;
      quality: string;
      loras?: string[];
    };
  };
  debug?: {
    logEvaluations?: boolean;
  };
}

