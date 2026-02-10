import { useToast } from '@pixsim7/shared.ui';
import { useCallback, useEffect } from 'react';

import type { GraphTemplate } from '@features/graph';
import { captureTemplate, applyTemplate } from '@features/graph';
import { graphClipboard } from '@features/graph';

import type { DraftSceneNode } from '@domain/sceneBuilder';

/** Parameters accepted by the useGraphPanelHandlers hook. */
export interface GraphPanelHandlersParams {
  currentScene: {
    title: string;
    nodes: DraftSceneNode[];
    edges: { id: string; from: string; to: string; meta?: Record<string, unknown> }[];
    startNodeId?: string;
  } | undefined;
  currentSceneId: string | null;
  worldId: number | null | undefined;
  selectedNodeIds: string[];

  // Store actions
  exportScene: (sceneId: string) => string | null;
  importScene: (json: string) => string | null;
  getCurrentScene: () => GraphPanelHandlersParams['currentScene'] | undefined;
  addTemplate: (template: GraphTemplate, worldId?: number | null) => Promise<void>;
  recordUsage: (data: {
    templateId: string;
    sceneId: string | null;
    worldId: number | null;
    nodeCount: number;
    edgeCount: number;
  }) => void;
  addNode: (node: DraftSceneNode) => void;
  connectNodes: (from: string, to: string, meta?: Record<string, unknown>) => void;
  setSelectedNodeIds: (ids: string[]) => void;
}

export function useGraphPanelHandlers(params: GraphPanelHandlersParams) {
  const {
    currentScene,
    currentSceneId,
    worldId,
    selectedNodeIds,
    exportScene,
    importScene,
    getCurrentScene,
    addTemplate,
    recordUsage,
    addNode,
    connectNodes,
    setSelectedNodeIds,
  } = params;

  const toast = useToast();

  // ---------------------------------------------------------------------------
  // File I/O
  // ---------------------------------------------------------------------------

  /** Export scene to JSON file */
  const handleExportFile = useCallback(() => {
    try {
      if (!currentSceneId) {
        toast.error('No scene to export');
        return;
      }

      const jsonString = exportScene(currentSceneId);
      if (!jsonString) {
        toast.error('Failed to export scene');
        return;
      }

      const filename = `${currentScene?.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'scene'}_${Date.now()}.json`;

      // Create blob and download
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported: ${filename}`);
    } catch (error) {
      toast.error(`Export error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [toast, currentScene, currentSceneId, exportScene]);

  /** Import scene from JSON file */
  const handleImportFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const sceneId = importScene(text);
        if (sceneId) {
          const scene = getCurrentScene();
          toast.success(`Imported: ${scene?.title || sceneId}`);
        }
      } catch (error) {
        toast.error(`Import error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    input.click();
  }, [toast, importScene, getCurrentScene]);

  // ---------------------------------------------------------------------------
  // Template operations
  // ---------------------------------------------------------------------------

  /** Save selection as template */
  const handleSaveAsTemplate = useCallback(async () => {
    if (!currentScene) {
      toast.error('No active scene');
      return;
    }

    if (selectedNodeIds.length === 0) {
      toast.warning('Select nodes to save as template');
      return;
    }

    // Get selected nodes
    const selectedNodes = currentScene.nodes.filter((n) =>
      selectedNodeIds.includes(n.id)
    );

    if (selectedNodes.length === 0) {
      toast.error('No valid nodes selected');
      return;
    }

    // Get edges between selected nodes
    const selectedNodeIdSet = new Set(selectedNodeIds);
    const selectedEdges = currentScene.edges.filter(
      (edge) => selectedNodeIdSet.has(edge.from) && selectedNodeIdSet.has(edge.to)
    );

    // Prompt for template name and description
    const name = prompt('Enter template name:');
    if (!name || name.trim() === '') {
      toast.info('Template save cancelled');
      return;
    }

    const description = prompt('Enter template description (optional):');

    // Prompt for category
    const categoryInput = prompt(
      'Enter category (optional):\n\n' +
      'Options: Quest Flow, Dialogue Branch, Combat, Minigame, Relationship, Condition Check, Other'
    );
    const category = categoryInput?.trim() as any || undefined;

    // Prompt for tags (comma-separated)
    const tagsInput = prompt('Enter tags (comma-separated, optional):');
    const tags = tagsInput
      ? tagsInput.split(',').map((t) => t.trim()).filter((t) => t.length > 0)
      : [];

    // Prompt for template scope
    let source: 'user' | 'world' = 'user';
    if (worldId !== null && worldId !== undefined) {
      const saveToWorld = confirm(
        `Save template to current world (World #${worldId})?\n\n` +
        'Click OK to save to world (shared with all scenes in this world)\n' +
        'Click Cancel to save to your user templates (available everywhere)'
      );
      source = saveToWorld ? 'world' : 'user';
    }

    try {
      // Create template
      const template = captureTemplate(
        { nodes: selectedNodes, edges: selectedEdges },
        {
          name: name.trim(),
          description: description?.trim(),
          source,
          worldId: source === 'world' ? worldId : undefined,
          category,
          tags,
        }
      );

      // Save to store
      await addTemplate(template, worldId);

      const scopeLabel = source === 'world' ? `world #${worldId}` : 'user templates';
      toast.success(`Template "${name}" saved to ${scopeLabel} with ${selectedNodes.length} nodes`);
    } catch (error) {
      toast.error(`Failed to save template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [currentScene, selectedNodeIds, worldId, toast, addTemplate]);

  /** Insert template into current scene */
  const handleInsertTemplate = useCallback(
    (template: GraphTemplate) => {
      if (!currentScene) {
        toast.error('No active scene');
        return;
      }

      try {
        const parameterValues: Record<string, string | number | boolean> = {};

        // Prompt for parameter values if template has parameters
        if (template.parameters && template.parameters.length > 0) {
          for (const param of template.parameters) {
            const promptText = param.description
              ? `${param.name} (${param.description})\n\nDefault: ${param.defaultValue}`
              : `${param.name}\n\nDefault: ${param.defaultValue}`;

            const inputValue = prompt(promptText, String(param.defaultValue));

            if (inputValue === null) {
              toast.info('Template insertion cancelled');
              return;
            }

            // Parse value based on type
            if (param.type === 'number') {
              parameterValues[param.id] = parseFloat(inputValue) || param.defaultValue;
            } else if (param.type === 'boolean') {
              parameterValues[param.id] =
                inputValue.toLowerCase() === 'true' || inputValue === '1';
            } else {
              parameterValues[param.id] = inputValue || param.defaultValue;
            }
          }
        }

        // Apply template with offset and parameter values
        const result = applyTemplate(template, {
          offsetPosition: { x: 150, y: 150 },
          parameterValues,
        });

        // Show warnings if any
        if (result.warnings.length > 0) {
          result.warnings.forEach((warning) => toast.warning(warning));
        }

        // Add nodes
        result.nodes.forEach((node) => {
          addNode(node);
        });

        // Add edges
        result.edges.forEach((edge) => {
          connectNodes(edge.from, edge.to, edge.meta);
        });

        // Record template usage analytics
        recordUsage({
          templateId: template.id,
          sceneId: currentSceneId,
          worldId: worldId || null,
          nodeCount: result.nodes.length,
          edgeCount: result.edges.length,
        });

        toast.success(
          `Inserted template: ${result.nodes.length} nodes, ${result.edges.length} edges`
        );
      } catch (error) {
        toast.error(`Failed to insert template: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
    [currentScene, currentSceneId, worldId, toast, addNode, connectNodes, recordUsage]
  );

  /** Handle wizard completion */
  const handleWizardComplete = useCallback(
    (nodes: any[], edges: any[]) => {
      if (!currentScene) {
        toast.error('No active scene');
        return;
      }

      try {
        // Add all nodes
        nodes.forEach((node) => {
          addNode(node);
        });

        // Add all edges
        edges.forEach((edge) => {
          connectNodes(edge.from, edge.to, edge.meta);
        });

        toast.success(`Pattern created with ${nodes.length} nodes and ${edges.length} edges`);
      } catch (error) {
        toast.error(`Failed to create pattern: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },
    [currentScene, toast, addNode, connectNodes]
  );

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts (copy / paste / duplicate)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      if (!currentScene) return;

      // Copy (Ctrl+C / Cmd+C)
      if (ctrlOrCmd && e.key === 'c') {
        if (selectedNodeIds.length === 0) return;

        e.preventDefault();
        graphClipboard.copy(selectedNodeIds, currentScene.nodes, currentScene.edges);
        toast.success(`Copied ${selectedNodeIds.length} node(s) to clipboard`);
        return;
      }

      // Paste (Ctrl+V / Cmd+V)
      if (ctrlOrCmd && e.key === 'v') {
        if (!graphClipboard.hasClipboardData()) {
          toast.info('Clipboard is empty');
          return;
        }

        e.preventDefault();
        const pasted = graphClipboard.paste(currentScene.nodes, { x: 50, y: 50 });

        if (pasted) {
          try {
            // Add pasted nodes
            pasted.nodes.forEach((node) => {
              addNode(node);
            });

            // Add pasted edges
            pasted.edges.forEach((edge) => {
              connectNodes(edge.from, edge.to, edge.meta);
            });

            toast.success(`Pasted ${pasted.nodes.length} node(s)`);

            // Select pasted nodes
            setSelectedNodeIds(pasted.nodes.map((n) => n.id));
          } catch (error) {
            toast.error('Failed to paste nodes');
            console.error('[GraphPanel] Paste error:', error);
          }
        }
        return;
      }

      // Duplicate (Ctrl+D / Cmd+D)
      if (ctrlOrCmd && e.key === 'd') {
        if (selectedNodeIds.length === 0) return;

        e.preventDefault();

        // Copy to clipboard
        graphClipboard.copy(selectedNodeIds, currentScene.nodes, currentScene.edges);

        // Immediately paste with small offset
        const pasted = graphClipboard.paste(currentScene.nodes, { x: 20, y: 20 });

        if (pasted) {
          try {
            // Add duplicated nodes
            pasted.nodes.forEach((node) => {
              addNode(node);
            });

            // Add duplicated edges
            pasted.edges.forEach((edge) => {
              connectNodes(edge.from, edge.to, edge.meta);
            });

            toast.success(`Duplicated ${pasted.nodes.length} node(s)`);

            // Select duplicated nodes
            setSelectedNodeIds(pasted.nodes.map((n) => n.id));
          } catch (error) {
            toast.error('Failed to duplicate nodes');
            console.error('[GraphPanel] Duplicate error:', error);
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentScene, selectedNodeIds, addNode, connectNodes, toast, setSelectedNodeIds]);

  // ---------------------------------------------------------------------------
  // Return all handler functions
  // ---------------------------------------------------------------------------

  return {
    handleExportFile,
    handleImportFile,
    handleSaveAsTemplate,
    handleInsertTemplate,
    handleWizardComplete,
  };
}
