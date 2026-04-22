import * as http from 'node:http';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Backends are resolved from env vars the launcher exports from service manifests:
//   BACKEND_PORT          — main-api        (services/main-api, default 8000)
//   GENERATION_API_PORT   — generation-api  (services/generation-api, default 8001)
//   PROXY_BACKEND_HOST    — override host for both (default 127.0.0.1)
const PROXY_HOST = process.env.PROXY_BACKEND_HOST || '127.0.0.1';
const MAIN_API_PORT = Number(process.env.BACKEND_PORT) || 8000;
const GEN_API_PORT = Number(process.env.GENERATION_API_PORT) || 8001;
const MAIN_API_TARGET = `http://${PROXY_HOST}:${MAIN_API_PORT}`;
const GEN_API_TARGET = `http://${PROXY_HOST}:${GEN_API_PORT}`;

// ─── Liveness-gated failover proxy ─────────────────────────────────────────
// Active /health probe drives a per-target "down" flag. A dev plugin streams
// requests straight to the live target, so body methods (POST/PATCH/PUT)
// aren't blocked by a consumed-body retry when the primary is down.

const PROBE_INTERVAL_MS = 5_000;
const PROBE_TIMEOUT_MS = 1_500;
// Applied both to the initial "unknown → assume down" state and to any
// request-time error that beats the probe cycle.
const DOWN_COOLDOWN_MS = 8_000;

type ProbeState = { downUntil: number };
const probeStates = new Map<string, ProbeState>();

function getProbeState(primary: string): ProbeState {
  let state = probeStates.get(primary);
  if (state) return state;
  // Start tripped — first probe decides whether we ever try the primary.
  state = { downUntil: Date.now() + DOWN_COOLDOWN_MS };
  probeStates.set(primary, state);
  startProbe(primary, state);
  return state;
}

function startProbe(primary: string, state: ProbeState) {
  const url = new URL(primary);
  const host = url.hostname;
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
  const agent = new http.Agent({ keepAlive: false });

  const run = () => {
    const req = http.request({
      hostname: host,
      port,
      method: 'HEAD',
      path: '/health',
      timeout: PROBE_TIMEOUT_MS,
      agent,
    }, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode < 500) {
        state.downUntil = 0;
      } else {
        state.downUntil = Date.now() + DOWN_COOLDOWN_MS;
      }
    });
    req.on('error', () => { state.downUntil = Date.now() + DOWN_COOLDOWN_MS; });
    req.on('timeout', () => {
      state.downUntil = Date.now() + DOWN_COOLDOWN_MS;
      req.destroy();
    });
    req.end();
  };

  run();
  setInterval(run, PROBE_INTERVAL_MS).unref();
}

// Stream a request straight through to `target`. Handles bidirectional pipes
// and swallows socket errors that would otherwise crash the dev server.
function forward(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  target: string,
  agent: http.Agent,
) {
  const url = new URL(target);
  // Connect strips the mount prefix from `req.url` when middleware is mounted
  // with a route. We need the full path for the upstream — `req.originalUrl`
  // is preserved by Connect exactly for this case.
  const upstreamPath =
    (req as http.IncomingMessage & { originalUrl?: string }).originalUrl ??
    req.url;
  const out = http.request({
    hostname: url.hostname,
    port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: upstreamPath,
    headers: { ...req.headers, host: url.host },
    agent,
  }, (upstream) => {
    upstream.on('error', () => {});
    if (res.headersSent || res.writableEnded) { upstream.resume(); return; }
    try {
      res.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(res);
    } catch {
      upstream.resume();
    }
  });
  out.on('error', (err) => {
    console.error(`[vite-proxy] forward to ${target} failed: ${(err as NodeJS.ErrnoException).code ?? ''} ${err.message}`);
    if (res.headersSent || res.writableEnded) return;
    try {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Upstream ${target} unreachable: ${err.message}`);
    } catch {
      // Response already torn down; nothing useful to report.
    }
  });
  // Intentionally no per-socket listener: with keepAlive pooling, attaching
  // on every forward() leaks listeners on reused sockets (hits
  // MaxListenersExceededWarning). out.on('error') handles in-flight errors;
  // uncaughtException at the bottom of this file catches idle-pool resets.
  out.setTimeout(30_000, () => out.destroy(new Error('forward timeout')));
  req.on('error', () => {});
  req.pipe(out);
}

interface FailoverRoute {
  prefix: string;
  primary: string;
  fallback: string;
}

function failoverProxyPlugin(routes: FailoverRoute[]): Plugin {
  // keep-alive: false on purpose. Pooled sockets that the backend has
  // already closed cause intermittent "forward timeout" hangs when reused.
  // Dev traffic is low-volume; a fresh TCP handshake per request is cheap.
  const forwardAgent = new http.Agent({ keepAlive: false });
  return {
    name: 'pixsim-failover-proxy',
    configureServer(server) {
      // Prepend to the middleware stack so our failover routes match BEFORE
      // vite's built-in proxy middleware — otherwise the generic `/api` rule
      // in server.proxy catches `/api/v1/generations` and routes it to
      // main-api regardless of gen-api status.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stack = (server.middlewares as unknown as { stack: any[] }).stack;
      for (const { prefix, primary, fallback } of routes) {
        const probe = getProbeState(primary);
        const handle = (req: http.IncomingMessage, res: http.ServerResponse) => {
          const target = Date.now() < probe.downUntil ? fallback : primary;
          forward(req, res, target, forwardAgent);
        };
        stack.unshift({ route: prefix, handle });
      }
    },
  };
}

// Dev-server resilience: swallow socket-level errors that would otherwise
// kill the node process. Real bugs still print; the server keeps running.
if (!(process as unknown as { _pixsimProxyHandler?: boolean })._pixsimProxyHandler) {
  (process as unknown as { _pixsimProxyHandler?: boolean })._pixsimProxyHandler = true;
  process.on('uncaughtException', (err) => {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EPIPE' || code === 'ETIMEDOUT') {
      console.error(`[vite-proxy] swallowed ${code}: ${err.message}`);
      return;
    }
    throw err;
  });
}

// Failover paths: these hit gen-api when it's up, main-api otherwise. Vite's
// built-in proxy is bypassed for these — our plugin middleware handles them
// end-to-end so body-method retries aren't blocked by a consumed body.
const FAILOVER_ROUTES: FailoverRoute[] = [
  { prefix: '/api/v1/generations', primary: GEN_API_TARGET, fallback: MAIN_API_TARGET },
  { prefix: '/api/v1/prompts',     primary: GEN_API_TARGET, fallback: MAIN_API_TARGET },
  { prefix: '/api/v1/providers',   primary: GEN_API_TARGET, fallback: MAIN_API_TARGET },
  { prefix: '/api/v1/accounts',    primary: GEN_API_TARGET, fallback: MAIN_API_TARGET },
  // Auth routes to main-api directly — gen-api re-imports the same auth
  // router, but main-api is assumed up in all dev scenarios.
  { prefix: '/api/v1/users',       primary: GEN_API_TARGET, fallback: MAIN_API_TARGET },
  { prefix: '/api/v1/automation',  primary: GEN_API_TARGET, fallback: MAIN_API_TARGET },
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      projects: [path.resolve(__dirname, './tsconfig.app.json')],
    }),
    failoverProxyPlugin(FAILOVER_ROUTES),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // Bind to all interfaces so LAN / ZeroTier devices (phone, tablet) can
    // reach the dev server. Vite prints both localhost and network URLs on
    // startup.
    host: true,
    // COOP + COEP enable crossOriginIsolated, which unlocks
    // performance.measureUserAgentSpecificMemory() for native-memory
    // diagnostics.  credentialless lets authenticated media fetches
    // succeed without requiring CORP headers on every backend response.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    // Static routes (no failover) still go through vite's built-in proxy.
    // Failover paths are handled by failoverProxyPlugin above.
    // `ws: true` on `/api` forwards WebSocket upgrades for /api/v1/ws/* to
    // main-api — the `/api/v1/ws/generations` feed that drives the Live/
    // Offline badge on the gallery page goes through this path.
    proxy: {
      '/api':     { target: MAIN_API_TARGET, changeOrigin: true, ws: true },
      '/health':  { target: MAIN_API_TARGET, changeOrigin: true },
      '/ws':      { target: MAIN_API_TARGET, changeOrigin: true, ws: true },
      '/plugins': { target: MAIN_API_TARGET, changeOrigin: true },
    },
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/pixsim7/backend/**',
        '**/.claude/worktrees/**',
        '**/dist/**',
        '**/__pycache__/**',
      ],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: path.resolve(__dirname, 'src/test/vitest.setup.ts'),
    include: ['src/**/__tests__/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    reporters: process.env.PIXSIM_TEST_SUBMIT
      ? ['default', [path.resolve(__dirname, '../../tools/vitest-reporter/pixsim-reporter.ts'), {}]]
      : ['default'],
  },
});
