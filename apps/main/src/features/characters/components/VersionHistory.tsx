import { Button } from '@pixsim7/shared.ui';
import { useEffect, useState } from 'react';

import {
  getCharacterHistory,
  evolveCharacter,
  type CharacterSummary,
  type UpdateCharacterRequest,
} from '@lib/api/characters';

export interface VersionHistoryProps {
  characterId: string;
  onEvolved: () => void;
}

export function VersionHistory({ characterId, onEvolved }: VersionHistoryProps) {
  const [history, setHistory] = useState<CharacterSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [evolveNotes, setEvolveNotes] = useState('');
  const [isEvolving, setIsEvolving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    getCharacterHistory(characterId)
      .then(setHistory)
      .catch(() => {});
  }, [characterId, isOpen]);

  const handleEvolve = async () => {
    if (!evolveNotes.trim()) return;
    setIsEvolving(true);
    try {
      const req: UpdateCharacterRequest = { version_notes: evolveNotes };
      await evolveCharacter(characterId, req);
      setEvolveNotes('');
      onEvolved();
      // Refresh history
      const updated = await getCharacterHistory(characterId);
      setHistory(updated);
    } catch {
      // handled by parent
    } finally {
      setIsEvolving(false);
    }
  };

  return (
    <div className="border-t border-neutral-800 pt-3">
      <button
        className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9654;</span>
        Version History ({history.length || '...'})
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2 pl-3">
          {history.map((ver) => (
            <div
              key={ver.id}
              className="flex items-baseline gap-2 text-xs"
            >
              <span className="font-mono text-blue-400">v{ver.version}</span>
              <span className="text-neutral-500">
                {new Date(ver.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-2">
            <input
              className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
              value={evolveNotes}
              onChange={(e) => setEvolveNotes(e.target.value)}
              placeholder="Version notes..."
            />
            <Button
              variant="outline"
              size="xs"
              onClick={handleEvolve}
              loading={isEvolving}
            >
              Evolve
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
