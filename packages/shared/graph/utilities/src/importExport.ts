/**
 * Generic import/export utilities for graphs
 *
 * Handles JSON serialization/deserialization with validation and metadata.
 */

export interface ExportMetadata {
  exportedAt: string;
  exportedBy: string;
  version?: number;
}

export interface ImportOptions<TGraph> {
  /** Validation function - return true if valid */
  validate: (data: any) => boolean;
  /** Generate new ID to avoid conflicts */
  generateId: () => string;
  /** Transform imported data before returning */
  transform?: (data: any) => TGraph;
}

/**
 * Export a graph to JSON string
 */
export function exportGraph<TGraph>(
  graph: TGraph,
  metadata: Partial<ExportMetadata> = {}
): string {
  const exportData = {
    ...graph,
    exportedAt: new Date().toISOString(),
    exportedBy: 'graph-utilities-v1',
    ...metadata,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export multiple graphs as a project
 */
export function exportProject<TGraph>(
  graphs: Record<string, TGraph>,
  metadata: Record<string, any> = {}
): string {
  const exportData = {
    version: 1,
    graphs,
    ...metadata,
    exportedAt: new Date().toISOString(),
    exportedBy: 'graph-utilities-v1',
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Import a graph from JSON string
 */
export function importGraph<TGraph extends { id: string }>(
  jsonString: string,
  options: ImportOptions<TGraph>
): TGraph | null {
  try {
    const data = JSON.parse(jsonString);

    // Validate structure
    if (!options.validate(data)) {
      throw new Error('Invalid graph format');
    }

    // Transform if needed
    const transformedData = options.transform ? options.transform(data) : data;

    // Generate new ID and timestamps
    const importedGraph: TGraph = {
      ...transformedData,
      id: options.generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return importedGraph;
  } catch (error) {
    console.error('[graph-utilities] Import failed:', error);
    return null;
  }
}

/**
 * Import a project (multiple graphs) from JSON string
 */
export function importProject<TGraph>(
  jsonString: string,
  graphsKey: string,
  validate: (data: any) => boolean
): Record<string, TGraph> | null {
  try {
    const data = JSON.parse(jsonString);

    if (!data[graphsKey] || typeof data[graphsKey] !== 'object') {
      throw new Error(`Invalid project format: missing ${graphsKey}`);
    }

    if (!validate(data)) {
      throw new Error('Project validation failed');
    }

    return data[graphsKey];
  } catch (error) {
    console.error('[graph-utilities] Project import failed:', error);
    return null;
  }
}

/**
 * Basic validation helper - checks for required fields
 */
export function createBasicValidator<T extends Record<string, any>>(
  requiredFields: (keyof T)[]
): (data: any) => data is T {
  return (data: any): data is T => {
    if (!data || typeof data !== 'object') return false;
    return requiredFields.every(field => field in data);
  };
}
