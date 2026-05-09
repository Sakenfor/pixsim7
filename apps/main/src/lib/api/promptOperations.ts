/**
 * Prompt Operations API client (op-runtime executor).
 *
 * Wraps `POST /api/v1/prompts/operations/execute`. Phase 2 of
 * plan:op-runtime-span-popover.
 */
import { pixsimClient } from './client';

export interface OpExecuteRequest {
  op_id: string;
  signature_id?: string;
  /** User's chosen param values (key → value). */
  params: Record<string, unknown>;
  /** Ref bindings (key → bound id/name). Phase 2 MVP only passes through. */
  refs?: Record<string, string>;
  /** 'image' | 'video' — used for signature.allowed_modalities check. */
  modality?: string;
}

export interface OpExecuteOverlayEntry {
  block_id: string;
  text: string;
  role: string | null;
  category: string | null;
  source_op: string;
  op_params: Record<string, unknown>;
  op_refs: Record<string, string>;
  signature_id: string | null;
}

export interface OpExecuteResponse {
  prompt_text: string;
  block_id: string;
  block_overlay: OpExecuteOverlayEntry;
  /** True when every supplied param landed on a constrained variant tag. */
  matched_exactly: boolean;
  warnings: string[];
}

export function executePromptOperation(
  request: OpExecuteRequest,
): Promise<OpExecuteResponse> {
  return pixsimClient.post<OpExecuteResponse>(
    '/prompts/operations/execute',
    request,
  );
}
