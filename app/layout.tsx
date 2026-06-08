import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PS Profitability Dashboard',
  description: 'Project profitability tracking for PS Global Consulting',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
