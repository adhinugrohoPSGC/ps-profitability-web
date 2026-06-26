// app/api/sync-clickup-manual/route.ts
import { NextResponse } from 'next/server'

// Module-level rate limit: 1 call per 60 seconds
let lastCallMs = 0

export async function POST() {
  const now = Date.now()
  if (now - lastCallMs < 60_000) {
    const waitSec = Math.ceil((60_000 - (now - lastCallMs)) / 1000)
    return NextResponse.json({ error: `Rate limited — try again in ${waitSec}s` }, { status: 429 })
  }
  lastCallMs = now

  // Delegate to the main sync route handler directly (same process)
  const { POST: syncHandler } = await import('../sync-clickup/route')
  // Call with an empty request — no CRON_SECRET check when CRON_SECRET is not set
  const fakeReq = new Request('http://localhost/api/sync-clickup', { method: 'POST' })
  return syncHandler(fakeReq as Parameters<typeof syncHandler>[0])
}
