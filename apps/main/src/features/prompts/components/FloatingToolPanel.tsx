import { FloatingPanel, type FloatingPanelProps } from '@lib/ui/FloatingPanel';

/**
 * FloatingToolPanel — Prompt-tools styling of the canonical {@link FloatingPanel}
 * (wand header icon). All draggable/resizable + mobile-sheet behaviour lives in
 * the primitive; this is just the themed entry point its consumers already use.
 */
export type FloatingToolPanelProps = Omit<FloatingPanelProps, 'headerIcon'>;

export function FloatingToolPanel(props: FloatingToolPanelProps) {
  return <FloatingPanel headerIcon="wand" {...props} />;
}
