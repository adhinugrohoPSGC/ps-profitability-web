import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './contexts/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: '#0f172a',
        'sidebar-hover': '#1e293b',
        accent: '#0d9488',
      },
    },
  },
  plugins: [],
}
export default config
