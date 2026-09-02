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
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        // Solo para el contorno de un control (input, select, textarea, casilla):
        // `border` es hairline decorativo y no llega al 3:1 que pide WCAG 1.4.11.
        'border-control': 'rgb(var(--border-control) / <alpha-value>)',
        // La lámina de PDF: blanco a propósito e igual en los dos temas. Existe para
        // distinguirla de un `bg-white` olvidado.
        paper: 'rgb(var(--paper) / <alpha-value>)',
        'paper-ink': 'rgb(var(--paper-ink) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        // Texto/icono encima de --accent: en claro y en oscuro el relleno es azul, así
        // que `text-toolbar` (el color del panel) dejaba texto ilegible en oscuro.
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
        // Encima del scrim, que es oscuro en los dos temas: `on-accent` no sirve
        // porque en oscuro es tinta.
        'on-scrim': 'rgb(var(--on-scrim) / <alpha-value>)',
        hover: 'rgb(var(--hover) / <alpha-value>)',
        active: 'rgb(var(--active) / <alpha-value>)',
        // Estados: versiones apagadas, no los rojos/verdes saturados de Tailwind.
        danger: 'rgb(var(--danger) / <alpha-value>)',
        // --danger en oscuro es un salmon claro: `text-white` encima daba 2.56:1.
        'on-danger': 'rgb(var(--on-danger) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)'
      },
      borderRadius: {
        'token-sm': 'var(--radius-sm)',
        token: 'var(--radius)',
        'token-lg': 'var(--radius-lg)'
      },
      // Elevación por niveles, no por capricho: sm chips y campos, md menús y
      // popovers, lg modales y hojas, page la lámina de PDF sobre la mesa.
      boxShadow: {
        'token-sm': 'var(--shadow-sm)',
        'token-md': 'var(--shadow-md)',
        'token-lg': 'var(--shadow-lg)',
        page: 'var(--shadow-page)'
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
        base: ['14px', '1.5'],
        // Único tamaño por encima del cuerpo: título de pantalla vacía y de pantalla
        // de error. DESIGN.md ya lo declaraba y nunca existió como token, así que
        // había text-lg, text-xl y text-2xl fuera de escala.
        display: ['20px', '1.25']
      },
      // Escala de capas por ROL, de abajo arriba. Los números son los que la app ya
      // usaba: esto no reordena nada, le pone nombre. La escala anterior se quedaba
      // corta (un solo `modal`) y por eso habían aparecido z-[90], z-[92], z-[93],
      // z-[94], z-[95] y z-[100] a mano en once archivos.
      zIndex: {
        raised: '10',            // cabeceras pegajosas y chips dentro de un panel
        canvas: '20',            // capas sobre el bitmap de la página
        float: '30',             // editores y avisos anclados al documento
        sticky: '40',            // overlays de todo el visor y barras de la selección
        dropdown: '50',          // menús y sus atrapa-clics
        presentation: '50',      // modo presentación: tapa la app entera
        overlay: '60',           // atrapa-clics de menús que salen de barras superpuestas
        'overlay-menu': '61',    // ese menú, encima de su propio atrapa-clics
        modal: '70',             // diálogos del documento (cambios sin guardar)
        dialog: '90',            // modales de herramienta (atajos, imprimir, ajustes)
        sheet: '93',             // hojas a pantalla completa y gestores
        palette: '94',           // paleta de comandos
        prompt: '95',            // pregunta lanzada DESDE otro modal: siempre encima
        toast: '100',            // avisos: visibles pase lo que pase
        tooltip: '110'
      }
    }
  },
  plugins: []
}
