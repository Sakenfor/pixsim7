import { CAP_PROJECT_CONTEXT, type ProjectContextSummary } from '../domain/capabilities';

import { useCapability } from './useCapability';

export function useProjectContext(): ProjectContextSummary | null {
  const { value } = useCapability<ProjectContextSummary>(CAP_PROJECT_CONTEXT);
  return value;
}
