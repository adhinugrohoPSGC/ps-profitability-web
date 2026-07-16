// Single registry of app menus and roles — used by RBAC (DB seed keys must match).
export const MENUS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'upload',    label: 'Upload Templates' },
  { key: 'records',   label: 'Records' },
  { key: 'projects',  label: 'Projects' },
  { key: 'rate-card', label: 'Rate Card' },
  { key: 'reports',   label: 'Reports' },
  { key: 'settings',  label: 'Settings' },
] as const

export type MenuKey = (typeof MENUS)[number]['key']

export const ROLES = ['admin', 'manager', 'user', 'guest'] as const
export type Role = (typeof ROLES)[number]

// Roles whose menu access is configurable (admin always sees everything)
export const CONFIGURABLE_ROLES = ['manager', 'user', 'guest'] as const

// Feature-level capabilities, stored in role_permissions alongside menu keys.
export const CAPABILITY_GROUPS = [
  { group: 'User Management', items: [
    { key: 'users.view',   label: 'View Users' },
    { key: 'users.edit',   label: 'Edit Users' },
    { key: 'users.delete', label: 'Delete Users' },
  ]},
  { group: 'Reports', items: [
    { key: 'report.view',     label: 'View Report Button' },
    { key: 'report.generate', label: 'Generate Report' },
  ]},
] as const

export const CAPABILITY_ITEMS: { key: string; label: string; group: string }[] =
  CAPABILITY_GROUPS.flatMap((g) => g.items.map((i) => ({ key: i.key as string, label: i.label as string, group: g.group as string })))

export const CAPABILITIES: string[] = CAPABILITY_ITEMS.map((i) => i.key)
