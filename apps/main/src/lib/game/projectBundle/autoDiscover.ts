import {
  hasAuthoringProjectBundleContributor,
  registerAuthoringProjectBundleContributor,
} from './contributors';
import type { AuthoringProjectBundleContributor } from './types';

interface ContributorModule {
  authoringProjectBundleContributor?: AuthoringProjectBundleContributor<unknown>;
  default?: AuthoringProjectBundleContributor<unknown>;
  [key: string]: unknown;
}

export interface DiscoveredAuthoringProjectBundleContributor {
  key: string;
  sourcePath: string;
  contributor: AuthoringProjectBundleContributor<unknown>;
}

export interface AutoRegisterAuthoringProjectBundleContributorsOptions {
  verbose?: boolean;
}

export interface AutoRegisterAuthoringProjectBundleContributorsResult {
  registered: string[];
  skipped: Array<{ path: string; reason: string }>;
}

const contributorModules = import.meta.glob<ContributorModule>(
  [
    '../../../features/*/projectBundle/*.ts',
    '../../../features/*/projectBundle/*.tsx',
  ],
  { eager: true },
);

function isValidContributor(
  candidate: unknown,
): candidate is AuthoringProjectBundleContributor<unknown> {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }
  const key = (candidate as { key?: unknown }).key;
  return typeof key === 'string' && key.trim().length > 0;
}

function pickContributor(moduleExports: ContributorModule):
  | AuthoringProjectBundleContributor<unknown>
  | null {
  if (isValidContributor(moduleExports.authoringProjectBundleContributor)) {
    return moduleExports.authoringProjectBundleContributor;
  }

  if (isValidContributor(moduleExports.default)) {
    return moduleExports.default;
  }

  for (const value of Object.values(moduleExports)) {
    if (isValidContributor(value)) {
      return value;
    }
  }

  return null;
}

export function discoverAuthoringProjectBundleContributors():
  DiscoveredAuthoringProjectBundleContributor[] {
  const discovered: DiscoveredAuthoringProjectBundleContributor[] = [];

  for (const [path, moduleExports] of Object.entries(contributorModules)) {
    const contributor = pickContributor(moduleExports);
    if (!contributor) {
      continue;
    }

    discovered.push({
      key: contributor.key,
      sourcePath: path,
      contributor,
    });
  }

  discovered.sort((a, b) => a.key.localeCompare(b.key));
  return discovered;
}

export function autoRegisterAuthoringProjectBundleContributors(
  options: AutoRegisterAuthoringProjectBundleContributorsOptions = {},
): AutoRegisterAuthoringProjectBundleContributorsResult {
  const discovered = discoverAuthoringProjectBundleContributors();
  const result: AutoRegisterAuthoringProjectBundleContributorsResult = {
    registered: [],
    skipped: [],
  };

  for (const entry of discovered) {
    if (hasAuthoringProjectBundleContributor(entry.key)) {
      result.skipped.push({
        path: entry.sourcePath,
        reason: `already_registered:${entry.key}`,
      });
      continue;
    }

    try {
      registerAuthoringProjectBundleContributor(entry.contributor);
      result.registered.push(entry.key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.skipped.push({
        path: entry.sourcePath,
        reason: `registration_failed:${message}`,
      });
    }
  }

  if (options.verbose) {
    console.log(
      `[AuthoringProject] contributors registered=${result.registered.length} skipped=${result.skipped.length}`,
    );
  }

  return result;
}
