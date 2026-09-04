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
        // Terciario. NO es texto: separadores, iconos apagados, glifos
        // deshabilitados. Un placeholder o una etiqueta van en `muted`, que sí
        // cumple AA sobre panel (3.25:1 contra 5.97:1).
        faint: 'rgb(var(--faint) / <alpha-value>)',
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
      // Cinco radios por rol: chip · icono · control · panel · modal. Tres no
      // llegaban: el mismo valor servía para un kbd de 18px y para un modal.
      borderRadius: {
        'token-xs': 'var(--radius-xs)',
        'token-sm': 'var(--radius-sm)',
        token: 'var(--radius)',
        'token-lg': 'var(--radius-lg)',
        'token-xl': 'var(--radius-xl)'
      },
      // Elevación por niveles, no por capricho: sm chips y campos, md menús y
      // popovers, lg modales y hojas, page la lámina de PDF sobre la mesa.
      boxShadow: {
        'token-sm': 'var(--shadow-sm)',
        'token-md': 'var(--shadow-md)',
        'token-lg': 'var(--shadow-lg)',
        page: 'var(--shadow-page)'
      },
      // Alturas del ritmo vertical: h-row en una fila de lista, h-chrome en una
      // barra, h-status en la de estado. Escritas a mano eran h-8/h-9/h-10 sin
      // criterio compartido.
      spacing: {
        row: 'var(--row)',
        chrome: 'var(--chrome-row)',
        status: 'var(--status-row)'
      },
      // `token` es el resorte crítico y es el defecto. `token-out` para lo que
      // solo se va, `token-bounce` SOLO para lo que traía inercia.
      transitionTimingFunction: {
        token: 'var(--ease)',
        'token-out': 'var(--ease-out)',
        'token-bounce': 'var(--ease-bounce)'
      },
      transitionDuration: {
        // La respuesta al press: se siente, no se ve.
        instant: 'var(--dur-instant)',
        fast: 'var(--dur-fast)',
        token: 'var(--dur)',
        slow: 'var(--dur-slow)'
      },
      // Escala tipográfica única: seis tamaños arbitrarios entre 9 y 14 px no eran
      // jerarquía, eran ruido. Suelo de 11 px para datos que se leen todo el día.
      // El tracking es ESPECÍFICO por tamaño —uno solo está mal en algún sitio—:
      // negativo al crecer (a 20px las letras se leen sueltas) y positivo al
      // encogerse. El interlineado va al revés que el tamaño.
      fontSize: {
        micro: ['11px', { lineHeight: '1.3', letterSpacing: '0.006em' }],
        mini: ['12px', { lineHeight: '1.35', letterSpacing: '0em' }],
        ui: ['13px', { lineHeight: '1.38', letterSpacing: '-0.003em' }],
        base: ['14px', { lineHeight: '1.45', letterSpacing: '-0.006em' }],
        // Peldaño intermedio que faltaba: cabecera de panel y de diálogo. Sin él,
        // un título de panel solo podía ser cuerpo en negrita o el display de 20px.
        head: ['15px', { lineHeight: '1.3', letterSpacing: '-0.011em' }],
        // Único tamaño por encima de la cabecera: título de modal, de pantalla
        // vacía y de pantalla de error.
        display: ['20px', { lineHeight: '1.2', letterSpacing: '-0.02em' }]
      },
      // Versalita de sección (MARCADO, VISTA, ARCHIVOS): la única que abre el
      // tracking de verdad, porque en mayúsculas apretadas no se lee.
      letterSpacing: {
        section: '0.06em'
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
