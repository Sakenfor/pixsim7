/**
 * Add Server Modal
 *
 * Allows users to add a new PixSim7 server by entering its URL.
 * Fetches server info to verify connectivity and get server metadata.
 */
import { useState } from 'react';
import { Modal, Button, Input } from '@pixsim7/shared.ui';
import { useServerManagerStore } from '@/stores/serverManagerStore';

export interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddServerModal({ isOpen, onClose, onSuccess }: AddServerModalProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addServer = useServerManagerStore((state) => state.addServer);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      setError('Please enter a server URL');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await addServer(url.trim());
      setUrl('');
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setUrl('');
      setError(null);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Server" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="server-url"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
          >
            Server URL
          </label>
          <Input
            id="server-url"
            type="url"
            placeholder="https://pixsim.example.com or http://localhost:8000"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
            autoFocus
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Enter the base URL of the PixSim7 server you want to connect to.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2 border-t border-neutral-200 dark:border-neutral-700">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isLoading}>
            {isLoading ? 'Connecting...' : 'Add Server'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
