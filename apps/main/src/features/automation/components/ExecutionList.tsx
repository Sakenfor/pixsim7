import { useState, useEffect, useRef } from 'react';
import { type AutomationExecution, type AutomationStatus } from '../types';
import { automationService } from '../lib/core';
import { Button, Panel, ConfirmModal } from '@pixsim7/shared.ui';
import { ExecutionCard } from './ExecutionCard';

export function ExecutionList() {
  const [executions, setExecutions] = useState<AutomationExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<AutomationStatus | 'ALL'>('ALL');
  const [selectedExecution, setSelectedExecution] = useState<AutomationExecution | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState<{ status?: AutomationStatus; message: string } | null>(null);

  const executionsRef = useRef<AutomationExecution[]>([]);
  const loadingRef = useRef(false);

  useEffect(() => {
    executionsRef.current = executions;
  }, [executions]);

  const loadExecutions = async () => {
    if (loadingRef.current) return;

    try {
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      const statusParam = filterStatus === 'ALL' ? undefined : filterStatus;
      const data = await automationService.getExecutions(100, statusParam);
      setExecutions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load executions');
      console.error('Error loading executions:', err);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    loadExecutions();

    // Auto-refresh every 5 seconds for running executions
    const interval = setInterval(() => {
      if (executionsRef.current.some(e =>
        e.status === 'running' || e.status === 'pending'
      )) {
        loadExecutions();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const filteredExecutions = filterStatus === 'ALL'
    ? executions
    : executions.filter(e => e.status === filterStatus);

  const statusCounts = {
    total: executions.length,
    pending: executions.filter(e => e.status === 'pending').length,
    running: executions.filter(e => e.status === 'running').length,
    completed: executions.filter(e => e.status === 'completed').length,
    failed: executions.filter(e => e.status === 'failed').length,
    cancelled: executions.filter(e => e.status === 'cancelled').length,
  };

  const filterOptions: Array<{ label: string; value: AutomationStatus | 'ALL' }> = [
    { label: 'ALL', value: 'ALL' },
    { label: 'PENDING', value: 'pending' },
    { label: 'RUNNING', value: 'running' },
    { label: 'COMPLETED', value: 'completed' },
    { label: 'FAILED', value: 'failed' },
    { label: 'CANCELLED', value: 'cancelled' },
  ];

  const handleViewDetails = (execution: AutomationExecution) => {
    setSelectedExecution(execution);
  };

  const closeDetails = () => {
    setSelectedExecution(null);
  };

  const handleClearExecutions = (status?: AutomationStatus) => {
    const statusText = status || 'completed and failed';
    setClearConfirm({
      status,
      message: `Are you sure you want to clear all ${statusText} executions? This cannot be undone.`,
    });
  };

  const confirmClearExecutions = async () => {
    if (!clearConfirm) return;

    const status = clearConfirm.status;
    setClearConfirm(null);

    try {
      setClearing(true);
      const result = await automationService.clearExecutions(status);
      // Could use toast here instead of alert
      console.log(`Successfully cleared ${result.deleted} executions (${result.filter})`);
      await loadExecutions(); // Reload the list
    } catch (err) {
      console.error('Error clearing executions:', err);
    } finally {
      setClearing(false);
    }
  };

  if (loading && executions.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading executions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Execution Monitor
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Track automation execution progress and history
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={loadExecutions}
            disabled={loading}
          >
            {loading ? '⟳ Refreshing...' : '🔄 Refresh'}
          </Button>

          <div className="relative group">
            <Button
              variant="danger"
              disabled={clearing || statusCounts.completed + statusCounts.failed === 0}
            >
              {clearing ? '⟳ Clearing...' : '🗑️ Clear'}
            </Button>

            {/* Dropdown menu */}
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={() => handleClearExecutions()}
                disabled={clearing}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg text-sm"
              >
                Clear Completed & Failed ({statusCounts.completed + statusCounts.failed})
              </button>
              <button
                onClick={() => handleClearExecutions('completed')}
                disabled={clearing || statusCounts.completed === 0}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
              >
                Clear Completed Only ({statusCounts.completed})
              </button>
              <button
                onClick={() => handleClearExecutions('failed')}
                disabled={clearing || statusCounts.failed === 0}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg text-sm"
              >
                Clear Failed Only ({statusCounts.failed})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <Panel className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </Panel>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {statusCounts.total}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-600">
            {statusCounts.pending}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Pending</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-blue-600">
            {statusCounts.running}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Running</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-green-600">
            {statusCounts.completed}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Completed</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-red-600">
            {statusCounts.failed}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Failed</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-600">
            {statusCounts.cancelled}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Cancelled</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-600 dark:text-gray-400">Filter:</span>
        <div className="flex gap-2 flex-wrap">
          {filterOptions.map((option) => (
            <button
              key={option.label}
              onClick={() => setFilterStatus(option.value)}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                filterStatus === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Execution List */}
      {filteredExecutions.length === 0 ? (
        <Panel className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">
            {executions.length === 0
              ? 'No executions yet. Run a preset or automation loop to see executions here.'
              : 'No executions match the selected filter.'}
          </p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredExecutions.map((execution) => (
            <ExecutionCard
              key={execution.id}
              execution={execution}
              onViewDetails={handleViewDetails}
            />
          ))}
        </div>
      )}

      {/* Details Modal/Sidebar */}
      {selectedExecution && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Panel className="max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Execution Details #{selectedExecution.id}
              </h3>
              <button
                onClick={closeDetails}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Status</h4>
                <p className="text-gray-700 dark:text-gray-300">{selectedExecution.status}</p>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Details</h4>
                <div className="text-sm space-y-1">
                  <p className="text-gray-700 dark:text-gray-300">
                    <span className="font-medium">Preset ID:</span> {selectedExecution.preset_id}
                  </p>
                  {selectedExecution.account_id && (
                    <p className="text-gray-700 dark:text-gray-300">
                      <span className="font-medium">Account ID:</span> {selectedExecution.account_id}
                    </p>
                  )}
                  {selectedExecution.device_id && (
                    <p className="text-gray-700 dark:text-gray-300">
                      <span className="font-medium">Device ID:</span> {selectedExecution.device_id}
                    </p>
                  )}
                  {selectedExecution.loop_id && (
                    <p className="text-gray-700 dark:text-gray-300">
                      <span className="font-medium">Loop ID:</span> {selectedExecution.loop_id}
                    </p>
                  )}
                  {selectedExecution.task_id && (
                    <p className="text-gray-700 dark:text-gray-300">
                      <span className="font-medium">Task ID:</span> {selectedExecution.task_id}
                    </p>
                  )}
                </div>
              </div>

              {selectedExecution.error_details && (
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Error Details</h4>
                  <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto">
                    {JSON.stringify(selectedExecution.error_details, null, 2)}
                  </pre>
                </div>
              )}

              {selectedExecution.execution_context && Object.keys(selectedExecution.execution_context).length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Execution Context</h4>
                  <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto">
                    {JSON.stringify(selectedExecution.execution_context, null, 2)}
                  </pre>
                </div>
              )}

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="secondary" onClick={closeDetails} className="w-full">
                  Close
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* Clear executions confirmation */}
      <ConfirmModal
        isOpen={!!clearConfirm}
        title="Clear Executions"
        message={clearConfirm?.message || ''}
        confirmText="Clear"
        onConfirm={confirmClearExecutions}
        onCancel={() => setClearConfirm(null)}
        variant="danger"
      />
    </div>
  );
}
