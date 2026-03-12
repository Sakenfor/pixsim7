import { useState } from 'react';

import { Icon } from '@lib/icons';

export function ChatView() {
  const [message, setMessage] = useState('');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-800">
        <Icon name="users" size={14} className="text-neutral-500" />
        <span className="text-xs font-medium text-neutral-300">General</span>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-auto p-4">
        <p className="text-xs text-neutral-600 text-center py-8">
          No messages yet. Start a conversation!
        </p>
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-neutral-800">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-neutral-800 text-xs text-neutral-200 placeholder:text-neutral-600 rounded px-3 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500/50"
        />
        <button
          disabled={!message.trim()}
          className="text-neutral-500 hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-neutral-500 transition-colors"
        >
          <Icon name="arrowRight" size={14} />
        </button>
      </div>
    </div>
  );
}
