import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Suspense fallback={<div className="text-slate-400 text-sm">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
