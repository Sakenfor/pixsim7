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

export interface LoggingSettings {
  sql_logging_enabled: boolean;
  worker_debug_flags: string;
  backend_log_level: string;
}

export interface DatastoreSettings {
  use_local_datastores: boolean;
  local_database_url: string;
  local_redis_url: string;
}

export interface PortsSettings {
  backend: number;
  frontend: number;
  game_frontend: number;
  game_service: number;
  devtools: number;
  admin: number;
  launcher: number;
  generation_api: number;
  postgres: number;
  redis: number;
}

export interface BaseUrlSettings {
  backend: string;
  generation: string;
  frontend: string;
  game_frontend: string;
  devtools: string;
  admin: string;
  launcher: string;
  analysis: string;
}

export interface AdvancedEnvSettings {
  database_url: string;
  redis_url: string;
  secret_key: string;
  cors_origins: string;
  debug: string;
  service_base_urls: string;
  service_timeouts: string;
}

export interface ProfileDefinition {
  label: string;
  ports: Record<string, number>;
  base_urls: Record<string, string>;
  use_local_datastores: boolean;
}

export interface ProfileSettings {
  active: string;
  available: Record<string, ProfileDefinition>;
}

export interface ServiceDefinition {
  key: string;
  title: string;
  program: string;
  args: string[];
  cwd: string;
  url?: string | null;
  health_url?: string | null;
  required_tool?: string | null;
}

export interface LauncherSettings {
  logging: LoggingSettings;
  datastores: DatastoreSettings;
  ports: PortsSettings;
  base_urls: BaseUrlSettings;
  advanced: AdvancedEnvSettings;
  profiles: ProfileSettings;
}

export interface LauncherSettingsUpdate {
  logging?: Partial<LoggingSettings>;
  datastores?: Partial<DatastoreSettings>;
  ports?: Partial<PortsSettings>;
  base_urls?: Partial<BaseUrlSettings>;
  advanced?: Partial<AdvancedEnvSettings>;
  profiles?: { active?: string };
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

export interface CodegenTask {
  id: string;
  description: string;
  script: string;
  supports_check?: boolean;
  groups?: string[];
}

export interface ServicesResponse {
  services: ServiceState[];
  total: number;
}

export interface BuildablesResponse {
  buildables: BuildableDefinition[];
  total: number;
}

export interface CodegenTasksResponse {
  tasks: CodegenTask[];
  total: number;
}

// Logs API types
export type LogLevel = 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG' | 'CRITICAL';

export interface LogsResponse {
  service_key: string;
  lines: string[];
  total_lines: number;
  filtered: boolean;
}

export interface LogFileResponse {
  service_key: string;
  log_file: string | null;
}

// Health API types
export interface APIHealthResponse {
  status: 'healthy' | 'degraded';
  version: string;
  managers: Record<string, boolean>;
  event_bus: Record<string, unknown>;
}

export interface StatisticsResponse {
  services_total: number;
  services_running: number;
  services_healthy: number;
  services_unhealthy: number;
  uptime_seconds: number;
}

// Events API types
export interface EventStatsResponse {
  total_events: number;
  events_by_type: Record<string, number>;
  subscribers: number;
  active_websocket_connections: number;
  [key: string]: unknown;
}
