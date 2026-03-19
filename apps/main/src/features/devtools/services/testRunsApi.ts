import { pixsimClient } from '@lib/api/client';

export interface TestRunRecord {
  id: string;
  suite_id: string;
  status: 'pass' | 'fail' | 'error';
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  summary: {
    total?: number;
    passed?: number;
    failed?: number;
    metrics?: Record<string, number>;
    failures?: Array<{ test: string; reason: string }>;
    [key: string]: unknown;
  };
  environment: Record<string, unknown> | null;
  created_at: string;
}

interface RunListResponse {
  total: number;
  runs: TestRunRecord[];
}

export async function fetchTestRuns(options?: {
  suite_id?: string;
  status?: string;
  limit?: number;
}): Promise<TestRunRecord[]> {
  const params: Record<string, string> = {};
  if (options?.suite_id) params.suite_id = options.suite_id;
  if (options?.status) params.status = options.status;
  if (options?.limit) params.limit = String(options.limit);

  const response = await pixsimClient.get<RunListResponse>('/dev/testing/runs', { params });
  return response.runs;
}

export async function fetchTestRun(runId: string): Promise<TestRunRecord> {
  return pixsimClient.get<TestRunRecord>(`/dev/testing/runs/${runId}`);
}

export interface CatalogSuiteRecord {
  id: string;
  label: string;
  path: string;
  layer: 'backend' | 'frontend' | 'scripts';
  kind: string | null;
  category: string | null;
  subcategory: string | null;
  covers: string[];
  order: number | null;
}

interface CatalogResponse {
  suite_count: number;
  suites: CatalogSuiteRecord[];
}

export async function fetchTestCatalog(): Promise<CatalogSuiteRecord[]> {
  const response = await pixsimClient.get<CatalogResponse>('/dev/testing/catalog');
  return response.suites;
}
