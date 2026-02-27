import type { ExecuteEphemeralFanoutRequest } from '@lib/api/chains';

import type { GenerateAssetRequest } from './api';
import { prepareGenerateAssetSubmission } from './api';
import {
  executeTrackedRawItemBackendExecution,
  resolveRawItemExecutionModeFromPolicy,
  type ExecuteTrackedRawItemBackendExecutionArgs,
  type ExecuteTrackedRawItemBackendExecutionResult,
} from './rawItemBackendExecution';

export interface TemplateFanoutInputRow {
  id?: string;
  label?: string;
  prompt?: string;
  source_asset_id?: number | null;
  source_asset_ids?: number[] | null;
  extraParams?: Record<string, unknown> | null;
  runContext?: Record<string, unknown> | null;
}

export interface CompileTemplateFanoutRequestArgs {
  templateId: string;
  providerId: string;
  defaultOperation: GenerateAssetRequest['operationType'];
  continueOnError: boolean;
  executionPolicy?: ExecuteEphemeralFanoutRequest['execution_policy'];
  nodeLabel?: string;
  commonExtraParams?: Record<string, unknown>;
  commonRunContext?: Record<string, unknown>;
  inputs: TemplateFanoutInputRow[];
  previousAssetId?: number | null;
  executionMetadata?: Record<string, unknown>;
  runContextItemMetadata?: {
    workflowNodeKind?: string;
    workflowNodeId?: string;
  };
}

export function compileTemplateFanoutRequest(
  args: CompileTemplateFanoutRequestArgs,
): ExecuteEphemeralFanoutRequest {
  const templateId = args.templateId.trim();
  if (!templateId) {
    throw new Error('Template Fanout requires a templateId');
  }

  const commonExtra = args.commonExtraParams && typeof args.commonExtraParams === 'object'
    ? args.commonExtraParams
    : {};
  const commonRunContext = args.commonRunContext && typeof args.commonRunContext === 'object'
    ? args.commonRunContext
    : {};

  const items: ExecuteEphemeralFanoutRequest['items'] = args.inputs.map((row, index) => {
    const perItemExtra = row.extraParams && typeof row.extraParams === 'object' ? row.extraParams : {};
    const perItemRunContext = row.runContext && typeof row.runContext === 'object' ? row.runContext : {};
    const resolvedSourceAssetId =
      row.source_asset_id !== undefined
        ? row.source_asset_id
        : args.previousAssetId ?? (commonExtra.source_asset_id as number | null | undefined);

    const extraParams: Record<string, unknown> = {
      ...commonExtra,
      ...perItemExtra,
      ...(resolvedSourceAssetId != null ? { source_asset_id: resolvedSourceAssetId } : {}),
      ...(Array.isArray(row.source_asset_ids) ? { source_asset_ids: row.source_asset_ids } : {}),
    };

    const runContext: Record<string, unknown> = {
      ...commonRunContext,
      ...perItemRunContext,
      block_template_id: templateId,
      workflow_item_index: index,
    };
    if (args.runContextItemMetadata?.workflowNodeKind) {
      runContext.workflow_node_kind = args.runContextItemMetadata.workflowNodeKind;
    }
    if (args.runContextItemMetadata?.workflowNodeId) {
      runContext.workflow_node_id = args.runContextItemMetadata.workflowNodeId;
    }

    const prepared = prepareGenerateAssetSubmission({
      prompt: (row.prompt ?? '').trim() || ' ',
      providerId: args.providerId,
      operationType: args.defaultOperation,
      extraParams,
      runContext,
    });

    return {
      id: row.id || `item_${index + 1}`,
      label: row.label || `Template item ${index + 1}`,
      params: prepared.generationParams,
      operation: prepared.generationType,
      provider_id: prepared.providerId,
      name: prepared.name,
      priority: prepared.priority,
      force_new: true,
      ...(prepared.preferredAccountId ? { preferred_account_id: prepared.preferredAccountId } : {}),
    };
  });

  return {
    provider_id: args.providerId,
    default_operation: args.defaultOperation,
    continue_on_error: args.continueOnError,
    execution_policy: args.executionPolicy,
    items,
    ...(args.nodeLabel ? { name: args.nodeLabel } : {}),
    execution_metadata: {
      template_fanout: true,
      template_id: templateId,
      compiled_item_count: items.length,
      ...(args.executionMetadata || {}),
    },
  };
}

export async function executeTrackedTemplateFanoutRequest(
  args: Omit<ExecuteTrackedRawItemBackendExecutionArgs, 'executionMode' | 'total'> & {
    request: ExecuteEphemeralFanoutRequest;
  },
): Promise<ExecuteTrackedRawItemBackendExecutionResult> {
  return executeTrackedRawItemBackendExecution({
    ...args,
    total: Array.isArray(args.request.items) ? args.request.items.length : 0,
    executionMode: resolveRawItemExecutionModeFromPolicy(args.request.execution_policy),
  });
}
