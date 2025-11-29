import { useState } from 'react';
import {
  type ExecutionLoop,
  ExecutionLoopStatus,
  PresetExecutionMode,
  AccountSelectionMode,
} from '@/types/automation';
import { Button, Panel, useToast } from '@pixsim7/shared.ui';

interface LoopFormProps {
  loop?: ExecutionLoop;
  onSave: (data: Partial<ExecutionLoop>) => void;
  onCancel: () => void;
}

export function LoopForm({ loop, onSave, onCancel }: LoopFormProps) {
  const [name, setName] = useState(loop?.name ?? '');
  const [description, setDescription] = useState(loop?.description ?? '');
  const [presetExecutionMode, setPresetExecutionMode] = useState<PresetExecutionMode>(
    loop?.preset_execution_mode ?? PresetExecutionMode.SINGLE
  );
  const [selectionMode, setSelectionMode] = useState<AccountSelectionMode>(
    loop?.selection_mode ?? AccountSelectionMode.ROUND_ROBIN
  );
  const [delayBetweenExecutions, setDelayBetweenExecutions] = useState(
    loop?.delay_between_executions ?? 60
  );
  const [maxExecutionsPerDay, setMaxExecutionsPerDay] = useState<number | undefined>(
    loop?.max_executions_per_day
  );
  const [maxConsecutiveFailures, setMaxConsecutiveFailures] = useState(
    loop?.max_consecutive_failures ?? 5
  );
  const [minCredits, setMinCredits] = useState<number | undefined>(loop?.min_credits);
  const [maxCredits, setMaxCredits] = useState<number | undefined>(loop?.max_credits);
  const [requireOnlineDevice, setRequireOnlineDevice] = useState(
    loop?.require_online_device ?? true
  );
  const [skipAccountsAlreadyRanToday, setSkipAccountsAlreadyRanToday] = useState(
    loop?.skip_accounts_already_ran_today ?? false
  );
  const [skipGoogleJwtAccounts, setSkipGoogleJwtAccounts] = useState(
    loop?.skip_google_jwt_accounts ?? false
  );
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter a loop name');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        preset_execution_mode: presetExecutionMode,
        selection_mode: selectionMode,
        status: loop?.status ?? ExecutionLoopStatus.PAUSED,
        is_enabled: loop?.is_enabled ?? true,
        delay_between_executions: delayBetweenExecutions,
        max_executions_per_day: maxExecutionsPerDay,
        max_consecutive_failures: maxConsecutiveFailures,
        min_credits: minCredits,
        max_credits: maxCredits,
        require_online_device: requireOnlineDevice,
        skip_accounts_already_ran_today: skipAccountsAlreadyRanToday,
        skip_google_jwt_accounts: skipGoogleJwtAccounts,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <Panel>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {loop ? 'Edit Loop' : 'Create New Loop'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Automation Loop"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this loop do?"
              rows={3}
              className={inputClass}
            />
          </div>
        </div>
      </Panel>

      {/* Execution Configuration */}
      <Panel>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Execution Configuration
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Preset Execution Mode *
            </label>
            <select
              value={presetExecutionMode}
              onChange={(e) => setPresetExecutionMode(e.target.value as PresetExecutionMode)}
              className={inputClass}
            >
              <option value={PresetExecutionMode.SINGLE}>Single - Always run one preset</option>
              <option value={PresetExecutionMode.SHARED_LIST}>Shared List - Cycle through preset list</option>
              <option value={PresetExecutionMode.PER_ACCOUNT}>Per Account - Different presets per account</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {presetExecutionMode === PresetExecutionMode.SINGLE && 'Run the same preset for all accounts'}
              {presetExecutionMode === PresetExecutionMode.SHARED_LIST && 'Cycle through a list of presets for all accounts'}
              {presetExecutionMode === PresetExecutionMode.PER_ACCOUNT && 'Configure different preset lists for each account'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Account Selection Mode *
            </label>
            <select
              value={selectionMode}
              onChange={(e) => setSelectionMode(e.target.value as AccountSelectionMode)}
              className={inputClass}
            >
              <option value={AccountSelectionMode.MOST_CREDITS}>Most Credits - Select account with highest credits</option>
              <option value={AccountSelectionMode.LEAST_CREDITS}>Least Credits - Select account with lowest credits</option>
              <option value={AccountSelectionMode.ROUND_ROBIN}>Round Robin - Cycle through accounts by ID</option>
              <option value={AccountSelectionMode.SPECIFIC_ACCOUNTS}>Specific Accounts - Choose from predefined list</option>
            </select>
          </div>
        </div>
      </Panel>

      {/* Scheduling & Safety */}
      <Panel>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Scheduling & Safety
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Delay Between Executions (seconds) *
              </label>
              <input
                type="number"
                value={delayBetweenExecutions}
                onChange={(e) => setDelayBetweenExecutions(parseInt(e.target.value))}
                min="0"
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Executions Per Day
              </label>
              <input
                type="number"
                value={maxExecutionsPerDay ?? ''}
                onChange={(e) => setMaxExecutionsPerDay(e.target.value ? parseInt(e.target.value) : undefined)}
                min="0"
                placeholder="Unlimited"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Max Consecutive Failures *
            </label>
            <input
              type="number"
              value={maxConsecutiveFailures}
              onChange={(e) => setMaxConsecutiveFailures(parseInt(e.target.value))}
              min="1"
              required
              className={inputClass}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Loop will stop if this many failures occur in a row
            </p>
          </div>
        </div>
      </Panel>

      {/* Account Filtering */}
      <Panel>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Account Filtering
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Min Credits
              </label>
              <input
                type="number"
                value={minCredits ?? ''}
                onChange={(e) => setMinCredits(e.target.value ? parseInt(e.target.value) : undefined)}
                min="0"
                placeholder="No minimum"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Credits
              </label>
              <input
                type="number"
                value={maxCredits ?? ''}
                onChange={(e) => setMaxCredits(e.target.value ? parseInt(e.target.value) : undefined)}
                min="0"
                placeholder="No maximum"
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requireOnlineDevice}
                onChange={(e) => setRequireOnlineDevice(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Require Online Device
              </span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={skipAccountsAlreadyRanToday}
                onChange={(e) => setSkipAccountsAlreadyRanToday(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Skip Accounts Already Ran Today
              </span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={skipGoogleJwtAccounts}
                onChange={(e) => setSkipGoogleJwtAccounts(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Skip Google JWT Accounts
              </span>
            </label>
          </div>
        </div>
      </Panel>

      {/* Form Actions */}
      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={saving}
          disabled={saving}
        >
          {loop ? 'Save Changes' : 'Create Loop'}
        </Button>
      </div>
    </form>
  );
}
