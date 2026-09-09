import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import {
  MIN_BOX_PX, getAnnotationBounds, getInteractiveBounds, renderAnnotation, strokePropsFor,
} from './annotationRender'
import { COUNT_DEFAULT, type Annotation } from '../../store/usePdfStore'

// 559 líneas y ni un test, y es el módulo del que dependen a la vez lo que se DIBUJA
// (cada marca de cada plano) y lo que se puede AGARRAR: `getAnnotationBounds` es lo
// que usan la caja de selección, la barra de propiedades y el arrastre para saber qué
// marca hay debajo del cursor. Cuando a un tipo le falta su `case`, esa marca se
// dibuja pero no se puede seleccionar ni mover — ya pasó con las cotas y las firmas,
// y los comentarios del archivo lo cuentan.

// Escalas DISTINTAS por eje a propósito: con sx === sy, confundir uno por el otro
// pasa desapercibido. Aquí sx = 2 y sy = 1.5.
const pd = { width: 800, height: 300, originalWidth: 400, originalHeight: 200 }
const toScreen = (x: number, y: number) => ({ x: x * 2, y: y * 1.5 })

const ann = (over: Partial<Annotation> & { type: Annotation['type'] }): Annotation => ({
  id: 'a1', page: 0, x: 10, y: 20, color: '#ff0000', ...over,
} as Annotation)

const bounds = (a: Annotation) => getAnnotationBounds(a, pd, toScreen)

describe('strokePropsFor', () => {
  it('el grosor va en puntos PDF y escala con el zoom, como la página', () => {
    // Si no escalara, un trazo de 2 pt se vería igual de fino al 400 % que al 50 %,
    // y dejaría de coincidir con lo que se acaba embebiendo en el PDF.
    expect(strokePropsFor(ann({ type: 'rect', lineWidth: 3 }), 2).strokeWidth).toBe(6)
    expect(strokePropsFor(ann({ type: 'rect', lineWidth: 3 }), 0.5).strokeWidth).toBe(1.5)
  })

  it('sin grosor propio usa el que le pasen por defecto', () => {
    expect(strokePropsFor(ann({ type: 'rect' }), 1).strokeWidth).toBe(2)
    expect(strokePropsFor(ann({ type: 'signature' }), 1, 3).strokeWidth).toBe(3)
  })

  it('sólido no pone patrón de guiones', () => {
    expect(strokePropsFor(ann({ type: 'rect' }), 1).strokeDasharray).toBeUndefined()
    expect(strokePropsFor(ann({ type: 'rect', lineStyle: 'solid' }), 1).strokeDasharray).toBeUndefined()
  })

  it('rayado y punteado escalan su patrón con el trazo', () => {
    const rayado = strokePropsFor(ann({ type: 'rect', lineWidth: 2, lineStyle: 'dashed' }), 1)
    expect(rayado.strokeDasharray).toBe('6 4')
    const punteado = strokePropsFor(ann({ type: 'rect', lineWidth: 2, lineStyle: 'dotted' }), 1)
    // El punto es una raya muy corta, con un mínimo para que no desaparezca.
    expect(punteado.strokeDasharray).toBe('0.5 4')
  })

  it('la opacidad viaja tal cual, y sin ella es 1', () => {
    expect(strokePropsFor(ann({ type: 'rect', opacity: 0.4 }), 1).opacity).toBe(0.4)
    expect(strokePropsFor(ann({ type: 'rect' }), 1).opacity).toBe(1)
  })
})

describe('bounds de las marcas con caja (rect y familia)', () => {
  it.each(['rect', 'highlight', 'circle', 'check', 'cross', 'star', 'cloud'] as const)(
    '%s escala ancho por sx y alto por sy', (type) => {
      expect(bounds(ann({ type, width: 100, height: 50 }))).toEqual({ x: 20, y: 30, w: 200, h: 75 })
    })

  it('una caja sin tamaño no revienta: sale de ancho y alto cero', () => {
    expect(bounds(ann({ type: 'rect' }))).toEqual({ x: 20, y: 30, w: 0, h: 0 })
  })
})

describe('bounds del marcado de texto', () => {
  it.each(['underline', 'strikethrough'] as const)('%s sin alto usa 16 pt', (type) => {
    expect(bounds(ann({ type, width: 100 }))).toEqual({ x: 20, y: 30, w: 200, h: 24 })
  })
})

describe('bounds de un cuadro de texto', () => {
  it('con tamaño propio, ese', () => {
    expect(bounds(ann({ type: 'text', width: 100, height: 40 }))).toEqual({ x: 20, y: 30, w: 200, h: 60 })
  })

  it('sin tamaño, lo estima del cuerpo de la letra y del largo del texto', () => {
    // Un cuadro de texto recién puesto no tiene ancho ni alto todavía, y sin una
    // estimación su caja de selección sale de 0×0: no habría dónde pinchar.
    const b = bounds(ann({ type: 'text', text: 'Nivel de piso terminado', fontSize: 20 }))!
    expect(b.w).toBeGreaterThan(0)
    expect(b.h).toBeGreaterThan(0)
    // Más texto, más ancho.
    const corto = bounds(ann({ type: 'text', text: 'Ok', fontSize: 20 }))!
    expect(b.w).toBeGreaterThan(corto.w)
  })

  it('con un texto minúsculo mantiene un ancho mínimo utilizable', () => {
    const b = bounds(ann({ type: 'text', text: 'a', fontSize: 8 }))!
    expect(b.w).toBeGreaterThanOrEqual(80 * 2)
  })
})

describe('bounds de una nota', () => {
  it('sin tamaño usa el del icono (28 pt)', () => {
    expect(bounds(ann({ type: 'note' }))).toEqual({ x: 20, y: 30, w: 56, h: 42 })
  })
})

describe('bounds de una burbuja de conteo', () => {
  it('va CENTRADA en su punto, no anclada arriba a la izquierda', () => {
    // El resto de las marcas guardan su esquina; el conteo guarda su centro. Tratarlo
    // como las demás desplazaba la caja de selección medio diámetro.
    const b = bounds(ann({ type: 'count', width: 20 }))!
    expect(b.x).toBe(20 - 20)   // centro 20 menos el radio (10 pt × sx = 20)
    expect(b.w).toBe(40)
  })

  it('una marca vieja sin diámetro usa el tamaño de siempre', () => {
    // Las de antes de que el tamaño fuera elegible no llevan `width`: tienen que
    // seguir midiendo lo mismo al abrirlas con una versión nueva.
    const b = bounds(ann({ type: 'count' }))!
    expect(b.w).toBe(COUNT_DEFAULT * 2)  // radio COUNT_DEFAULT/2, por sx = 2
  })
})

describe('bounds de una imagen', () => {
  it('sin tamaño usa 200×150', () => {
    expect(bounds(ann({ type: 'image' }))).toEqual({ x: 20, y: 30, w: 400, h: 225 })
  })
})

describe('bounds de las marcas de dos puntos (línea, flecha, cota)', () => {
  it.each(['line', 'arrow', 'measure_distance'] as const)('%s da la caja entre sus dos extremos', (type) => {
    expect(bounds(ann({ type, width: 50, height: 40 }))).toEqual({ x: 20, y: 30, w: 100, h: 60 })
  })

  it.each(['line', 'arrow', 'measure_distance'] as const)(
    '%s dibujada hacia arriba o hacia la izquierda tiene caja POSITIVA', (type) => {
      // Con ancho o alto negativos, una caja sin normalizar sale invertida y el
      // impacto del cursor no acierta nunca: la marca se ve y no se puede agarrar.
      const b = bounds(ann({ type, x: 100, y: 100, width: -50, height: -40 }))!
      expect(b.w).toBe(100)
      expect(b.h).toBe(60)
      expect(b.x).toBe(100)   // el extremo de menor x, en pantalla
      expect(b.y).toBe(90)
    })

  it('una cota NO devuelve null: sin su caso no se podía ni seleccionar ni mover', () => {
    expect(bounds(ann({ type: 'measure_distance', width: 30, height: 0 }))).not.toBeNull()
  })
})

describe('bounds de una llamada', () => {
  it('normaliza el tamaño negativo', () => {
    const b = bounds(ann({ type: 'callout', x: 100, y: 100, width: -40, height: -20 }))!
    expect(b).toEqual({ x: 200 - 80, y: 150 - 30, w: 80, h: 30 })
  })
})

describe('bounds de las marcas por puntos (trazo, polígono, área, firma)', () => {
  const puntos = [{ x: 10, y: 10 }, { x: 60, y: 30 }, { x: 30, y: 80 }]

  it.each(['draw', 'polygon', 'measure_area', 'signature', 'measure_perimeter'] as const)(
    '%s da la caja que envuelve a todos sus puntos', (type) => {
      expect(bounds(ann({ type, points: puntos }))).toEqual({ x: 20, y: 15, w: 100, h: 105 })
    })

  it.each(['draw', 'measure_area', 'signature'] as const)(
    '%s sin puntos devuelve null en vez de una caja falsa', (type) => {
      expect(bounds(ann({ type, points: [] }))).toBeNull()
      expect(bounds(ann({ type }))).toBeNull()
    })

  it('una firma y un área NO devuelven null con puntos: se podían ver y no agarrar', () => {
    expect(bounds(ann({ type: 'signature', points: puntos }))).not.toBeNull()
    expect(bounds(ann({ type: 'measure_area', points: puntos }))).not.toBeNull()
  })
})

describe('un tipo desconocido', () => {
  it('devuelve null en vez de una caja inventada', () => {
    expect(bounds(ann({ type: 'inventado' as Annotation['type'] }))).toBeNull()
  })
})

describe('getInteractiveBounds', () => {
  it('una marca de tamaño normal pasa igual', () => {
    const a = ann({ type: 'rect', width: 100, height: 50 })
    expect(getInteractiveBounds(a, pd, toScreen)).toEqual(bounds(a))
  })

  it('una cota horizontal (alto 0) se infla al mínimo, CENTRADA sobre la real', () => {
    // Sin inflar no hay dónde pinchar: el lado mide 0 px.
    const b = getInteractiveBounds(ann({ type: 'line', width: 50, height: 0 }), pd, toScreen)!
    expect(b.h).toBe(MIN_BOX_PX)
    expect(b.w).toBe(100)
    // Centrada: la caja sube la mitad del mínimo, no se apoya en el borde.
    expect(b.y).toBe(30 - MIN_BOX_PX / 2)
  })

  it('una línea vertical (ancho 0) también', () => {
    const b = getInteractiveBounds(ann({ type: 'line', width: 0, height: 50 }), pd, toScreen)!
    expect(b.w).toBe(MIN_BOX_PX)
    expect(b.x).toBe(20 - MIN_BOX_PX / 2)
  })

  it('propaga el null de una marca sin geometría', () => {
    expect(getInteractiveBounds(ann({ type: 'draw' }), pd, toScreen)).toBeNull()
  })
})

describe('renderAnnotation', () => {
  const pintar = (a: Annotation, opts = {}) =>
    render(<svg>{renderAnnotation(a, pd, toScreen, opts)}</svg>)

  it('dibuja un rectángulo con el color y la geometría escalada', () => {
    const { container } = pintar(ann({ type: 'rect', width: 100, height: 50, color: '#00ff00' }))
    const r = container.querySelector('rect')!
    expect(r.getAttribute('stroke')).toBe('#00ff00')
    expect(Number(r.getAttribute('width'))).toBe(200)
    expect(Number(r.getAttribute('height'))).toBe(75)
  })

  it.each([
    ['rect', 'rect'], ['circle', 'ellipse'], ['highlight', 'rect'],
    ['line', 'line'], ['draw', 'path'], ['polygon', 'path'], ['signature', 'path'],
  ] as const)('%s produce un %s en el SVG', (type, tag) => {
    const a = ann({
      type, width: 40, height: 30,
      // Tres puntos: un poligono con menos de tres no es un poligono y no se dibuja.
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }],
    })
    expect(pintar(a).container.querySelector(tag)).not.toBeNull()
  })

  it('un poligono de menos de tres puntos no se dibuja', () => {
    const a = ann({ type: 'polygon', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] })
    expect(pintar(a).container.querySelector('path')).toBeNull()
  })

  it('un clic sobre la marca la selecciona y corta la propagacion al fondo', () => {
    // Sin el stopPropagation el clic llega también al SVG, que deselecciona: la marca
    // quedaba seleccionada y deseleccionada en el mismo gesto. Se comprueba sobre el
    // evento sintético y no con un listener en el contenedor, porque React delega
    // TODOS sus eventos en la raíz: un listener nativo ahí se dispara igual.
    let cortado: boolean | null = null
    const onSelect = vi.fn((e: React.MouseEvent) => { cortado = e.isPropagationStopped() })
    const { container } = pintar(ann({ type: 'rect', width: 100, height: 50 }), { onSelect })

    fireEvent.click(container.querySelector('rect')!)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(cortado).toBe(true)
  })

  it('en modo vista previa no hay clic: todavía no es una marca', () => {
    const onSelect = vi.fn()
    const { container } = pintar(ann({ type: 'rect', width: 100, height: 50 }), { onSelect, isPreview: true })
    container.querySelector('rect')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('la calibración se dibuja aunque no sea un tipo de marca', () => {
    // Existe solo como preview mientras se arrastra. Sin este render se arrastraba a
    // ciegas y el diálogo aparecía de la nada al soltar.
    const a = ann({ type: 'measure_calibrate' as Annotation['type'], width: 60, height: 40 })
    const { container } = pintar(a, { isPreview: true })
    expect(container.querySelector('line')).not.toBeNull()
    expect(container.textContent).toMatch(/px/)
  })

  it('la firma se dibuja más gruesa que un trazo cuando ninguna trae grosor', () => {
    const puntos = [{ x: 0, y: 0 }, { x: 20, y: 10 }]
    const firma = pintar(ann({ type: 'signature', points: puntos })).container.querySelector('path')!
    const trazo = pintar(ann({ type: 'draw', points: puntos })).container.querySelector('path')!
    expect(Number(firma.getAttribute('stroke-width'))).toBeGreaterThan(Number(trazo.getAttribute('stroke-width')))
  })
})
