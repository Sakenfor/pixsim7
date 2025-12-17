/**
 * Logs API Client
 * Uses OpenAPI-generated types for type safety and contract alignment.
 *
 * Endpoints:
 *   - POST /logs/ingest       - Ingest single log entry
 *   - POST /logs/ingest/batch - Ingest batch of log entries
 *   - GET  /logs/query        - Query logs with filters
 *   - GET  /logs/console-fields - Get console field metadata
 *   - GET  /logs/trace/job/{job_id} - Get job trace
 *   - GET  /logs/trace/request/{request_id} - Get request trace
 */

import { apiClient } from './client';
import type { ApiComponents, ApiOperations } from '@pixsim7/shared.types';

// ============================================================================
// OpenAPI-Derived Types (Generated from backend contract)
// ============================================================================

/** Log entry response from queries */
export type LogEntryResponse = ApiComponents['schemas']['LogEntryResponse'];

/** Log ingestion request */
export type LogIngestRequest = ApiComponents['schemas']['LogIngestRequest'];

/** Log ingestion response */
export type LogIngestResponse = ApiComponents['schemas']['LogIngestResponse'];

/** Batch log ingestion request */
export type LogBatchIngestRequest = ApiComponents['schemas']['LogBatchIngestRequest'];

/** Log query response (paginated) */
export type LogQueryResponse =
  ApiComponents['schemas']['pixsim7__backend__main__api__v1__logs__LogQueryResponse'];

/** Log query parameters */
export type LogQueryParams =
  ApiOperations['query_logs_api_v1_logs_query_get']['parameters']['query'];

// ============================================================================
// Local Types (Not yet in OpenAPI contract)
// ============================================================================

/**
 * Console field definition for clickable log rendering.
 *
 * Note: This type is defined locally because the backend endpoint
 * returns `unknown` in the OpenAPI schema. Once the backend properly
 * types this response, this should be replaced with an OpenAPI type.
 */
export interface ConsoleFieldDefinition {
  /** Field identifier (e.g., "job_id") */
  name: string;
  /** Hex color code for rendering */
  color: string;
  /** Whether field should be clickable */
  clickable: boolean;
  /** Regex pattern to extract field value from logs */
  pattern: string;
  /** Human-readable field description */
  description: string;
}

/** Console fields response */
export interface ConsoleFieldsResponse {
  fields: ConsoleFieldDefinition[];
}

// ============================================================================
// API Functions - Log Ingestion
// ============================================================================

/**
 * Ingest a single log entry.
 *
 * @param entry - Log entry to ingest
 * @returns Ingestion response with log_id
 */
export async function ingestLog(entry: LogIngestRequest): Promise<LogIngestResponse> {
  const res = await apiClient.post<LogIngestResponse>('/logs/ingest', entry);
  return res.data;
}

/**
 * Ingest multiple log entries in a batch.
 * More efficient than individual ingestion for bulk operations.
 *
 * @param logs - Array of log entries to ingest
 * @returns Ingestion response with count
 */
export async function ingestLogBatch(
  logs: Record<string, unknown>[]
): Promise<LogIngestResponse> {
  const res = await apiClient.post<LogIngestResponse>('/logs/ingest/batch', { logs });
  return res.data;
}

// ============================================================================
// API Functions - Log Queries
// ============================================================================

/**
 * Query structured logs with filters.
 *
 * Supports filtering by service, level, job_id, request_id, stage,
 * provider_id, time range, and text search.
 *
 * @param params - Query parameters
 * @returns Paginated log query response
 */
export async function queryLogs(params?: LogQueryParams): Promise<LogQueryResponse> {
  const res = await apiClient.get<LogQueryResponse>('/logs/query', { params });
  return res.data;
}

/**
 * Get complete log trace for a job.
 * Returns all logs related to a job, ordered chronologically.
 *
 * @param jobId - Job ID to trace
 * @returns Array of log entries for the job
 */
export async function getJobTrace(jobId: number): Promise<LogEntryResponse[]> {
  const res = await apiClient.get<LogEntryResponse[]>(`/logs/trace/job/${jobId}`);
  return res.data;
}

/**
 * Get complete log trace for a request.
 * Returns all logs related to a request ID, ordered chronologically.
 *
 * @param requestId - Request ID to trace
 * @returns Array of log entries for the request
 */
export async function getRequestTrace(requestId: string): Promise<LogEntryResponse[]> {
  const res = await apiClient.get<LogEntryResponse[]>(`/logs/trace/request/${requestId}`);
  return res.data;
}

// ============================================================================
// API Functions - Console Fields
// ============================================================================

/**
 * Get console field metadata for clickable log rendering.
 *
 * Returns field definitions including name, color, clickable state,
 * regex pattern, and description. Used by console/log viewers to
 * render clickable badges.
 *
 * @returns Array of console field definitions
 */
export async function getConsoleFields(): Promise<ConsoleFieldDefinition[]> {
  const res = await apiClient.get<ConsoleFieldsResponse>('/logs/console-fields');
  return res.data.fields ?? [];
}
