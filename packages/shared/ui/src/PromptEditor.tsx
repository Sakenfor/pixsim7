import React, { useCallback, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  placeholder as placeholderExt,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

const DEFAULT_PROMPT_MAX_CHARS = 800;

export interface PromptEditorProps {
  value: string;
  onChange: (val: string) => void;
  maxChars?: number;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  variant?: 'default' | 'compact';
  showCounter?: boolean;
  resizable?: boolean;
  minHeight?: number;
  enforceLimit?: boolean;
  editorRef?: React.RefObject<EditorView | null>;
  transparent?: boolean;
  onKeyDown?: (e: KeyboardEvent) => boolean | void;
}

const baseTheme = EditorView.baseTheme({
  '&': {
    flex: '1',
    height: '100%',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: 'inherit',
    overflow: 'auto',
  },
  '.cm-content': {
    padding: '8px',
    caretColor: 'currentColor',
  },
  '.cm-line': {
    padding: '0',
  },
  '&.cm-editor .cm-placeholder': {
    color: 'var(--color-neutral-400)',
    fontStyle: 'normal',
  },
});

export const PromptEditor: React.FC<PromptEditorProps> = ({
  value,
  onChange,
  maxChars = DEFAULT_PROMPT_MAX_CHARS,
  placeholder = 'Describe what you want to generate\u2026',
  disabled = false,
  autoFocus = false,
  className,
  variant = 'default',
  showCounter = true,
  resizable = false,
  minHeight,
  enforceLimit = false,
  editorRef: externalEditorRef,
  transparent = false,
  onKeyDown,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onKeyDownRef = useRef(onKeyDown);
  onKeyDownRef.current = onKeyDown;
  const suppressNextUpdate = useRef(false);

  // Compartments for dynamic reconfiguration
  const disabledComp = useRef(new Compartment());
  const placeholderComp = useRef(new Compartment());
  const variantComp = useRef(new Compartment());

  const remaining = maxChars - value.length;
  const isOverLimit = remaining < 0;

  const defaultMinHeight = variant === 'compact' ? 70 : 110;
  const effectiveMinHeight = minHeight ?? defaultMinHeight;

  const stableOnChange = useCallback((val: string) => {
    if (suppressNextUpdate.current) {
      suppressNextUpdate.current = false;
      return;
    }
    const next = enforceLimit && val.length > maxChars ? val.slice(0, maxChars) : val;
    onChangeRef.current(next);
  }, [enforceLimit, maxChars]);

  // Mount / destroy
  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    const disabledExts = (d: boolean): Extension =>
      d ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [];

    const state = EditorState.create({
      doc: value,
      extensions: [
        baseTheme,
        EditorView.lineWrapping,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            stableOnChange(update.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({
          keydown: (e) => {
            const result = onKeyDownRef.current?.(e);
            if (result === true) {
              e.preventDefault();
              return true;
            }
            return false;
          },
        }),
        placeholderComp.current.of(placeholder ? placeholderExt(placeholder) : []),
        disabledComp.current.of(disabledExts(disabled)),
        variantComp.current.of(
          EditorView.contentAttributes.of({
            class: variant === 'compact' ? 'text-sm' : 'text-base',
          }),
        ),
      ],
    });

    const view = new EditorView({ state, parent });
    viewRef.current = view;
    if (externalEditorRef) {
      (externalEditorRef as React.MutableRefObject<EditorView | null>).current = view;
    }

    if (autoFocus) {
      view.focus();
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      if (externalEditorRef) {
        (externalEditorRef as React.MutableRefObject<EditorView | null>).current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconfigure: disabled
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const exts: Extension = disabled
      ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
      : [];
    view.dispatch({ effects: disabledComp.current.reconfigure(exts) });
  }, [disabled]);

  // Reconfigure: placeholder
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: placeholderComp.current.reconfigure(
        placeholder ? placeholderExt(placeholder) : [],
      ),
    });
  }, [placeholder]);

  // Reconfigure: variant
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: variantComp.current.reconfigure(
        EditorView.contentAttributes.of({
          class: variant === 'compact' ? 'text-sm' : 'text-base',
        }),
      ),
    });
  }, [variant]);

  // Sync external value -> editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc === value) return;

    suppressNextUpdate.current = true;
    view.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: value },
    });
  }, [value]);

  return (
    <div className={clsx('flex flex-col', className)}>
      <div
        ref={containerRef}
        style={{ minHeight: `${effectiveMinHeight}px` }}
        className={clsx(
          'w-full rounded border outline-none flex-1 overflow-hidden',
          transparent ? 'bg-transparent' : 'bg-white dark:bg-neutral-900',
          disabled && 'opacity-60 cursor-not-allowed',
          resizable ? 'resize-y' : 'resize-none',
          isOverLimit
            ? 'border-red-500 dark:border-red-500 focus-within:ring-2 focus-within:ring-red-500/40'
            : 'border-neutral-300 dark:border-neutral-700 focus-within:ring-2 focus-within:ring-accent/40',
        )}
      />
      {showCounter && (
        <div className="mt-1 flex justify-between items-center text-xs">
          {isOverLimit && (
            <span className="text-red-600 dark:text-red-400 font-medium">
              Over limit by {Math.abs(remaining)} chars
            </span>
          )}
          <span className={clsx(
            'tabular-nums ml-auto',
            isOverLimit ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-neutral-500',
          )}>
            {value.length} / {maxChars}
          </span>
        </div>
      )}
    </div>
  );
};
