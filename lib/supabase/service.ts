import { createClient } from '@supabase/supabase-js'

// Server-only client (service role — bypasses RLS) for the AUTH Supabase
// project, where user_profiles and role_permissions live. Never import in
// client components.
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase credentials not configured')
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}
