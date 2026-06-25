/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: 'var(--surface)',
        panel: 'var(--panel)',
        toolbar: 'var(--toolbar)',
        border: 'var(--border)',
        fg: 'var(--fg)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        hover: 'var(--hover)',
        active: 'var(--active)'
      },
      borderRadius: {
        token: 'var(--radius)'
      },
      boxShadow: {
        token: 'var(--shadow)'
      }
    }
  },
  plugins: []
}
