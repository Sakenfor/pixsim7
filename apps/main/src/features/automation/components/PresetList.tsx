import { useState, useEffect } from 'react';
import { type AppActionPreset } from '../types';
import { automationService } from '@features/automation/lib/core/automationService';
import { getAccounts } from '@features/providers';
import { Button, Panel, ConfirmModal, Modal, Select, useToast } from '@pixsim7/shared.ui';
import { PresetCard } from './PresetCard';
import { PresetForm } from './PresetForm';
import { useConfirmModal } from '@/hooks/useModal';

type View = 'list' | 'create' | 'edit';

export function PresetList() {
  const [presets, setPresets] = useState<AppActionPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [selectedPreset, setSelectedPreset] = useState<AppActionPreset | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [selectedPresetToRun, setSelectedPresetToRun] = useState<AppActionPreset | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [executing, setExecuting] = useState(false);
  const toast = useToast();
  const { confirm, isOpen: confirmOpen, options: confirmOptions, handleConfirm, handleCancel } = useConfirmModal();

  const loadPresets = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await automationService.getPresets();
      setPresets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presets');
      console.error('Error loading presets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPresets();
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await getAccounts();
      setAccounts(data.filter((acc: any) => acc.provider_id === 'pixverse'));
    } catch (err) {
      console.error('Error loading accounts:', err);
    }
  };

  const handleCreate = async (data: Partial<AppActionPreset>) => {
    try {
      await automationService.createPreset(data);
      await loadPresets();
      setView('list');
      toast.success('Preset created successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create preset');
    }
  };

  const handleEdit = async (data: Partial<AppActionPreset>) => {
    if (!selectedPreset) return;
    try {
      const updated = await automationService.updatePreset(selectedPreset.id, data);
      await loadPresets();
      // Update selectedPreset with new data so we stay on edit view with fresh data
      setSelectedPreset(updated);
      toast.success('Preset saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update preset');
    }
  };

  const handleDelete = async (preset: AppActionPreset) => {
    const confirmed = await confirm({
      title: 'Delete Preset',
      message: `Are you sure you want to delete "${preset.name}"?`,
      variant: 'danger',
      confirmText: 'Delete',
    });

    if (!confirmed) return;

    try {
      await automationService.deletePreset(preset.id);
      await loadPresets();
      toast.success('Preset deleted successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete preset');
    }
  };

  const handleCopy = async (preset: AppActionPreset) => {
    try {
      const newPreset = await automationService.copyPreset(preset.id);
      await loadPresets();
      toast.success(`Preset copied successfully as "${newPreset.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to copy preset');
    }
  };

  const handleRun = (preset: AppActionPreset) => {
    setSelectedPresetToRun(preset);
    setSelectedAccountId(null);
    setShowAccountModal(true);
  };

  const handleExecutePreset = async () => {
    if (!selectedPresetToRun || !selectedAccountId) {
      toast.error('Please select an account');
      return;
    }

    try {
      setExecuting(true);
      const result = await automationService.executePreset(selectedPresetToRun.id, selectedAccountId);
      toast.success(`Preset queued for execution!\n\nExecution ID: ${result.execution_id}`);
      setShowAccountModal(false);
      setSelectedPresetToRun(null);
      setSelectedAccountId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to execute preset');
    } finally {
      setExecuting(false);
    }
  };

  // Get unique categories
  const categories = ['ALL', ...new Set(presets.map(p => p.category).filter(Boolean) as string[])];

  // Filter presets
  const filteredPresets = presets.filter(preset => {
    const matchesSearch = !searchQuery ||
      preset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      preset.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = filterCategory === 'ALL' || preset.category === filterCategory;

    return matchesSearch && matchesCategory;
  });

  // Group presets
  const systemPresets = filteredPresets.filter(p => p.is_system);
  const sharedPresets = filteredPresets.filter(p => !p.is_system && p.is_shared);
  const myPresets = filteredPresets.filter(p => !p.is_system && !p.is_shared);

  if (view === 'create') {
    return (
      <div className="space-y-6">
        <PresetForm
          onSave={handleCreate}
          onCancel={() => setView('list')}
        />
      </div>
    );
  }

  if (view === 'edit' && selectedPreset) {
    return (
      <div className="space-y-6">
        <PresetForm
          preset={selectedPreset}
          onSave={handleEdit}
          onCancel={() => {
            setView('list');
            setSelectedPreset(null);
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
            Action Presets
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Reusable automation sequences
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setView('create')}
        >
          ➕ Create Preset
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <Panel className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </Panel>
      )}

      {/* Search and Filter */}
      <Panel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search presets..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
      </Panel>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading presets...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* System Presets */}
          {systemPresets.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                System Presets
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {systemPresets.map(preset => (
                  <PresetCard
                    key={preset.id}
                    preset={preset}
                    onRun={handleRun}
                    onCopy={handleCopy}
                    onEdit={(p) => {
                      setSelectedPreset(p);
                      setView('edit');
                    }}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Shared Presets */}
          {sharedPresets.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Shared Presets
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sharedPresets.map(preset => (
                  <PresetCard
                    key={preset.id}
                    preset={preset}
                    onRun={handleRun}
                    onCopy={handleCopy}
                    onEdit={(p) => {
                      setSelectedPreset(p);
                      setView('edit');
                    }}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}

          {/* My Presets */}
          {myPresets.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                My Presets
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myPresets.map(preset => (
                  <PresetCard
                    key={preset.id}
                    preset={preset}
                    onRun={handleRun}
                    onCopy={handleCopy}
                    onEdit={(p) => {
                      setSelectedPreset(p);
                      setView('edit');
                    }}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {filteredPresets.length === 0 && (
            <Panel className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">
                {searchQuery || filterCategory !== 'ALL'
                  ? 'No presets match your search criteria.'
                  : 'No presets yet. Click "Create Preset" to get started.'}
              </p>
            </Panel>
          )}
        </div>
      )}

      {/* Confirm modal */}
      <ConfirmModal
        isOpen={confirmOpen}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        {...confirmOptions}
      />

      {/* Account Selection Modal */}
      <Modal
        isOpen={showAccountModal}
        onClose={() => {
          setShowAccountModal(false);
          setSelectedPresetToRun(null);
          setSelectedAccountId(null);
        }}
        title={`Execute Preset: ${selectedPresetToRun?.name || ''}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Select an account to run this preset with:
          </p>

          <Select
            value={selectedAccountId?.toString() || ''}
            onChange={(e) => setSelectedAccountId(e.target.value ? Number(e.target.value) : null)}
            options={[
              { value: '', label: 'Select an account...' },
              ...accounts.map((acc) => ({
                value: acc.id.toString(),
                label: `${acc.email} (${acc.provider_id})`,
              })),
            ]}
          />

          <div className="flex gap-2 pt-4">
            <Button
              variant="primary"
              onClick={handleExecutePreset}
              disabled={!selectedAccountId || executing}
              className="flex-1"
            >
              {executing ? 'Executing...' : 'Execute'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowAccountModal(false);
                setSelectedPresetToRun(null);
                setSelectedAccountId(null);
              }}
              disabled={executing}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
