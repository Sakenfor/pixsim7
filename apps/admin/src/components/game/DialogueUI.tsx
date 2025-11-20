import { useState } from 'react';
import { Panel, Button, Badge } from '@pixsim7/shared.ui';

export interface DialogueMessage {
  speaker: string;
  text: string;
  choices?: Array<{
    id: string;
    label: string;
    sceneId?: number;
  }>;
}

interface DialogueUIProps {
  message: DialogueMessage;
  npcId?: number;
  onChoice?: (choiceId: string, sceneId?: number) => void;
  onClose?: () => void;
}

export function DialogueUI({ message, npcId, onChoice, onClose }: DialogueUIProps) {
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

  const handleChoice = (choiceId: string, sceneId?: number) => {
    setSelectedChoice(choiceId);
    if (onChoice) {
      onChoice(choiceId, sceneId);
    }
  };

  return (
    <Panel className="space-y-4 max-w-2xl">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-lg">{message.speaker}</span>
          {npcId && (
            <Badge color="blue" className="text-xs">
              NPC #{npcId}
            </Badge>
          )}
        </div>
        {onClose && (
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      <div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>
      </div>

      {message.choices && message.choices.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
            Your response:
          </p>
          <div className="space-y-2">
            {message.choices.map((choice) => (
              <button
                key={choice.id}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedChoice === choice.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                    : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 hover:border-blue-300 dark:hover:border-blue-700'
                }`}
                onClick={() => handleChoice(choice.id, choice.sceneId)}
              >
                <span className="text-sm">{choice.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

interface SimpleDialogueProps {
  npcId: number;
  npcName?: string;
  onStartScene?: (sceneId: number) => void;
  onClose: () => void;
}

export function SimpleDialogue({ npcId, npcName, onStartScene, onClose }: SimpleDialogueProps) {
  const defaultMessage: DialogueMessage = {
    speaker: npcName || `NPC #${npcId}`,
    text: "Hello! I don't have any specific dialogue configured yet, but you can set up a scene to play when talking to me.",
    choices: [
      {
        id: 'close',
        label: 'Goodbye',
      },
    ],
  };

  const handleChoice = (choiceId: string, sceneId?: number) => {
    if (choiceId === 'close') {
      onClose();
    } else if (sceneId && onStartScene) {
      onStartScene(sceneId);
    }
  };

  return <DialogueUI message={defaultMessage} npcId={npcId} onChoice={handleChoice} onClose={onClose} />;
}
