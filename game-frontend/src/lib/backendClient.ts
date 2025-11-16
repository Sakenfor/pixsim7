const computeBackendUrl = (): string => {
  const envUrl = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined
  if (envUrl) return envUrl.replace(/\/$/, '')
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location
    return `${protocol}//${hostname}:8001`
  }
  return 'http://localhost:8001'
}

export const BACKEND_BASE = computeBackendUrl()

