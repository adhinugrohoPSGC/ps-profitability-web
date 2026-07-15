'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, Loader2, AlertCircle } from 'lucide-react'

type Mode = 'signin' | 'register'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  function switchMode(m: Mode) {
    setMode(m); setError(''); setMessage('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(''); setMessage('')
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/dashboard')
        router.refresh()
      } else {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, full_name: fullName }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setMessage('Account created — pending admin approval. Sign in once approved.')
        switchMode('signin')
        setPassword('')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
            <TrendingUp className="text-white" size={22} />
          </div>
          <div>
            <p className="font-bold text-slate-800 leading-tight">PS Global</p>
            <p className="text-xs text-slate-500">Profitability Dashboard</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="flex rounded-lg bg-slate-100 p-1 mb-6">
            {(['signin', 'register'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === m ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {m === 'signin' ? 'Sign In' : 'Request Access'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                <input
                  type="text"
                  value={fullName} onChange={e => setFullName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Your full name"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input
                type="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
              <input
                type="password" required
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={14} className="flex-shrink-0" />
                {error}
              </div>
            )}
            {message && (
              <div className="text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                {message}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {mode === 'signin' ? 'Sign In' : 'Request Access'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">PS Global Consulting · Internal Tool</p>
      </div>
    </div>
  )
}
