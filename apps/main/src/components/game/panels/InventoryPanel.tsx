import { useEffect, useState } from 'react';
import { Panel, Badge, Button } from '@pixsim7/shared.ui';
import { listInventoryItems, getInventoryStats, type InventoryItemDTO, type GameSessionDTO } from '@lib/api/game';

interface InventoryPanelProps {
  session: GameSessionDTO | null;
  onClose?: () => void;
}

export function InventoryPanel({ session, onClose }: InventoryPanelProps) {
  const [items, setItems] = useState<InventoryItemDTO[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryItemDTO | null>(null);
  const [stats, setStats] = useState<{ unique_items: number; total_quantity: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setItems([]);
      setStats(null);
      return;
    }

    const fetchInventory = async () => {
      setLoading(true);
      setError(null);
      try {
        const [fetchedItems, fetchedStats] = await Promise.all([
          listInventoryItems(session.id!),
          getInventoryStats(session.id!),
        ]);
        setItems(fetchedItems);
        setStats(fetchedStats);
      } catch (e: any) {
        setError(e.message || 'Failed to load inventory');
      } finally {
        setLoading(false);
      }
    };

    fetchInventory();
  }, [session]);

  if (!session) {
    return (
      <Panel className="p-4">
        <p className="text-sm text-neutral-500">No active game session</p>
      </Panel>
    );
  }

  return (
    <Panel className="space-y-0" padded={false}>
      <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
        <div>
          <h2 className="text-lg font-semibold">Inventory</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {stats ? `${stats.unique_items} unique items, ${stats.total_quantity} total` : 'Your collected items'}
          </p>
        </div>
        {onClose && (
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-x divide-neutral-200 dark:divide-neutral-700">
        {/* Item list */}
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          {loading && <p className="text-sm text-neutral-500">Loading inventory...</p>}
          {error && <p className="text-sm text-red-500">Error: {error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="text-sm text-neutral-500">No items in inventory</p>
          )}
          {!loading &&
            !error &&
            items.map((item) => (
              <button
                key={item.id}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedItem?.id === item.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                    : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                }`}
                onClick={() => setSelectedItem(item)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{item.name}</span>
                      <Badge color="blue">×{item.quantity}</Badge>
                    </div>
                    {item.metadata && Object.keys(item.metadata).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(item.metadata).slice(0, 2).map(([key, value]) => (
                          <Badge key={key} color="gray" className="text-xs">
                            {key}: {JSON.stringify(value)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
        </div>

        {/* Item details */}
        <div className="p-4 max-h-96 overflow-y-auto">
          {selectedItem ? (
            <ItemDetail item={selectedItem} />
          ) : (
            <p className="text-sm text-neutral-500">Select an item to view details</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

interface ItemDetailProps {
  item: InventoryItemDTO;
}

function ItemDetail({ item }: ItemDetailProps) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-lg font-semibold">{item.name}</h3>
          <Badge color="blue">×{item.quantity}</Badge>
        </div>
        <p className="text-xs text-neutral-500">ID: {item.id}</p>
      </div>

      {item.metadata && Object.keys(item.metadata).length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Metadata</h4>
          <div className="space-y-1">
            {Object.entries(item.metadata).map(([key, value]) => (
              <div
                key={key}
                className="flex items-start gap-2 text-sm p-2 bg-neutral-50 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700"
              >
                <span className="font-medium text-neutral-600 dark:text-neutral-400 min-w-24">
                  {key}:
                </span>
                <span className="text-neutral-700 dark:text-neutral-300 break-all">
                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!item.metadata || Object.keys(item.metadata).length === 0) && (
        <p className="text-sm text-neutral-500">No additional metadata</p>
      )}
    </div>
  );
}
