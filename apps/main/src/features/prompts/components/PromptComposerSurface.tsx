import { PromptComposer, type PromptComposerProps } from './PromptComposer';

export interface PromptComposerTransitionDisplay {
  transitionCount: number;
  transitionIndex: number;
  currentDuration: number;
  durationOptions: number[];
  onDurationChange: (nextValue: number) => void;
  disabled?: boolean;
}

export interface PromptComposerStateAdapter {
  value: string;
  onChange: (value: string) => void;
  maxChars?: number;
  placeholder?: string;
  disabled?: boolean;
  runContextSeed?: Record<string, unknown>;
  onPromptToolRunContextPatch?: PromptComposerProps['onPromptToolRunContextPatch'];
}

export interface PromptComposerSurfaceDisplay {
  variant?: PromptComposerProps['variant'];
  showCounter?: PromptComposerProps['showCounter'];
  resizable?: PromptComposerProps['resizable'];
  minHeight?: PromptComposerProps['minHeight'];
  composerClassName?: string;
  containerClassName?: string;
  contentClassName?: string;
  error?: string | null;
  transition?: PromptComposerTransitionDisplay;
}

export interface PromptComposerSurfaceProps {
  adapter: PromptComposerStateAdapter;
  display?: PromptComposerSurfaceDisplay;
}

export function PromptComposerSurface({ adapter, display }: PromptComposerSurfaceProps) {
  const transition = display?.transition;
  const contentClassName = [
    display?.contentClassName ?? 'flex-1 min-h-0',
    display?.error ? 'ring-2 ring-red-500 rounded-lg' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={display?.containerClassName ?? 'h-full w-full p-2 flex flex-col gap-2'}>
      <div
        className={contentClassName}
        style={{ transition: 'none', animation: 'none' }}
      >
        {transition && (
          <div className="flex items-center justify-between text-[10px] text-neutral-500 dark:text-neutral-400 mb-1">
            <div>
              {transition.transitionCount > 0
                ? `Transition ${transition.transitionIndex + 1} -> ${transition.transitionIndex + 2}`
                : 'Add one more image to edit prompts'}
            </div>
            {transition.transitionCount > 0 && (
              <select
                value={transition.currentDuration}
                onChange={(event) => transition.onDurationChange(Number(event.target.value))}
                disabled={transition.disabled}
                className="px-2 py-0.5 text-[10px] rounded bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
              >
                {transition.durationOptions.map((option) => (
                  <option key={option} value={option}>{option}s</option>
                ))}
              </select>
            )}
          </div>
        )}
        <PromptComposer
          value={adapter.value}
          onChange={adapter.onChange}
          maxChars={adapter.maxChars}
          runContextSeed={adapter.runContextSeed}
          onPromptToolRunContextPatch={adapter.onPromptToolRunContextPatch}
          disabled={adapter.disabled}
          variant={display?.variant}
          showCounter={display?.showCounter}
          resizable={display?.resizable}
          minHeight={display?.minHeight}
          placeholder={adapter.placeholder}
          className={display?.composerClassName ?? 'h-full'}
        />
      </div>
    </div>
  );
}
