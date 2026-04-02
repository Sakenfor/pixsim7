import type { PixSimApiClient } from '../client';
import type {
  ConsoleFieldDefinitionResponse,
  ConsoleFieldsResponse,
  LogBatchIngestRequest,
  LogEntryResponse as ApiLogEntryResponse,
  LogIngestRequest,
  LogIngestResponse,
  Pixsim7BackendMainApiV1LogsLogQueryResponse,
  QueryLogsApiV1LogsQueryGetParams as ApiLogQueryParams,
} from '@pixsim7/shared.api.model';
export type {
  ConsoleFieldsResponse,
  LogBatchIngestRequest,
  LogIngestRequest,
  LogIngestResponse,
};

export type LogQueryResponse = Pixsim7BackendMainApiV1LogsLogQueryResponse;
export type LogQueryParams = ApiLogQueryParams & {
  trace_id?: string;
};
export type LogEntryResponse = ApiLogEntryResponse & {
  trace_id?: string | null;
};
export type ConsoleFieldDefinition = ConsoleFieldDefinitionResponse;

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

    async getTraceIdTrace(traceId: string): Promise<LogEntryResponse[]> {
      return client.get<LogEntryResponse[]>(`/logs/trace/trace/${traceId}`);
    },

    async getConsoleFields(): Promise<ConsoleFieldDefinition[]> {
      const res = await client.get<ConsoleFieldsResponse>('/logs/console-fields');
      return [...(res.fields ?? [])];
    },
  };
}
