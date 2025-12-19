import type { PixSimApiClient } from '../client';
import type { ApiComponents, ApiOperations } from '@pixsim7/shared.types';

export type LogEntryResponse = ApiComponents['schemas']['LogEntryResponse'];
export type LogIngestRequest = ApiComponents['schemas']['LogIngestRequest'];
export type LogIngestResponse = ApiComponents['schemas']['LogIngestResponse'];
export type LogBatchIngestRequest = ApiComponents['schemas']['LogBatchIngestRequest'];

export type LogQueryResponse =
  ApiComponents['schemas']['pixsim7__backend__main__api__v1__logs__LogQueryResponse'];

export type LogQueryParams =
  ApiOperations['query_logs_api_v1_logs_query_get']['parameters']['query'];

export interface ConsoleFieldDefinition {
  name: string;
  color: string;
  clickable: boolean;
  pattern: string;
  description: string;
}

export interface ConsoleFieldsResponse {
  fields: ConsoleFieldDefinition[];
}

export function createLogsApi(client: PixSimApiClient) {
  return {
    async ingestLog(entry: LogIngestRequest): Promise<LogIngestResponse> {
      return client.post<LogIngestResponse>('/logs/ingest', entry);
    },

    async ingestLogBatch(logs: Record<string, unknown>[]): Promise<LogIngestResponse> {
      return client.post<LogIngestResponse>('/logs/ingest/batch', { logs });
    },

    async queryLogs(params?: LogQueryParams): Promise<LogQueryResponse> {
      return client.get<LogQueryResponse>('/logs/query', { params: params as any });
    },

    async getJobTrace(jobId: number): Promise<LogEntryResponse[]> {
      return client.get<LogEntryResponse[]>(`/logs/trace/job/${jobId}`);
    },

    async getRequestTrace(requestId: string): Promise<LogEntryResponse[]> {
      return client.get<LogEntryResponse[]>(`/logs/trace/request/${requestId}`);
    },

    async getConsoleFields(): Promise<ConsoleFieldDefinition[]> {
      const res = await client.get<ConsoleFieldsResponse>('/logs/console-fields');
      return res.fields ?? [];
    },
  };
}

