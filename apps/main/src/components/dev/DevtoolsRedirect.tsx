import { useEffect, useMemo } from 'react';

import { buildDevtoolsUrl } from '@lib/dev/devtools/devtoolsUrl';

interface DevtoolsRedirectProps {
  preservePath?: boolean;
}

export function DevtoolsRedirect({ preservePath = true }: DevtoolsRedirectProps) {
  const destination = useMemo(() => {
    if (typeof window === 'undefined') {
      return buildDevtoolsUrl('/');
    }
    if (!preservePath) {
      return buildDevtoolsUrl('/');
    }
    const { pathname, search, hash } = window.location;
    return buildDevtoolsUrl(`${pathname}${search}${hash}`);
  }, [preservePath]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.location.replace(destination);
    }
  }, [destination]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-neutral-200">
      <div className="text-sm uppercase tracking-wide text-neutral-500">Redirecting to DevTools</div>
      <a href={destination} className="mt-3 text-blue-400 hover:text-blue-300 underline">
        {destination}
      </a>
    </div>
  );
}
