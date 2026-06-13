/**
 * Placeholder component for the Game World editor tab panels.
 *
 * These panels exist in the registry only to drive GameWorld's nav — their
 * label, description, and scope/section (via `contextLabel`) are read by
 * `GameWorld` to build its sidebar sections. GameWorld renders the real leaf
 * editors from its own switch and never mounts `def.component`, so this stub
 * just guards the dormant component slot: the tab definitions are registered
 * `internal` + `browsable: false`, but if one were ever force-mounted outside
 * the Game World editor it shows a hint instead of crashing.
 *
 * When the `editor-context-via-store` checkpoint lands, the leaf editors read
 * their world/location selection from a host capability and this stub is
 * replaced by adapters that render the real editors generically.
 */
export function GameWorldEditorTabStub() {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
      Open this editor from the Game World editor.
    </div>
  );
}
