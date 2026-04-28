import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        brand: 'var(--brand)',
        'brand-light': 'var(--brand-light)',
        'brand-mid': 'var(--brand-mid)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        border: 'var(--border)',
        border2: 'var(--border2)',
        text1: 'var(--text)',
        text2: 'var(--text2)',
        text3: 'var(--text3)',
        green: 'var(--green)',
        'green-bg': 'var(--green-bg)',
        'green-text': 'var(--green-text)',
        red: 'var(--red)',
        'red-bg': 'var(--red-bg)',
        'red-text': 'var(--red-text)',
        amber: 'var(--amber)',
        'amber-bg': 'var(--amber-bg)',
        'amber-text': 'var(--amber-text)',
        blue: 'var(--blue)',
        'blue-bg': 'var(--blue-bg)',
        'blue-text': 'var(--blue-text)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius-sm)',
      },
      width: {
        sidebar: 'var(--sidebar-w)',
      },
      height: {
        topbar: 'var(--topbar-h)',
      },
      boxShadow: {
        surface: '0 1px 0 rgba(0,0,0,0.02), 0 12px 30px rgba(26,24,36,0.05)',
      },
    },
  },
  plugins: [],
}

export default config
