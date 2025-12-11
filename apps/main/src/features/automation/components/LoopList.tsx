import { useState, useEffect, useRef } from 'react';
import { type ExecutionLoop, ExecutionLoopStatus } from '../types';
import { automationService } from '@/lib/automation/automationService';
import { Button, Panel, ConfirmModal, useToast } from '@pixsim7/shared.ui';
import { LoopCard } from './LoopCard';
import { LoopForm } from './LoopForm';
import { useConfirmModal } from '@/hooks/useModal';

type View = 'list' | 'create' | 'edit';

export function LoopList() {
  const [loops, setLoops] = useState<ExecutionLoop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [selectedLoop, setSelectedLoop] = useState<ExecutionLoop | null>(null);
  const [filterStatus, setFilterStatus] = useState<ExecutionLoopStatus | 'ALL'>('ALL');
  const loopsRef = useRef<ExecutionLoop[]>([]);
  const toast = useToast();
  const { confirm, isOpen: confirmOpen, options: confirmOptions, handleConfirm, handleCancel } = useConfirmModal();

  // Keep ref in sync with state
  useEffect(() => {
    loopsRef.current = loops;
  }, [loops]);

  const loadLoops = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await automationService.getLoops();
      setLoops(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load loops');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLoops();

    // Auto-refresh every 10 seconds for active loops
    const interval = setInterval(() => {
      if (loopsRef.current.some(l => l.status === ExecutionLoopStatus.ACTIVE && l.is_enabled)) {
        loadLoops();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const handleCreate = async (data: Partial<ExecutionLoop>) => {
    try {
      await automationService.createLoop(data);
      await loadLoops();
      setView('list');
      toast.success('Loop created successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create loop');
    }
  };

  const handleEdit = async (data: Partial<ExecutionLoop>) => {
    if (!selectedLoop) return;
    try {
      await automationService.updateLoop(selectedLoop.id, data);
      await loadLoops();
      setView('list');
      setSelectedLoop(null);
      toast.success('Loop updated successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update loop');
    }
  };

  const handleDelete = async (loop: ExecutionLoop) => {
    const confirmed = await confirm({
      title: 'Delete Loop',
      message: `Are you sure you want to delete "${loop.name}"?`,
      variant: 'danger',
      confirmText: 'Delete',
    });

    if (!confirmed) return;

    try {
      await automationService.deleteLoop(loop.id);
      await loadLoops();
      toast.success('Loop deleted successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete loop');
    }
  };

  const handleStart = async (loop: ExecutionLoop) => {
    try {
      await automationService.startLoop(loop.id);
      await loadLoops();
      toast.success(`Loop "${loop.name}" started`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start loop');
    }
  };

  const handlePause = async (loop: ExecutionLoop) => {
    try {
      await automationService.pauseLoop(loop.id);
      await loadLoops();
      toast.success(`Loop "${loop.name}" paused`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to pause loop');
    }
  };

  const handleRunNow = async (loop: ExecutionLoop) => {
    try {
      await automationService.runLoopNow(loop.id);
      toast.success(`Loop "${loop.name}" execution triggered!`);
      // Refresh after a delay to show the new execution
      setTimeout(loadLoops, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to run loop');
    }
  };

  const filteredLoops = filterStatus === 'ALL'
    ? loops
    : loops.filter(l => l.status === filterStatus);

  const statusCounts = {
    total: loops.length,
    active: loops.filter(l => l.status === ExecutionLoopStatus.ACTIVE).length,
    paused: loops.filter(l => l.status === ExecutionLoopStatus.PAUSED).length,
    completed: loops.filter(l => l.status === ExecutionLoopStatus.COMPLETED).length,
  };

  if (view === 'create') {
    return (
      <div className="space-y-6">
        <LoopForm
          onSave={handleCreate}
          onCancel={() => setView('list')}
        />
      </div>
    );
  }

  if (view === 'edit' && selectedLoop) {
    return (
      <div className="space-y-6">
        <LoopForm
          loop={selectedLoop}
          onSave={handleEdit}
          onCancel={() => {
            setView('list');
            setSelectedLoop(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Automation Loops
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Recurring automation with smart account selection
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setView('create')}
        >
          ➕ Create Loop
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <Panel className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </Panel>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {statusCounts.total}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-green-600">
            {statusCounts.active}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Active</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-600">
            {statusCounts.paused}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Paused</div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-blue-600">
            {statusCounts.completed}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Completed</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">Filter:</span>
        <div className="flex gap-2">
          {(['ALL', 'ACTIVE', 'PAUSED', 'COMPLETED'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {loading && loops.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading loops...</p>
          </div>
        </div>
      ) : filteredLoops.length === 0 ? (
        <Panel className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">
            {loops.length === 0
              ? 'No automation loops yet. Click "Create Loop" to get started.'
              : 'No loops match the selected filter.'}
          </p>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLoops.map((loop) => (
            <LoopCard
              key={loop.id}
              loop={loop}
              onEdit={(l) => {
                setSelectedLoop(l);
                setView('edit');
              }}
              onDelete={handleDelete}
              onStart={handleStart}
              onPause={handlePause}
              onRunNow={handleRunNow}
            />
          ))}
        </div>
      )}

      {/* Confirm modal */}
      <ConfirmModal
        isOpen={confirmOpen}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        {...confirmOptions}
      />
    </div>
  );
}
