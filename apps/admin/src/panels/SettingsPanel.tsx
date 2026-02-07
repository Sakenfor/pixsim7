import { useMemo } from 'react';

import { useAdminContext } from '../adminContext';

export function SettingsPanel() {
  const {
    settings,
    settingsDraft,
    settingsState,
    settingsError,
    settingsDirty,
    refreshSettings,
    saveSettings,
    resetSettingsDraft,
    updateLoggingDraft,
    updateDatastoreDraft,
    updatePortsDraft,
    updateBaseUrlDraft,
    updateAdvancedDraft,
    updateProfileDraft,
  } = useAdminContext();

  const activeProfile = useMemo(() => {
    if (!settingsDraft) {
      return null;
    }
    return settingsDraft.profiles.available?.[settingsDraft.profiles.active] ?? null;
  }, [settingsDraft]);

  const profilePorts = useMemo(() => {
    if (!activeProfile?.ports) {
      return [];
    }
    return Object.entries(activeProfile.ports).sort(([a], [b]) => a.localeCompare(b));
  }, [activeProfile]);

  const profileBaseUrls = useMemo(() => {
    if (!activeProfile?.base_urls) {
      return [];
    }
    return Object.entries(activeProfile.base_urls).sort(([a], [b]) => a.localeCompare(b));
  }, [activeProfile]);

  return (
    <div className="panel-card h-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-title">Shared settings</p>
          <h2 className="text-2xl font-semibold">Launcher settings</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="ghost-button" onClick={refreshSettings}>
            Refresh
          </button>
          <button className="ghost-button" onClick={resetSettingsDraft} disabled={!settingsDirty}>
            Reset
          </button>
        </div>
      </div>
      {settingsError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {settingsError}
        </div>
      )}
      {settingsState === 'loading' && !settingsDraft ? (
        <div className="text-sm text-[var(--ink-muted)]">Loading settings...</div>
      ) : settingsDraft ? (
        <div className="grid gap-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
              <span>SQL logging</span>
              <input
                type="checkbox"
                checked={settingsDraft.logging.sql_logging_enabled}
                onChange={(event) => updateLoggingDraft('sql_logging_enabled', event.target.checked)}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
              <span>Use local datastores</span>
              <input
                type="checkbox"
                checked={settingsDraft.datastores.use_local_datastores}
                onChange={(event) => updateDatastoreDraft('use_local_datastores', event.target.checked)}
              />
            </label>
            <label className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
              <span>Worker debug flags</span>
              <input
                type="text"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={settingsDraft.logging.worker_debug_flags}
                onChange={(event) => updateLoggingDraft('worker_debug_flags', event.target.value)}
                placeholder="generation,provider,worker"
              />
            </label>
            <label className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
              <span>Backend log level</span>
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={settingsDraft.logging.backend_log_level}
                onChange={(event) => updateLoggingDraft('backend_log_level', event.target.value)}
              >
                {['INFO', 'DEBUG', 'WARNING', 'ERROR'].map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
              <span>Local DATABASE_URL</span>
              <input
                type="text"
                className="input-field"
                value={settingsDraft.datastores.local_database_url}
                onChange={(event) => updateDatastoreDraft('local_database_url', event.target.value)}
                placeholder="postgresql://pixsim:pixsim123@127.0.0.1:5432/pixsim7"
              />
            </label>
            <label className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
              <span>Local REDIS_URL</span>
              <input
                type="text"
                className="input-field"
                value={settingsDraft.datastores.local_redis_url}
                onChange={(event) => updateDatastoreDraft('local_redis_url', event.target.value)}
                placeholder="redis://localhost:6379/0"
              />
            </label>
          </div>

          <div>
            <p className="section-title">Profile</p>
            {Object.keys(settingsDraft.profiles.available || {}).length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No launcher profiles available.</p>
            ) : (
              <div className="grid gap-4">
                <label className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                  <span>Active profile</span>
                  <select
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={settingsDraft.profiles.active}
                    onChange={(event) => updateProfileDraft(event.target.value)}
                  >
                    {Object.entries(settingsDraft.profiles.available).map(([key, profile]) => (
                      <option key={key} value={key}>
                        {profile.label || key}
                      </option>
                    ))}
                  </select>
                </label>
                {activeProfile ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                      <p className="detail-label">Profile ports</p>
                      <div className="mt-2 grid gap-1 text-xs text-[var(--ink-muted)]">
                        {profilePorts.length === 0 ? (
                          <span>No port overrides.</span>
                        ) : (
                          profilePorts.map(([key, value]) => (
                            <span key={key}>
                              {key}: {value}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                      <p className="detail-label">Profile base URLs</p>
                      <div className="mt-2 grid gap-1 text-xs text-[var(--ink-muted)]">
                        {profileBaseUrls.length === 0 ? (
                          <span>No base URL overrides.</span>
                        ) : (
                          profileBaseUrls.map(([key, value]) => (
                            <span key={key}>
                              {key}: {value}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                      <p className="detail-label">Profile datastores</p>
                      <p className="mt-2 text-xs text-[var(--ink-muted)]">
                        Use local datastores: {activeProfile.use_local_datastores ? 'yes' : 'no'}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div>
            <p className="section-title">Ports</p>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              {(
                [
                  ['backend', 'Backend'],
                  ['frontend', 'Frontend'],
                  ['game_frontend', 'Game UI'],
                  ['game_service', 'Game Service'],
                  ['devtools', 'DevTools'],
                  ['admin', 'Admin'],
                  ['launcher', 'Launcher API'],
                  ['generation_api', 'Generation API'],
                  ['postgres', 'Postgres'],
                  ['redis', 'Redis'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                  <span>{label} port</span>
                  <input
                    type="number"
                    className="input-field"
                    value={settingsDraft.ports[key]}
                    onChange={(event) => updatePortsDraft(key, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="section-title">Base URLs</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {(
                [
                  ['backend', 'Backend'],
                  ['generation', 'Generation'],
                  ['frontend', 'Frontend'],
                  ['game_frontend', 'Game UI'],
                  ['devtools', 'DevTools'],
                  ['admin', 'Admin'],
                  ['launcher', 'Launcher API'],
                  ['analysis', 'Analysis'],
                  ['docs', 'Docs'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                  <span>{label} base URL</span>
                  <input
                    type="text"
                    className="input-field"
                    value={settingsDraft.base_urls[key]}
                    onChange={(event) => updateBaseUrlDraft(key, event.target.value)}
                    placeholder={`http://localhost:${settingsDraft.ports.backend}`}
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="section-title">Advanced overrides</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {(
                [
                  ['database_url', 'DATABASE_URL'],
                  ['redis_url', 'REDIS_URL'],
                  ['secret_key', 'SECRET_KEY'],
                  ['cors_origins', 'CORS_ORIGINS'],
                  ['debug', 'DEBUG'],
                  ['service_base_urls', 'PIXSIM_SERVICE_BASE_URLS'],
                  ['service_timeouts', 'PIXSIM_SERVICE_TIMEOUTS'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm">
                  <span>{label}</span>
                  <input
                    type="text"
                    className="input-field"
                    value={settingsDraft.advanced[key]}
                    onChange={(event) => updateAdvancedDraft(key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-[var(--ink-muted)]">No settings available.</div>
      )}

      <div className="flex flex-wrap gap-3">
        <button className="action-button" onClick={saveSettings} disabled={!settingsDirty || settingsState === 'loading'}>
          Save settings
        </button>
        {settingsDirty ? <span className="text-xs text-[var(--ink-muted)]">Unsaved changes</span> : null}
      </div>
    </div>
  );
}
