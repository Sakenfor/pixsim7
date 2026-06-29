import clsx from 'clsx';

import { usePanelSkin } from '@features/appearance';

import { PROMPT_BOX_SKIN_PANEL_ID } from '../lib/promptBoxSkin';

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
  onSpanProvenanceChange?: PromptComposerProps['onSpanProvenanceChange'];
  recipeContext?: PromptComposerProps['recipeContext'];
}

export interface PromptComposerSurfaceDisplay {
  variant?: PromptComposerProps['variant'];
  showCounter?: PromptComposerProps['showCounter'];
  counterAccessory?: PromptComposerProps['counterAccessory'];
  resizable?: PromptComposerProps['resizable'];
  minHeight?: PromptComposerProps['minHeight'];
  historyScopeKey?: PromptComposerProps['historyScopeKey'];
  historyMaxEntries?: PromptComposerProps['historyMaxEntries'];
  historyScopeLabel?: PromptComposerProps['historyScopeLabel'];
  historyScopeValue?: PromptComposerProps['historyScopeValue'];
  onHistoryScopeChange?: PromptComposerProps['onHistoryScopeChange'];
  inputPrompts?: PromptComposerProps['inputPrompts'];
  inputPromptsLoading?: PromptComposerProps['inputPromptsLoading'];
  inputPromptsIsEmpty?: PromptComposerProps['inputPromptsIsEmpty'];
  onSelectInputPrompt?: PromptComposerProps['onSelectInputPrompt'];
  historyDefaultTab?: PromptComposerProps['historyDefaultTab'];
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
  const promptSkin = usePanelSkin(PROMPT_BOX_SKIN_PANEL_ID);
  const transition = display?.transition;
  const contentClassName = [
    display?.contentClassName ?? 'flex-1 min-h-0',
    display?.error ? 'ring-2 ring-red-500 rounded-lg' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const containerClassName = clsx(
    display?.containerClassName ?? 'h-full w-full p-2 flex flex-col gap-2',
    promptSkin.className,
    promptSkin.className && 'bg-surface text-th',
  );

  return (
    <div
      className={containerClassName}
      data-skin-fx={promptSkin.rootProps['data-skin-fx']}
    >
      <div
        className={contentClassName}
        style={{ transition: 'none', animation: 'none' }}
      >
        {transition && (
          <div className="flex items-center justify-between text-[10px] text-th-muted mb-1">
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
                className="px-2 py-0.5 text-[10px] rounded bg-surface-elevated text-th border border-th"
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
          onSpanProvenanceChange={adapter.onSpanProvenanceChange}
          recipeContext={adapter.recipeContext}
          disabled={adapter.disabled}
          variant={display?.variant}
          showCounter={display?.showCounter}
          counterAccessory={display?.counterAccessory}
          resizable={display?.resizable}
          minHeight={display?.minHeight}
          historyScopeKey={display?.historyScopeKey}
          historyMaxEntries={display?.historyMaxEntries}
          historyScopeLabel={display?.historyScopeLabel}
          historyScopeValue={display?.historyScopeValue}
          onHistoryScopeChange={display?.onHistoryScopeChange}
          inputPrompts={display?.inputPrompts}
          inputPromptsLoading={display?.inputPromptsLoading}
          inputPromptsIsEmpty={display?.inputPromptsIsEmpty}
          onSelectInputPrompt={display?.onSelectInputPrompt}
          historyDefaultTab={display?.historyDefaultTab}
          placeholder={adapter.placeholder}
          className={display?.composerClassName ?? 'h-full'}
        />
      </div>
    </div>
  );
}
