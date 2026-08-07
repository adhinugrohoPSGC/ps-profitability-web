import type { Config } from 'tailwindcss'

// The app's accent is written as `teal-*` in ~200 places. Rather than rewrite
// every call site, the teal scale itself is remapped to the fresh emerald
// green of the current design direction — change these values to re-skin the
// whole app.
const ACCENT = {
  50: '#ecfdf5',
  100: '#d1fae5',
  200: '#a7f3d0',
  300: '#6ee7b7',
  400: '#34d399',
  500: '#10b981',
  600: '#059669',
  700: '#047857',
  800: '#065f46',
  900: '#064e3b',
  950: '#022c22',
}

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './contexts/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: ACCENT,
        accent: ACCENT[600],
        'accent-soft': ACCENT[50],
        sidebar: '#ffffff',
        'sidebar-hover': '#f4f6f5',
        canvas: '#f2f5f3',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
        'card-hover': '0 4px 12px rgba(16, 24, 40, 0.08)',
      },
    },
  },
  plugins: [],
}
export default config
