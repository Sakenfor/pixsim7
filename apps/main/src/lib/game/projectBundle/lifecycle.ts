export type ProjectBundleRuntimeLifecycleState =
  | 'bootstrap'
  | 'registered'
  | 'imported'
  | 'active'
  | 'disabled'
  | 'removed';

const PROJECT_BUNDLE_RUNTIME_LIFECYCLE_TRANSITIONS: Record<
  ProjectBundleRuntimeLifecycleState,
  readonly ProjectBundleRuntimeLifecycleState[]
> = {
  bootstrap: ['registered', 'removed'],
  registered: ['imported', 'active', 'disabled', 'removed'],
  imported: ['active', 'disabled', 'removed'],
  active: ['disabled', 'removed'],
  disabled: ['registered', 'removed'],
  removed: ['registered'],
};

export function canTransitionProjectBundleRuntimeLifecycle(
  from: ProjectBundleRuntimeLifecycleState,
  to: ProjectBundleRuntimeLifecycleState,
): boolean {
  if (from === to) {
    return true;
  }
  return PROJECT_BUNDLE_RUNTIME_LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function assertProjectBundleRuntimeLifecycleTransition(
  from: ProjectBundleRuntimeLifecycleState,
  to: ProjectBundleRuntimeLifecycleState,
  moduleKey: string,
): void {
  if (canTransitionProjectBundleRuntimeLifecycle(from, to)) {
    return;
  }
  throw new Error(
    `invalid_project_bundle_lifecycle_transition:${moduleKey}:${from}->${to}`,
  );
}

export class ProjectBundleRuntimeLifecycleTracker {
  private readonly states = new Map<string, ProjectBundleRuntimeLifecycleState>();

  constructor(keys: Iterable<string> = []) {
    for (const key of keys) {
      this.states.set(key, 'bootstrap');
    }
  }

  ensure(key: string): ProjectBundleRuntimeLifecycleState {
    const normalized = key.trim();
    const existing = this.states.get(normalized);
    if (existing) {
      return existing;
    }
    this.states.set(normalized, 'bootstrap');
    return 'bootstrap';
  }

  get(key: string): ProjectBundleRuntimeLifecycleState {
    return this.ensure(key);
  }

  transition(key: string, next: ProjectBundleRuntimeLifecycleState): void {
    const normalized = key.trim();
    const prev = this.ensure(normalized);
    assertProjectBundleRuntimeLifecycleTransition(prev, next, normalized);
    if (prev === next) {
      return;
    }
    this.states.set(normalized, next);
  }

  snapshot(): Record<string, ProjectBundleRuntimeLifecycleState> {
    return Object.fromEntries(this.states.entries());
  }
}
