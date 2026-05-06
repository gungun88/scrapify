import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-soft': 'var(--surface-soft)',
        ink: 'var(--text)',
        'ink-muted': 'var(--text-muted)',
        'ink-subtle': 'var(--text-subtle)',
        line: 'var(--border)',
        'line-strong': 'var(--border-strong)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        danger: 'var(--danger)',
        success: 'var(--success)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
      },
    },
  },
  plugins: [],
}

export default config
