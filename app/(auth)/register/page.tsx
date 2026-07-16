'use client'
import { useState } from 'react'
import Link from 'next/link'
import { TrendingUp, Loader2, AlertCircle, CheckCircle } from 'lucide-react'

export default function RegisterPage() {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password, full_name: form.full_name }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Registration failed'); return }
      setSuccess(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-teal-50 border border-teal-200 mb-5">
          <CheckCircle className="text-teal-600" size={26} />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Request Submitted</h2>
        <p className="text-sm text-slate-500 mb-6">
          Your account has been created and is awaiting admin approval. You&apos;ll be able to log in once an administrator approves your request.
        </p>
        <Link
          href="/login"
          className="inline-block bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
        >
          Back to Login
        </Link>
      </div>
    </div>
  )

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500'

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
            <TrendingUp className="text-white" size={22} />
          </div>
          <div>
            <p className="font-bold text-slate-800 leading-tight">Request Access</p>
            <p className="text-xs text-slate-500">Submit your details for admin approval</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
              <input type="text" required value={form.full_name}
                onChange={e => set('full_name', e.target.value)} placeholder="Your full name" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input type="email" required value={form.email}
                onChange={e => set('email', e.target.value)} placeholder="you@company.com" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
              <input type="password" required autoComplete="new-password" value={form.password}
                onChange={e => set('password', e.target.value)} placeholder="Min. 8 characters" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Confirm Password</label>
              <input type="password" required autoComplete="new-password" value={form.confirm}
                onChange={e => set('confirm', e.target.value)} placeholder="Repeat password" className={inputCls} />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Request Access
            </button>
          </form>

          <p className="text-center text-slate-500 text-sm mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-teal-600 hover:text-teal-700 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
