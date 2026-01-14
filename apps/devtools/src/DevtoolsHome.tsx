import { Link } from 'react-router-dom';

import { Panel } from '@pixsim7/shared.ui';

import { devtoolsRoutes } from './devtoolsRoutes';

export function DevtoolsHome() {
  const visibleRoutes = devtoolsRoutes.filter((route) => !route.hideFromHome);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">PixSim7 DevTools</h1>
          <p className="text-neutral-400">
            Dedicated workspace for debugging, diagnostics, and developer tooling.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {visibleRoutes.map((route) => (
            <Link key={route.path} to={route.path} className="block">
              <Panel className="p-5 h-full border border-neutral-800 bg-neutral-900 hover:border-neutral-700 transition-colors">
                <div className="text-lg font-medium text-neutral-100">
                  {route.label}
                </div>
                {route.description && (
                  <p className="text-sm text-neutral-400 mt-2">
                    {route.description}
                  </p>
                )}
                <div className="mt-4 text-xs uppercase tracking-wide text-neutral-500">
                  {route.path}
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
