/**
 * Server Switcher
 *
 * Dropdown component for switching between PixSim7 server instances.
 * Shows current server, list of configured servers, and add server button.
 */
import { useState, useRef, useEffect } from 'react';
import { useServerManagerStore, type ServerConfig } from '@/stores/serverManagerStore';
import { AddServerModal } from './AddServerModal';

export function ServerSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const servers = useServerManagerStore((state) => state.servers);
  const activeServerId = useServerManagerStore((state) => state.activeServerId);
  const setActiveServer = useServerManagerStore((state) => state.setActiveServer);
  const removeServer = useServerManagerStore((state) => state.removeServer);
  const accounts = useServerManagerStore((state) => state.accounts);

  const activeServer = servers.find((s) => s.id === activeServerId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectServer = (serverId: string) => {
    setActiveServer(serverId);
    setIsOpen(false);
    // Trigger page reload to refresh data from new server
    window.location.reload();
  };

  const handleRemoveServer = (e: React.MouseEvent, serverId: string) => {
    e.stopPropagation();
    if (confirm('Remove this server from your list?')) {
      removeServer(serverId);
    }
  };

  // Don't render if no servers configured
  if (servers.length === 0) {
    return (
      <>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg
                     bg-neutral-100 dark:bg-neutral-800
                     hover:bg-neutral-200 dark:hover:bg-neutral-700
                     text-neutral-700 dark:text-neutral-300 transition-colors"
        >
          <span className="text-lg">+</span>
          <span>Add Server</span>
        </button>
        <AddServerModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
        />
      </>
    );
  }

  return (
    <>
      <div ref={dropdownRef} className="relative">
        {/* Trigger button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg
                     bg-neutral-100 dark:bg-neutral-800
                     hover:bg-neutral-200 dark:hover:bg-neutral-700
                     text-neutral-700 dark:text-neutral-300 transition-colors"
        >
          <ServerIcon />
          <span className="max-w-[120px] truncate">
            {activeServer?.name ?? 'Select Server'}
          </span>
          <ChevronIcon isOpen={isOpen} />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div
            className="absolute top-full left-0 mt-1 w-64 py-1
                       bg-white dark:bg-neutral-900
                       border border-neutral-200 dark:border-neutral-700
                       rounded-lg shadow-lg z-50"
          >
            {/* Server list */}
            {servers.map((server) => (
              <ServerItem
                key={server.id}
                server={server}
                isActive={server.id === activeServerId}
                account={accounts[server.id]}
                onSelect={() => handleSelectServer(server.id)}
                onRemove={(e) => handleRemoveServer(e, server.id)}
              />
            ))}

            {/* Divider */}
            <div className="my-1 border-t border-neutral-200 dark:border-neutral-700" />

            {/* Add server button */}
            <button
              onClick={() => {
                setIsOpen(false);
                setShowAddModal(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm
                         text-neutral-600 dark:text-neutral-400
                         hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <span className="text-lg">+</span>
              <span>Add Server</span>
            </button>
          </div>
        )}
      </div>

      <AddServerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
      />
    </>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface ServerItemProps {
  server: ServerConfig;
  isActive: boolean;
  account?: { username: string; email: string };
  onSelect: () => void;
  onRemove: (e: React.MouseEvent) => void;
}

function ServerItem({ server, isActive, account, onSelect, onRemove }: ServerItemProps) {
  return (
    <div
      onClick={onSelect}
      className={`
        flex items-center justify-between px-3 py-2 cursor-pointer transition-colors
        ${isActive
          ? 'bg-blue-50 dark:bg-blue-900/20'
          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }
      `}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="w-2 h-2 rounded-full bg-green-500" title="Active" />
          )}
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
            {server.name}
          </span>
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
          {account ? account.username : server.url}
        </div>
      </div>

      {/* Remove button (only for non-active or if multiple servers) */}
      <button
        onClick={onRemove}
        className="p-1 text-neutral-400 hover:text-red-500 dark:hover:text-red-400
                   opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
        title="Remove server"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function ServerIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
      />
    </svg>
  );
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
