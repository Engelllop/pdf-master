/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: 'rgb(var(--surface) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        toolbar: 'rgb(var(--toolbar) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        hover: 'rgb(var(--hover) / <alpha-value>)',
        active: 'rgb(var(--active) / <alpha-value>)',
        // Estados: versiones apagadas, no los rojos/verdes saturados de Tailwind.
        danger: 'rgb(var(--danger) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)'
      },
      borderRadius: {
        token: 'var(--radius)'
      },
      boxShadow: {
        token: 'var(--shadow)'
      },
      transitionTimingFunction: {
        token: 'var(--ease)'
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        token: 'var(--dur)',
        slow: 'var(--dur-slow)'
      },
      // Escala tipográfica única: seis tamaños arbitrarios entre 9 y 14 px no eran
      // jerarquía, eran ruido. Suelo de 11 px para datos que se leen todo el día.
      fontSize: {
        micro: ['11px', '1.35'],
        mini: ['12px', '1.4'],
        ui: ['13px', '1.45'],
        base: ['14px', '1.5']
      },
      zIndex: {
        // Escala semántica: antes iban literales de z-10 a z-[100] en 25 archivos.
        raised: '10',
        canvas: '20',
        float: '30',
        sticky: '40',
        dropdown: '50',
        overlay: '60',
        modal: '70',
        toast: '80',
        tooltip: '90'
      }
    }
  },
  plugins: []
}
