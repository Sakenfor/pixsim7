// Automation-related types

export enum DeviceType {
  BLUESTACKS = 'BLUESTACKS',
  ADB = 'ADB',
}

export enum DeviceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  BUSY = 'BUSY',
  ERROR = 'ERROR',
}

export interface AndroidDevice {
  id: number;
  adb_id: string;
  device_type: DeviceType;
  status: DeviceStatus;
  device_serial?: string;
  instance_name?: string;
  instance_port?: number;
  assigned_account_id?: number;
  primary_device_id?: number;
  created_at: string;
  updated_at: string;
  last_seen_at?: string;
}

export enum AutomationStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum ActionType {
  // Basic actions
  WAIT = 'wait',
  LAUNCH_APP = 'launch_app',
  EXIT_APP = 'exit_app',
  CLICK_COORDS = 'click_coords',
  TYPE_TEXT = 'type_text',
  PRESS_BACK = 'press_back',
  PRESS_HOME = 'press_home',
  SWIPE = 'swipe',
  SCREENSHOT = 'screenshot',

  // Element-based actions
  WAIT_FOR_ELEMENT = 'wait_for_element',
  CLICK_ELEMENT = 'click_element',

  // Conditional actions
  IF_ELEMENT_EXISTS = 'if_element_exists',
  IF_ELEMENT_NOT_EXISTS = 'if_element_not_exists',

  // Control flow
  REPEAT = 'repeat',
}

export interface ActionDefinition {
  type: ActionType;
  params: Record<string, any>;
}

export interface AppActionPreset {
  id: number;
  name: string;
  description?: string;
  category?: string;
  actions: ActionDefinition[];
  owner_id: number;
  is_shared: boolean;
  is_system: boolean;
  usage_count: number;
  last_used?: string;
  created_at: string;
  updated_at: string;
  cloned_from_id?: number;
}

export interface AutomationExecution {
  id: number;
  user_id: number;
  preset_id: number;
  account_id?: number;
  device_id?: number;
  loop_id?: number;
  status: AutomationStatus;
  current_action_index?: number;
  total_actions?: number;
  error_message?: string;
  error_action_index?: number;
  error_details?: Record<string, any>;
  execution_context?: Record<string, any>;
  retry_count: number;
  max_retries: number;
  task_id?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export enum ExecutionLoopStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
}

export enum PresetExecutionMode {
  SINGLE = 'SINGLE',
  SHARED_LIST = 'SHARED_LIST',
  PER_ACCOUNT = 'PER_ACCOUNT',
}

export enum AccountSelectionMode {
  MOST_CREDITS = 'MOST_CREDITS',
  LEAST_CREDITS = 'LEAST_CREDITS',
  ROUND_ROBIN = 'ROUND_ROBIN',
  SPECIFIC_ACCOUNTS = 'SPECIFIC_ACCOUNTS',
}

export interface ExecutionLoop {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  preset_id?: number;
  preset_execution_mode: PresetExecutionMode;
  selection_mode: AccountSelectionMode;
  status: ExecutionLoopStatus;
  is_enabled: boolean;
  delay_between_executions: number;
  max_executions_per_day?: number;
  max_consecutive_failures: number;
  consecutive_failures: number;
  min_credits?: number;
  max_credits?: number;
  require_online_device: boolean;
  preferred_device_id?: number;
  skip_accounts_already_ran_today: boolean;
  skip_google_jwt_accounts: boolean;
  last_execution_at?: string;
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  executions_today: number;
  last_reset_date?: string;
  created_at: string;
  updated_at: string;
  // Mode-specific data
  shared_preset_ids?: number[];
  account_preset_config?: Record<string, number[]>;
  default_preset_ids?: number[];
  account_ids?: number[];
  current_preset_index?: number;
  account_execution_state?: Record<string, any>;
}

export interface DeviceScanResult {
  scanned: number;
  added: number;
  updated: number;
  offline: number;
}
