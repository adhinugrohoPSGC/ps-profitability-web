'use client'

import { useEffect } from 'react'

// Pings /api/presence so the app knows this user is currently active.
// Runs on mount, every 60s, and whenever the tab becomes visible again.
export function PresenceHeartbeat() {
  useEffect(() => {
    const ping = () => { fetch('/api/presence', { method: 'POST' }).catch(() => {}) }
    ping()
    const t = setInterval(ping, 60_000)
    const onVis = () => { if (document.visibilityState === 'visible') ping() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  return null
}
