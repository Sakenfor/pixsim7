import { useProjectContext } from '@features/contextHub';

export function ProjectContextBadge() {
  const project = useProjectContext();

  if (!project || (project.projectId == null && project.lastImportedAt == null)) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] leading-tight text-neutral-500 dark:text-neutral-400">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          project.dirty ? 'bg-amber-500' : 'bg-green-500'
        }`}
      />
      <span className="truncate max-w-[120px]">
        {project.projectName ?? `Project #${project.projectId}`}
      </span>
    </span>
  );
}
