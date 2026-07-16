'use client'

import { fmtDate } from '@/lib/format'
import { MENUS, ROLES, CONFIGURABLE_ROLES, CAPABILITY_ITEMS } from '@/lib/menus'

import { useState, useEffect } from 'react'

type UserProfile = {
  id: string
  email: string
  full_name: string
  status: 'pending' | 'approved' | 'rejected'
  role: 'admin' | 'manager' | 'user' | 'guest'
  created_at: string
  last_seen_at: string | null
}

const STATUS_STYLE = {
  pending:  'bg-yellow-100 text-yellow-700 border-yellow-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
}

const STATUS_ICON = { pending: '⏳', approved: '✅', rejected: '❌' }

// A user is "online now" if seen within this window (heartbeat pings every 60s)
const ONLINE_MS = 150_000 // 2.5 min

function isOnline(iso: string | null, nowMs: number) {
  return !!iso && nowMs - new Date(iso).getTime() <= ONLINE_MS
}

function relTime(iso: string | null, nowMs: number) {
  if (!iso) return 'never'
  const diff = nowMs - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  const s = Math.floor(diff / 1000)
  if (s < 45) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// ── Role → menu permission matrix (admin sees all; these three are editable) ─
function PermissionsMatrix({ showToast }: { showToast: (m: string) => void }) {
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>> | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    fetch('/api/admin/permissions', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setMatrix(j.matrix ?? null))
      .catch(() => showToast('❌ Failed to load permissions'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle(role: string, key: string) {
    setMatrix((m) => m ? { ...m, [role]: { ...m[role], [key]: !m[role][key] } } : m)
    setDirty(true)
  }

  async function save() {
    if (!matrix) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix }),
      })
      const json = await res.json()
      if (!res.ok) { showToast(`❌ ${json.error}`); return }
      setDirty(false)
      showToast('✅ Menu permissions saved — users see changes on next page load')
    } catch { showToast('❌ Failed to save permissions') }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Menu Permissions by Role</h2>
          <p className="text-xs text-slate-400 mt-0.5">Admins always see every menu. Changes apply when users next load the app.</p>
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving || !matrix}
          className="px-4 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>
      {!matrix ? (
        <p className="text-xs text-slate-400 italic py-4">Loading permissions…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                {MENUS.map((m) => (
                  <th key={m.key} className="py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-50">
                <td className="py-2.5 text-xs font-bold text-purple-600 uppercase">admin</td>
                {MENUS.map((m) => (
                  <td key={m.key} className="py-2.5 text-center text-emerald-600 text-xs font-bold">✓</td>
                ))}
              </tr>
              {CONFIGURABLE_ROLES.map((role) => (
                <tr key={role} className="border-b border-slate-50">
                  <td className="py-2.5 text-xs font-bold text-slate-700 uppercase">{role}</td>
                  {MENUS.map((m) => (
                    <td key={m.key} className="py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={matrix[role]?.[m.key] ?? false}
                        onChange={() => toggle(role, m.key)}
                        aria-label={`${role} can see ${m.label}`}
                        className="w-4 h-4 accent-teal-600 cursor-pointer"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {matrix && (
        <>
          <div className="mt-5 mb-2">
            <h2 className="text-sm font-bold text-slate-800">Feature Permissions by Role</h2>
            <p className="text-xs text-slate-400 mt-0.5">User management and report actions.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                  {CAPABILITY_ITEMS.map((c) => (
                    <th key={c.key} className="py-2 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-50">
                  <td className="py-2.5 text-xs font-bold text-purple-600 uppercase">admin</td>
                  {CAPABILITY_ITEMS.map((c) => (
                    <td key={c.key} className="py-2.5 text-center text-emerald-600 text-xs font-bold">✓</td>
                  ))}
                </tr>
                {CONFIGURABLE_ROLES.map((role) => (
                  <tr key={role} className="border-b border-slate-50">
                    <td className="py-2.5 text-xs font-bold text-slate-700 uppercase">{role}</td>
                    {CAPABILITY_ITEMS.map((c) => (
                      <td key={c.key} className="py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={matrix[role]?.[c.key] ?? false}
                          onChange={() => toggle(role, c.key)}
                          aria-label={`${role}: ${c.label}`}
                          className="w-4 h-4 accent-teal-600 cursor-pointer"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export function AdminUsersClient({ users: initial, callerId, isAdmin = false, canEdit = false, canDelete = false }: {
  users: UserProfile[]; callerId?: string; isAdmin?: boolean; canEdit?: boolean; canDelete?: boolean
}) {
  const [users, setUsers] = useState<UserProfile[]>(initial)
  const [loading, setLoading] = useState<string | null>(null)
  const [roleLoading, setRoleLoading] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [nowMs, setNowMs] = useState<number>(Date.now())

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // Live presence: poll last_seen_at for all users every 20s, and tick the
  // clock every 10s so "active now" / relative times stay current.
  useEffect(() => {
    let alive = true
    async function refresh() {
      try {
        const res = await fetch('/api/presence', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (!alive) return
        const map = new Map<string, string | null>(
          (json.presence ?? []).map((p: { id: string; last_seen_at: string | null }) => [p.id, p.last_seen_at])
        )
        setUsers((prev) => prev.map((u) => map.has(u.id) ? { ...u, last_seen_at: map.get(u.id) ?? null } : u))
        setNowMs(Date.now())
      } catch { /* ignore transient */ }
    }
    refresh()
    const poll = setInterval(refresh, 20_000)
    const tick = setInterval(() => setNowMs(Date.now()), 10_000)
    return () => { alive = false; clearInterval(poll); clearInterval(tick) }
  }, [])

  async function handleAction(userId: string, action: 'approve' | 'reject') {
    setLoading(`${userId}-${action}`)
    try {
      const res = await fetch(`/api/auth/approve/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) { showToast(`❌ ${json.error}`); return }
      setUsers((prev) =>
        prev.map((u) => u.id === userId ? { ...u, status: action === 'approve' ? 'approved' : 'rejected' } : u)
      )
      showToast(`✅ User ${action}d successfully`)
    } catch {
      showToast('❌ Action failed')
    } finally {
      setLoading(null)
    }
  }

  async function handleRole(userId: string, role: string) {
    setRoleLoading(userId)
    try {
      const res = await fetch(`/api/auth/role/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const json = await res.json()
      if (!res.ok) { showToast(`❌ ${json.error}`); return }
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: role as UserProfile['role'] } : u))
      showToast(`✅ Role changed to ${role}`)
    } catch { showToast('❌ Role update failed') }
    finally { setRoleLoading(null) }
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`Delete user "${email}"? This permanently removes their access.`)) return
    setLoading(`${userId}-delete`)
    try {
      const res = await fetch(`/api/auth/users/${userId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) { showToast(`❌ ${json.error}`); return }
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      showToast('✅ User deleted')
    } catch { showToast('❌ Delete failed') }
    finally { setLoading(null) }
  }

  const filtered = filterStatus === 'all' ? users : users.filter((u) => u.status === filterStatus)
  const counts = { all: users.length, pending: users.filter(u => u.status === 'pending').length, approved: users.filter(u => u.status === 'approved').length, rejected: users.filter(u => u.status === 'rejected').length }

  const online = users
    .filter((u) => isOnline(u.last_seen_at, nowMs))
    .sort((a, b) => new Date(b.last_seen_at!).getTime() - new Date(a.last_seen_at!).getTime())

  return (
    <div className="max-w-5xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Active now */}
      <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <h2 className="text-sm font-bold text-emerald-800">
            Active now — {online.length} {online.length === 1 ? 'user' : 'users'}
          </h2>
          <span className="text-[11px] text-emerald-600/70 ml-1">live · refreshes automatically</span>
        </div>
        {online.length === 0 ? (
          <p className="text-xs text-emerald-700/70">No one is currently in the app.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {online.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1.5 bg-white border border-emerald-200 rounded-full pl-2 pr-2.5 py-1 text-xs">
                <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                <span className="font-medium text-slate-800">{u.full_name || u.email}</span>
                <span className="text-slate-400">· {relTime(u.last_seen_at, nowMs)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Role → menu permissions matrix (admins only) */}
      {isAdmin && <PermissionsMatrix showToast={showToast} />}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-xl border px-4 py-3 text-left transition-all ${
              filterStatus === s ? 'ring-2 ring-teal-400 border-teal-300' : 'border-slate-200 hover:border-slate-300'
            } bg-white`}
          >
            <div className="text-2xl font-bold text-slate-900">{counts[s]}</div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1 capitalize">{s}</div>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Registered</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Seen</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-slate-400">No users found.</td>
              </tr>
            )}
            {filtered.map((u) => {
              const onlineNow = isOnline(u.last_seen_at, nowMs)
              return (
              <tr key={u.id} className="border-t border-slate-50 hover:bg-slate-50/60 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="font-medium text-slate-900">{u.full_name}</div>
                  <select
                    value={u.role}
                    disabled={!isAdmin || u.id === callerId || roleLoading === u.id}
                    onChange={(e) => handleRole(u.id, e.target.value)}
                    title={u.id === callerId ? "You can't change your own role" : 'Change role'}
                    className={`mt-1 text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${u.role === 'admin' ? 'text-purple-600 font-semibold' : 'text-slate-600'}`}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-5 py-3.5 text-slate-500">{u.email}</td>
                <td className="px-5 py-3.5 text-slate-400 text-xs font-mono">
                  {fmtDate(u.created_at)}
                </td>
                <td className="px-5 py-3.5 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`inline-flex rounded-full h-2 w-2 ${onlineNow ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className={onlineNow ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                      {onlineNow ? 'Online' : relTime(u.last_seen_at, nowMs)}
                    </span>
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${STATUS_STYLE[u.status]}`}>
                    {STATUS_ICON[u.status]} {u.status}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  {u.role !== 'admin' ? (
                    <div className="flex items-center gap-2">
                      {canEdit && u.status !== 'approved' && (
                        <button
                          onClick={() => handleAction(u.id, 'approve')}
                          disabled={loading === `${u.id}-approve`}
                          className="px-3 py-1 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white rounded-lg transition-colors"
                        >
                          {loading === `${u.id}-approve` ? '…' : '✓ Approve'}
                        </button>
                      )}
                      {canEdit && u.status !== 'rejected' && (
                        <button
                          onClick={() => handleAction(u.id, 'reject')}
                          disabled={loading === `${u.id}-reject`}
                          className="px-3 py-1 text-xs font-semibold bg-red-100 hover:bg-red-200 disabled:opacity-60 text-red-700 rounded-lg transition-colors"
                        >
                          {loading === `${u.id}-reject` ? '…' : '✕ Reject'}
                        </button>
                      )}
                      {canEdit && u.status === 'approved' && (
                        <span className="text-xs text-slate-400">Active</span>
                      )}
                      {canDelete && u.id !== callerId && (
                        <button
                          onClick={() => handleDeleteUser(u.id, u.email)}
                          disabled={loading === `${u.id}-delete`}
                          className="px-3 py-1 text-xs font-semibold bg-slate-100 hover:bg-red-600 hover:text-white disabled:opacity-60 text-slate-600 rounded-lg transition-colors"
                        >
                          {loading === `${u.id}-delete` ? '…' : 'Delete'}
                        </button>
                      )}
                      {!canEdit && !canDelete && <span className="text-xs text-slate-300">view only</span>}
                    </div>
                  ) : <span className="text-xs text-slate-300">—</span>}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
