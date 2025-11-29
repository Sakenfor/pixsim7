import { useEffect, useState } from 'react';
import { Panel, Badge, Button, ProgressBar } from '@pixsim7/shared.ui';
import { listSessionQuests, type QuestDTO, type GameSessionDTO } from '@/lib/api/game';

interface QuestLogProps {
  session: GameSessionDTO | null;
  onClose?: () => void;
}

export function QuestLog({ session, onClose }: QuestLogProps) {
  const [quests, setQuests] = useState<QuestDTO[]>([]);
  const [selectedQuest, setSelectedQuest] = useState<QuestDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active');

  useEffect(() => {
    if (!session) {
      setQuests([]);
      return;
    }

    const fetchQuests = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedQuests = await listSessionQuests(
          session.id!,
          filter === 'all' ? undefined : filter
        );
        setQuests(fetchedQuests);
      } catch (e: any) {
        setError(e.message || 'Failed to load quests');
      } finally {
        setLoading(false);
      }
    };

    fetchQuests();
  }, [session, filter]);

  if (!session) {
    return (
      <Panel className="p-4">
        <p className="text-sm text-neutral-500">No active game session</p>
      </Panel>
    );
  }

  const getStatusColor = (status: string): 'blue' | 'green' | 'red' | 'gray' => {
    switch (status) {
      case 'active':
        return 'blue';
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  return (
    <Panel className="space-y-0" padded={false}>
      <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
        <div>
          <h2 className="text-lg font-semibold">Quest Log</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Track your active quests and objectives
          </p>
        </div>
        {onClose && (
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 p-2 border-b border-neutral-200 dark:border-neutral-700">
        <Button
          size="sm"
          variant={filter === 'active' ? 'primary' : 'secondary'}
          onClick={() => setFilter('active')}
        >
          Active
        </Button>
        <Button
          size="sm"
          variant={filter === 'completed' ? 'primary' : 'secondary'}
          onClick={() => setFilter('completed')}
        >
          Completed
        </Button>
        <Button
          size="sm"
          variant={filter === 'all' ? 'primary' : 'secondary'}
          onClick={() => setFilter('all')}
        >
          All
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-x divide-neutral-200 dark:divide-neutral-700">
        {/* Quest list */}
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          {loading && <p className="text-sm text-neutral-500">Loading quests...</p>}
          {error && <p className="text-sm text-red-500">Error: {error}</p>}
          {!loading && !error && quests.length === 0 && (
            <p className="text-sm text-neutral-500">No quests found</p>
          )}
          {!loading &&
            !error &&
            quests.map((quest) => (
              <button
                key={quest.id}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedQuest?.id === quest.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                    : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                }`}
                onClick={() => setSelectedQuest(quest)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{quest.title}</span>
                      <Badge color={getStatusColor(quest.status)}>
                        {quest.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
                      {quest.description}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-neutral-500">
                    {quest.objectives.filter((o) => o.completed).length}/
                    {quest.objectives.length} objectives
                  </span>
                </div>
              </button>
            ))}
        </div>

        {/* Quest details */}
        <div className="p-4 max-h-96 overflow-y-auto">
          {selectedQuest ? (
            <QuestDetail quest={selectedQuest} />
          ) : (
            <p className="text-sm text-neutral-500">Select a quest to view details</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

interface QuestDetailProps {
  quest: QuestDTO;
}

function QuestDetail({ quest }: QuestDetailProps) {
  const getStatusColor = (status: string): 'blue' | 'green' | 'red' | 'gray' => {
    switch (status) {
      case 'active':
        return 'blue';
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  const completedCount = quest.objectives.filter((o) => o.completed).length;
  const totalCount = quest.objectives.length;
  const requiredCount = quest.objectives.filter((o) => !o.optional).length;
  const completedRequiredCount = quest.objectives.filter((o) => !o.optional && o.completed).length;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-lg font-semibold">{quest.title}</h3>
          <Badge color={getStatusColor(quest.status)}>{quest.status}</Badge>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{quest.description}</p>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">Progress</h4>
        <ProgressBar
          value={(completedRequiredCount / requiredCount) * 100}
          max={100}
          color="blue"
          showValue={false}
        />
        <p className="text-xs text-neutral-500 mt-1">
          {completedRequiredCount}/{requiredCount} required objectives completed
        </p>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">Objectives</h4>
        <div className="space-y-2">
          {quest.objectives.map((objective) => (
            <div
              key={objective.id}
              className={`p-2 rounded border ${
                objective.completed
                  ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                  : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700'
              }`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={objective.completed}
                  readOnly
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <p
                    className={`text-sm ${
                      objective.completed
                        ? 'line-through text-neutral-500'
                        : 'text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {objective.description}
                    {objective.optional && (
                      <Badge color="gray" className="ml-2">
                        Optional
                      </Badge>
                    )}
                  </p>
                  {objective.target > 1 && (
                    <div className="mt-1">
                      <ProgressBar
                        value={objective.progress}
                        max={objective.target}
                        color="blue"
                        showValue={false}
                      />
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {objective.progress}/{objective.target}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
