export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'failed';
export type HealthStatus = 'stopped' | 'starting' | 'healthy' | 'unhealthy' | 'unknown';

export interface ServiceState {
  key: string;
  title: string;
  status: ServiceStatus;
  health: HealthStatus;
  pid?: number | null;
  last_error?: string;
  tool_available?: boolean;
  tool_check_message?: string;
}

export interface BuildableDefinition {
  id: string;
  title: string;
  package: string;
  directory: string;
  description?: string | null;
  command: string;
  args: string[];
  category?: string | null;
  tags?: string[];
}

export interface SharedSettings {
  sql_logging_enabled: boolean;
  worker_debug_flags: string;
  backend_log_level: string;
  use_local_datastores: boolean;
}

export interface ServicesResponse {
  services: ServiceState[];
  total: number;
}

export interface BuildablesResponse {
  buildables: BuildableDefinition[];
  total: number;
}
