-- User Management Kit migration — run in Supabase SQL Editor
-- Safe to re-run. Upgrades the existing user_profiles table and adds role_permissions.

-- 1. user_profiles: ensure table + new columns
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  role text NOT NULL DEFAULT 'user',
  last_seen_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';

-- 2. Extend role check to the 4-role model
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role = ANY (ARRAY['admin','manager','user','guest']));
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_status_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_status_check
  CHECK (status = ANY (ARRAY['pending','approved','rejected']));

-- 3. RLS: users may read ONLY their own profile (needed by the proxy auth gate
--    and the login status check); all writes go through the service-role key.
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read own profile" ON public.user_profiles;
CREATE POLICY "read own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

-- 4. Role → permission matrix (menus + capabilities; admin implicit, not stored)
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role text NOT NULL CHECK (role = ANY (ARRAY['manager','user','guest'])),
  menu_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, menu_key)
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
-- (no policies: only the service-role key — i.e. the server — can touch it)

-- 5. Seed: menu visibility (keys match lib/menus.ts)
INSERT INTO public.role_permissions (role, menu_key, allowed) VALUES
  ('manager','dashboard',true),('manager','upload',true),('manager','records',true),
  ('manager','projects',true),('manager','rate-card',true),('manager','reports',true),
  ('manager','settings',true),
  ('user','dashboard',true),('user','upload',true),('user','records',true),
  ('user','projects',true),('user','rate-card',true),('user','reports',true),
  ('user','settings',false),
  ('guest','dashboard',true),('guest','upload',false),('guest','records',false),
  ('guest','projects',false),('guest','rate-card',false),('guest','reports',false),
  ('guest','settings',false)
ON CONFLICT (role, menu_key) DO NOTHING;

-- 6. Seed: feature capabilities
INSERT INTO public.role_permissions (role, menu_key, allowed) VALUES
  ('manager','users.view',true),('manager','users.edit',true),('manager','users.delete',false),
  ('manager','report.view',true),('manager','report.generate',true),
  ('user','users.view',false),('user','users.edit',false),('user','users.delete',false),
  ('user','report.view',true),('user','report.generate',true),
  ('guest','users.view',false),('guest','users.edit',false),('guest','users.delete',false),
  ('guest','report.view',false),('guest','report.generate',false)
ON CONFLICT (role, menu_key) DO NOTHING;

-- 7. Bootstrap the first admin (run AFTER registering through the app)
-- UPDATE public.user_profiles SET role = 'admin', status = 'approved'
-- WHERE email = 'adhi.nugroho@point-star.com';
