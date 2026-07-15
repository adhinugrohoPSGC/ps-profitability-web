'use client'
import { useState } from 'react'
import { CheckCircle, XCircle, Clock, Trash2 } from 'lucide-react'

type UserProfile = {
  id: string
  email: string
  full_name: string | null
  status: 'pending' | 'approved' | 'rejected'
  role: 'admin' | 'user'
  created_at: string
}

const STATUS_STYLE = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function AdminUsersClient({ users: initial }: { users: UserProfile[] }) {
  const [users, setUsers] = useState(initial)
  const [loading, setLoading] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  async function removeUser(id: string) {
    setLoading(id); setMsg(''); setConfirmRemove(null)
    try {
      const res = await fetch(`/api/auth/remove/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(prev => prev.filter(u => u.id !== id))
      setMsg('User removed.')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(null)
    }
  }

  async function updateStatus(id: string, status: 'approved' | 'rejected') {
    setLoading(id); setMsg('')
    try {
      const res = await fetch(`/api/auth/approve/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status } : u))
      setMsg(`User ${status}.`)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <p className="text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">{msg}</p>
      )}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">User</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{u.full_name || '—'}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  {u.role === 'admin' ? (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                      admin
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">user</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[u.status]}`}>
                    {u.status === 'pending'  && <Clock size={11} />}
                    {u.status === 'approved' && <CheckCircle size={11} />}
                    {u.status === 'rejected' && <XCircle size={11} />}
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    {u.status === 'pending' && (
                      <>
                        <button
                          disabled={loading === u.id}
                          onClick={() => updateStatus(u.id, 'approved')}
                          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          disabled={loading === u.id}
                          onClick={() => updateStatus(u.id, 'rejected')}
                          className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-600 text-xs font-medium rounded-lg transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {confirmRemove === u.id ? (
                      <>
                        <span className="text-xs text-slate-500">Remove?</span>
                        <button
                          disabled={loading === u.id}
                          onClick={() => removeUser(u.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmRemove(null)}
                          className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        disabled={loading === u.id}
                        onClick={() => setConfirmRemove(u.id)}
                        title="Remove user"
                        className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
