import type { PluginFamily, PluginOrigin } from './pluginSystem';

export type PluginRegistrationSource = 'source' | 'bundle' | 'sandbox';

export interface PluginRegistration {
  id: string;
  family: PluginFamily;
  origin: PluginOrigin;
  source: PluginRegistrationSource;
  label?: string;
  register: () => Promise<void> | void;
}

export interface RegisterPluginFamilyOptions {
  preferredSource: PluginRegistrationSource;
  family?: PluginFamily;
  strict?: boolean;
  verbose?: boolean;
  logPrefix?: string;
}

export async function registerPluginFamily(
  registrations: PluginRegistration[],
  options: RegisterPluginFamilyOptions
): Promise<PluginRegistration[]> {
  const {
    preferredSource,
    family,
    strict = false,
    verbose = false,
    logPrefix = 'PluginBootstrap',
  } = options;

  const filtered = family
    ? registrations.filter((registration) => registration.family === family)
    : registrations;

  const preferred = filtered.filter((registration) => registration.source === preferredSource);
  const fallback = filtered.filter((registration) => registration.source !== preferredSource);
  const ordered = [...preferred, ...fallback];
  const selected = new Map<string, PluginRegistration>();

  for (const registration of ordered) {
    if (selected.has(registration.id)) {
      const existing = selected.get(registration.id);
      console.warn(
        `[${logPrefix}] Skipping duplicate plugin "${registration.id}" from ${registration.source} ` +
        `(already using ${existing?.source}).`
      );
      continue;
    }
    selected.set(registration.id, registration);
  }

  const selectedRegistrations = Array.from(selected.values());

  if (verbose) {
    console.info(`[${logPrefix}] Registering ${selectedRegistrations.length} plugin(s)...`);
  }

  for (const registration of selectedRegistrations) {
    try {
      await registration.register();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const label = registration.label ? ` (${registration.label})` : '';
      const details = `${registration.id}${label} from ${registration.source}`;
      if (strict) {
        throw new Error(`[${logPrefix}] Failed to register ${details}: ${message}`);
      }
      console.warn(`[${logPrefix}] Failed to register ${details}: ${message}`);
    }
  }

  return selectedRegistrations;
}
