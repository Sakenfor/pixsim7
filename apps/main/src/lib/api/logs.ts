/**
 * Logs API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/api-client.
 */
import { pixsimClient } from './client';
import { createLogsApi } from '@pixsim7/api-client/domains';

export type {
  LogEntryResponse,
  LogIngestRequest,
  LogIngestResponse,
  LogBatchIngestRequest,
  LogQueryResponse,
  LogQueryParams,
  ConsoleFieldDefinition,
  ConsoleFieldsResponse,
} from '@pixsim7/api-client/domains';

const logsApi = createLogsApi(pixsimClient);

export const ingestLog = logsApi.ingestLog;
export const ingestLogBatch = logsApi.ingestLogBatch;
export const queryLogs = logsApi.queryLogs;
export const getJobTrace = logsApi.getJobTrace;
export const getRequestTrace = logsApi.getRequestTrace;
export const getConsoleFields = logsApi.getConsoleFields;

