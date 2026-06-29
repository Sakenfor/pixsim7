/**
 * Locks the declarative-content behaviour added to the shared SidebarContentLayout
 * (the @pixsim7/shared.ui primitive). Resolution order for the active pane:
 *   active child's `content` → active section's `content` → the `children` prop.
 * This is what lets a nested sidebar describe panes inline instead of hand-writing
 * a `{activeId === '…' && <X/>}` switch — and the fall-through is what keeps every
 * existing consumer (which passes `children` and no `content`) working unchanged.
 */
import { SidebarContentLayout, type SidebarContentLayoutSection } from '@pixsim7/shared.ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

const SECTIONS: SidebarContentLayoutSection[] = [
  { id: 'declarative', label: 'Declarative', content: <div>section-pane</div>,
    children: [
      { id: 'child-a', label: 'A', content: <div>child-a-pane</div> },
      { id: 'child-b', label: 'B' }, // no content → falls back to section, then children
    ] },
  { id: 'manual', label: 'Manual' }, // no content → uses the children render prop
];

function setup(activeSectionId: string, activeChildId?: string) {
  return render(
    <SidebarContentLayout
      sections={SECTIONS}
      activeSectionId={activeSectionId}
      activeChildId={activeChildId}
      onSelectSection={() => {}}
    >
      <div>manual-children</div>
    </SidebarContentLayout>,
  );
}

describe('SidebarContentLayout declarative content', () => {
  it('renders the active child content when present', () => {
    setup('declarative', 'child-a');
    expect(screen.getByText('child-a-pane')).toBeTruthy();
    expect(screen.queryByText('section-pane')).toBeNull();
    expect(screen.queryByText('manual-children')).toBeNull();
  });

  it('falls back to the section content when the child has none', () => {
    setup('declarative', 'child-b');
    expect(screen.getByText('section-pane')).toBeTruthy();
    expect(screen.queryByText('manual-children')).toBeNull();
  });

  it('uses section content when a section (no active child) declares it', () => {
    setup('declarative');
    expect(screen.getByText('section-pane')).toBeTruthy();
  });

  it('falls back to the children render prop for sections without content', () => {
    setup('manual');
    expect(screen.getByText('manual-children')).toBeTruthy();
    expect(screen.queryByText('section-pane')).toBeNull();
  });
});
