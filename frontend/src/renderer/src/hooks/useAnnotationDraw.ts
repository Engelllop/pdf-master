import { useState, useCallback, useEffect, useRef } from 'react'
import { scaleForPage, type Annotation, type PdfState } from '../store/usePdfStore'
import { useStoreSlice } from './useStoreSlice'
import { askForm } from '../lib/uiPrompt'

import { apiFetch } from '../lib/api'
import { getSpans, type SpanItem } from '../lib/spans'
import { computeLineRects, type LineRect } from '../lib/textMarkup'
import { addSignature } from '../lib/signatures'
import { distance, formatDistance } from '../lib/measure'
const SNAP_TOLERANCE_SCREEN_PX = 10

const MEASURE_TOOLS = ['measure_calibrate', 'measure_distance', 'measure_area', 'measure_perimeter']
// Tamaño inicial (en puntos PDF) de la caja de un callout; luego se redimensiona.
const CALLOUT_W = 160
const CALLOUT_H = 48
const MARKUP_TOOLS = ['highlight', 'underline', 'strikethrough']
// Distancia mínima (en puntos PDF) entre dos puntos de un trazo a mano alzada. Sin
// esto se guardaba un punto por cada mousemove: con el ratón lento o parado se
// acumulaban cientos que no aportan forma, el SVG se redibujaba entero en cada uno y
// todos acababan dentro del PDF al guardar.
const MIN_DRAW_STEP_PT = 0.5

export type DrawPreview = Partial<Annotation> & { type?: Annotation['type'] | 'textselect' | 'measure_calibrate' | 'measure_distance' | 'measure_area' }

const computeDistance = distance

export function useAnnotationDraw(
  activeDoc: PdfState['docs'][number] | undefined,
  pageData: { width: number; height: number; originalWidth: number; originalHeight: number } | null,
) {
  const store = useStoreSlice(
    'activeTool', 'annotationColor', 'addAnnotation', 'setActiveTool', 'releaseTool', 'showToast',
    'setMeasurementScale', 'textFontFamily', 'textFontSize',
    'annotationLineWidth', 'annotationLineStyle', 'annotationOpacity',
    'annotationFillColor', 'annotationFillOpacity', 'countCategory', 'countSymbol',
    'setAnnotations', 'setDocDirty', 'textStyle', 'annotationAuthor', 'defaultUnit',
  )
  const { activeTool, annotationColor, addAnnotation, setActiveTool, releaseTool, showToast, setMeasurementScale, textFontFamily, textFontSize } = store

  const [drawing, setDrawing] = useState(false)
  const [drawPreview, setDrawPreview] = useState<DrawPreview | null>(null)
  const [drawPoints, setDrawPoints] = useState<Array<{ x: number; y: number }>>([])
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null)
  const [areaPoints, setAreaPoints] = useState<Array<{ x: number; y: number }>>([])
  const [drawingArea, setDrawingArea] = useState(false)
  const [snapPoint, setSnapPoint] = useState<{ x: number; y: number } | null>(null)
  const snapPointsRef = useRef<Array<{ x: number; y: number }>>([])
  const [markupRects, setMarkupRects] = useState<LineRect[]>([])
  const spansRef = useRef<SpanItem[]>([])
  // Los spans de un plano tardan: sin esto, marcar antes de que llegaran daba el aviso
  // de «no hay texto debajo» en una página que sí lo tiene.
  const spansListosRef = useRef(false)

  const isMeasureTool = !!activeTool && MEASURE_TOOLS.includes(activeTool)
  const isMarkupTool = !!activeTool && MARKUP_TOOLS.includes(activeTool)

  // Spans de la página para anclar el marcado al texto real (estilo Acrobat).
  useEffect(() => {
    spansRef.current = []
    spansListosRef.current = false
    setMarkupRects([])
    if (!isMarkupTool || !activeDoc) return
    let alive = true
    getSpans(activeDoc.doc_id, activeDoc.currentPage, activeDoc.docVersion).then((spans) => {
      if (alive) { spansRef.current = spans; spansListosRef.current = true }
    })
    return () => { alive = false }
  }, [isMarkupTool, activeDoc?.doc_id, activeDoc?.currentPage, activeDoc?.docVersion])

  // Carga los puntos de snap (vértices del contenido vectorial del plano) al
  // activar una herramienta de medición; se cachean en el backend por página.
  useEffect(() => {
    snapPointsRef.current = []
    setSnapPoint(null)
    if (!isMeasureTool || !activeDoc) return
    const ctrl = new AbortController()
    apiFetch(`/pdf/snap-points/${activeDoc.doc_id}/${activeDoc.currentPage}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) snapPointsRef.current = data.points
      })
      .catch(() => {})
    return () => ctrl.abort()
    // `docVersion` también: los puntos de snap son los vértices del dibujo, así que
    // rotar la página, recortarla, editar un texto o mover una imagen los cambia. Sin
    // esta dep se seguía enganchando a los vértices de ANTES de la edición (el motor ya
    // recalcula: su cache de snap se invalida con el de render).
  }, [isMeasureTool, activeDoc?.doc_id, activeDoc?.currentPage, activeDoc?.docVersion])

  const toPdfCoords = useCallback((screenX: number, screenY: number) => {
    if (!pageData) return { x: 0, y: 0 }
    return {
      x: screenX * (pageData.originalWidth / pageData.width),
      y: screenY * (pageData.originalHeight / pageData.height),
    }
  }, [pageData])

  const maybeSnap = useCallback((pdf: { x: number; y: number }) => {
    if (!isMeasureTool || !pageData || snapPointsRef.current.length === 0) return pdf
    const tolerance = SNAP_TOLERANCE_SCREEN_PX * (pageData.originalWidth / pageData.width)
    let best: { x: number; y: number } | null = null
    let bestDist = tolerance
    for (const p of snapPointsRef.current) {
      const dx = p.x - pdf.x
      const dy = p.y - pdf.y
      if (Math.abs(dx) > bestDist || Math.abs(dy) > bestDist) continue
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < bestDist) {
        bestDist = dist
        best = p
      }
    }
    setSnapPoint(best)
    return best ?? pdf
  }, [isMeasureTool, pageData])

  const handleMouseDown = (svgPoint: { x: number; y: number }) => {
    if (!activeDoc || !pageData || !activeTool) return false
    const pdf = maybeSnap(toPdfCoords(svgPoint.x, svgPoint.y))
    setDrawing(true)

    if (activeTool === 'note') {
      // La nota se crea vacía y se abre su globo: se escribe ahí y se guarda al
      // hacer clic fuera (si queda vacía, el globo la descarta).
      const id = crypto.randomUUID()
      addAnnotation(activeDoc.doc_id, {
        id,
        type: 'note',
        page: activeDoc.currentPage,
        x: pdf.x,
        y: pdf.y,
        color: annotationColor,
        text: '',
      })
      setPendingNoteId(id)
      setDrawing(false)
      return true
    }
    if (activeTool === 'count') {
      // Cada clic coloca una marca; la categoría viaja en `text` para que el
      // sidecar y el resumen la agrupen sin ampliar el modelo.
      addAnnotation(activeDoc.doc_id, {
        id: crypto.randomUUID(),
        type: 'count',
        page: activeDoc.currentPage,
        x: pdf.x,
        y: pdf.y,
        color: annotationColor,
        text: store.countCategory || 'General',
        symbol: store.countSymbol,
      })
      setDrawing(false)
      return true
    }
    if (activeTool === 'text') {
      setTextPos({ x: pdf.x, y: pdf.y })
      setDrawing(false)
      return true
    }

    if (activeTool === 'measure_area' || activeTool === 'polygon' || activeTool === 'measure_perimeter') {
      if (!drawingArea) {
        setDrawingArea(true)
        setAreaPoints([{ x: pdf.x, y: pdf.y }])
        setDrawPreview({
          id: crypto.randomUUID(),
          type: activeTool,
          page: activeDoc.currentPage,
          x: pdf.x,
          y: pdf.y,
          color: annotationColor,
          lineWidth: store.annotationLineWidth,
          lineStyle: store.annotationLineStyle,
          opacity: store.annotationOpacity,
          ...(activeTool === 'polygon' && store.annotationFillColor
            ? { fillColor: store.annotationFillColor, fillOpacity: store.annotationFillOpacity }
            : {}),
          points: [{ x: pdf.x, y: pdf.y }],
        })
      } else {
        setAreaPoints((prev) => {
          const next = [...prev, { x: pdf.x, y: pdf.y }]
          setDrawPreview((p) => p ? { ...p, points: next } : null)
          return next
        })
      }
      return true
    }

    const isSignature = activeTool === 'signature'
    const toolType = activeTool as Annotation['type']
    const isShape = ['rect', 'circle', 'star', 'cloud'].includes(activeTool)
    setDrawPreview({
      id: crypto.randomUUID(),
      type: isSignature ? 'signature' : toolType,
      page: activeDoc.currentPage,
      x: pdf.x,
      y: pdf.y,
      color: isSignature ? '#000000' : annotationColor,
      lineWidth: isSignature ? 3 : store.annotationLineWidth,
      lineStyle: store.annotationLineStyle,
      // El resalte usa su propia opacidad por defecto (0.5 al renderizar);
      // solo se guarda si el usuario la bajó explícitamente.
      opacity: activeTool === 'highlight'
        ? (store.annotationOpacity < 1 ? store.annotationOpacity : undefined)
        : store.annotationOpacity,
      ...(isShape && store.annotationFillColor
        ? { fillColor: store.annotationFillColor, fillOpacity: store.annotationFillOpacity }
        : {}),
    })
    setDrawPoints([{ x: pdf.x, y: pdf.y }])
    return true
  }

  const handleMouseMove = (svgPoint: { x: number; y: number }, shiftKey = false) => {
    if (!activeDoc || !pageData || !activeTool) return
    if (!drawing || !drawPreview) {
      // Hover sin arrastrar: muestra el imán de snap para apuntar con precisión
      if (isMeasureTool) maybeSnap(toPdfCoords(svgPoint.x, svgPoint.y))
      return
    }
    const pdf = maybeSnap(toPdfCoords(svgPoint.x, svgPoint.y))

    if (activeTool === 'draw' || activeTool === 'signature') {
      setDrawPoints((prev) => {
        const last = prev[prev.length - 1]
        if (last && Math.hypot(pdf.x - last.x, pdf.y - last.y) < MIN_DRAW_STEP_PT) return prev
        return [...prev, { x: pdf.x, y: pdf.y }]
      })
    } else if (
      activeTool === 'highlight' || activeTool === 'rect' || activeTool === 'circle' || activeTool === 'textselect' ||
      activeTool === 'underline' || activeTool === 'strikethrough' || activeTool === 'arrow' || activeTool === 'line' ||
      activeTool === 'callout' ||
      activeTool === 'check' || activeTool === 'cross' || activeTool === 'star' || activeTool === 'cloud' ||
      activeTool === 'measure_calibrate' || activeTool === 'measure_distance'
    ) {
      // Keep the sign of the delta so dragging up/left works; the shape is
      // normalized to a top-left origin on mouse up (and at render time).
      let width = pdf.x - (drawPreview.x || 0)
      let height = pdf.y - (drawPreview.y || 0)
      // Shift restringe: líneas/flechas/mediciones a múltiplos de 45°, cajas a cuadrado.
      if (shiftKey) {
        const isLinear = activeTool === 'arrow' || activeTool === 'line' ||
          activeTool === 'measure_distance' || activeTool === 'measure_calibrate'
        if (isLinear) {
          const len = Math.hypot(width, height)
          const snapped = Math.round(Math.atan2(height, width) / (Math.PI / 4)) * (Math.PI / 4)
          width = Math.cos(snapped) * len
          height = Math.sin(snapped) * len
        } else {
          const size = Math.max(Math.abs(width), Math.abs(height))
          width = Math.sign(width || 1) * size
          height = Math.sign(height || 1) * size
        }
      }
      setDrawPreview({ ...drawPreview, width, height })
      if (isMarkupTool) {
        setMarkupRects(computeLineRects(spansRef.current, {
          x: drawPreview.x || 0, y: drawPreview.y || 0, width, height,
        }))
      }
    } else if ((activeTool === 'measure_area' || activeTool === 'polygon' || activeTool === 'measure_perimeter') && drawingArea) {
      setDrawPreview((prev) => {
        if (!prev) return null
        const nextPoints = [...areaPoints, { x: pdf.x, y: pdf.y }]
        return { ...prev, points: nextPoints }
      })
    }
  }

  const handleMouseUp = async () => {
    // Polígono / área / perímetro se construyen a CLICS: el soltar el botón del
    // primer clic no debe borrar el preview (era por qué "la primera raya
    // desaparecía" y no se veía dónde se estaba marcando).
    if (drawingArea) {
      setDrawing(false)
      return
    }
    if (!drawing || !drawPreview || !activeDoc) {
      setDrawing(false)
      return
    }

    // Text area selection
    if (activeTool === 'textselect' && drawPreview.width && Math.abs(drawPreview.width) > 2) {
      const x = Math.min(drawPreview.x || 0, (drawPreview.x || 0) + (drawPreview.width || 0))
      const y = Math.min(drawPreview.y || 0, (drawPreview.y || 0) + (drawPreview.height || 0))
      const w = Math.abs(drawPreview.width || 0)
      const h = Math.abs(drawPreview.height || 0)
      try {
        const res = await apiFetch(`/pdf/text-clip/${activeDoc.doc_id}/${activeDoc.currentPage}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x, y, width: w, height: h }),
        })
        if (res.ok) {
          const data = await res.json()
          const text = data.text || ''
          await navigator.clipboard.writeText(text)
          showToast(`Texto copiado (${text.length} caracteres)`, 'success')
        }
      } catch {
        showToast('Error al extraer texto', 'error')
      }
      setDrawing(false)
      setDrawPreview(null)
      setDrawPoints([])
      releaseTool()
      return
    }

    // Calibration tool
    if (activeTool === 'measure_calibrate' && drawPreview.width && Math.abs(drawPreview.width) > 2) {
      const pixelDist = computeDistance(
        { x: drawPreview.x || 0, y: drawPreview.y || 0 },
        { x: (drawPreview.x || 0) + (drawPreview.width || 0), y: (drawPreview.y || 0) + (drawPreview.height || 0) }
      )
      const v = await askForm(`Calibrar escala — ${pixelDist.toFixed(1)} px medidos`, [
        { name: 'real', label: 'Distancia real conocida', type: 'number', defaultValue: '', placeholder: 'Ej. 100' },
        { name: 'unit', label: 'Unidad', type: 'select', options: ['mm', 'cm', 'm', 'ft', 'in'], defaultValue: store.defaultUnit },
        // Un juego de planos mezcla escalas (sitio 1:500, plantas 1:100, detalles 1:20):
        // calibrar en una lámina no puede reescribir las cotas de las demás.
        { name: 'alcance', label: 'Aplicar a', type: 'select', options: ['Todo el documento', 'Solo esta página'], defaultValue: 'Todo el documento' },
      ], 'Calibrar')
      if (!v) {
        showToast('Calibración cancelada', 'info')
        setDrawing(false)
        setDrawPreview(null)
        setDrawPoints([])
        setActiveTool(null)
        return
      }
      const realValue = parseFloat(String(v.real))
      if (!isFinite(realValue) || realValue <= 0) {
        showToast('Valor inválido', 'error')
        setDrawing(false)
        setDrawPreview(null)
        setDrawPoints([])
        setActiveTool(null)
        return
      }
      const unit = String(v.unit) as 'm' | 'cm' | 'mm' | 'ft' | 'in'
      const soloEstaPagina = String(v.alcance ?? '').includes('esta página')
      setMeasurementScale(
        activeDoc.doc_id,
        { pixelsPerUnit: pixelDist / realValue, unit },
        soloEstaPagina ? activeDoc.currentPage : undefined,
      )
      showToast(
        `Calibración: ${pixelDist.toFixed(1)} px = ${realValue} ${unit}`
        + (soloEstaPagina ? ` (solo página ${activeDoc.currentPage + 1})` : ''),
        'success',
      )
      addAnnotation(activeDoc.doc_id, {
        ...drawPreview as Annotation,
        type: 'measure_distance',
        width: drawPreview.width,
        height: drawPreview.height,
        measurement: { value: pixelDist, unit: 'px', label: `${pixelDist.toFixed(1)} px` },
      })
      setDrawing(false)
      setDrawPreview(null)
      setDrawPoints([])
      setActiveTool(null)
      return
    }

    // Distance measurement tool
    if (activeTool === 'measure_distance' && drawPreview.width && Math.abs(drawPreview.width) > 2) {
      const pixelDist = computeDistance(
        { x: drawPreview.x || 0, y: drawPreview.y || 0 },
        { x: (drawPreview.x || 0) + (drawPreview.width || 0), y: (drawPreview.y || 0) + (drawPreview.height || 0) }
      )
      const scale = scaleForPage(activeDoc, activeDoc.currentPage)
      let value = 0
      let label = `${pixelDist.toFixed(1)} px`
      let unit = 'px'
      if (scale && scale.pixelsPerUnit > 0) {
        value = pixelDist / scale.pixelsPerUnit
        unit = scale.unit
        label = formatDistance(value, unit)
      } else {
        showToast('Sin calibración. Usa "Calibrar escala" primero.', 'error')
      }
      addAnnotation(activeDoc.doc_id, {
        ...drawPreview as Annotation,
        type: 'measure_distance',
        width: drawPreview.width,
        height: drawPreview.height,
        measurement: { value, unit, label },
      })
      setDrawing(false)
      setDrawPreview(null)
      setDrawPoints([])
      releaseTool()
      return
    }

    if ((activeTool === 'draw' || activeTool === 'signature') && drawPoints.length > 2) {
      addAnnotation(activeDoc.doc_id, {
        ...drawPreview as Annotation,
        points: drawPoints,
      })
      if (activeTool === 'signature') {
        const sv = await askForm('Guardar firma', [{ name: 'name', label: 'Nombre (vacío = no guardar)', type: 'text', defaultValue: '' }], 'Guardar')
        const name = sv ? String(sv.name) : ''
        if (name && name.trim()) {
          addSignature(name.trim(), drawPoints)
          showToast('Firma guardada', 'success')
        }
      }
    } else if (isMarkupTool && markupRects.length === 0) {
      // Resaltar/subrayar/tachar SOLO marcan texto: sin texto debajo no se deja una
      // marca suelta en medio del plano (antes caía al rect libre de más abajo).
      if (Math.abs(drawPreview.width || 0) > 2 || Math.abs(drawPreview.height || 0) > 2) {
        showToast(
          spansListosRef.current
            ? 'Resaltar, subrayar y tachar se anclan al texto. Para marcar un área usá Rectángulo.'
            : 'Todavía se está leyendo el texto de la página. Probá de nuevo en un momento.',
          'info',
        )
      }
    } else if (isMarkupTool) {
      // Marcado anclado al texto: una anotación por línea con el rect real de la
      // línea (el render pinta subrayado abajo / tachado al centro, y el embed
      // usa add_*_annot con el quad correcto). Un solo paso de undo.
      const now = Date.now()
      const anns = markupRects.map((l) => ({
        ...(drawPreview as Annotation),
        id: crypto.randomUUID(),
        x: l.x0,
        y: l.y0,
        width: l.x1 - l.x0,
        height: l.y1 - l.y0,
        // No pasan por addAnnotation (van en bloque para un solo undo), así que el
        // sellado de autor/fecha se hace aquí.
        author: store.annotationAuthor || undefined,
        createdAt: now,
      }))
      store.setAnnotations(activeDoc.doc_id, [...activeDoc.annotations, ...anns])
      store.setDocDirty(activeDoc.doc_id, true)
      setMarkupRects([])
    } else if ((activeTool === 'rect' || activeTool === 'circle' ||
      activeTool === 'check' || activeTool === 'cross' || activeTool === 'star' || activeTool === 'cloud') &&
      drawPreview.width && Math.abs(drawPreview.width) > 2) {
      const finalPreview = { ...drawPreview }
      // Normalize x,y to top-left corner for rect/circle (user may have dragged backwards)
      const nx = Math.min(finalPreview.x || 0, (finalPreview.x || 0) + (finalPreview.width || 0))
      const ny = Math.min(finalPreview.y || 0, (finalPreview.y || 0) + (finalPreview.height || 0))
      finalPreview.x = nx
      finalPreview.y = ny
      finalPreview.width = Math.abs(finalPreview.width || 0)
      finalPreview.height = Math.abs(finalPreview.height || 0)
      if (activeTool === 'circle') {
        const size = Math.min(finalPreview.width || 0, finalPreview.height || 0)
        finalPreview.width = size
        finalPreview.height = size
      }
      addAnnotation(activeDoc.doc_id, finalPreview as Annotation)
    } else if ((activeTool === 'arrow' || activeTool === 'line') && (drawPreview.width || 0) !== 0) {
      addAnnotation(activeDoc.doc_id, drawPreview as Annotation)
    } else if (activeTool === 'callout' && (Math.abs(drawPreview.width || 0) > 2 || Math.abs(drawPreview.height || 0) > 2)) {
      // Se arrastra desde el punto señalado hasta donde va la caja de texto.
      const tip = { x: drawPreview.x || 0, y: drawPreview.y || 0 }
      const id = crypto.randomUUID()
      addAnnotation(activeDoc.doc_id, {
        ...(drawPreview as Annotation),
        id,
        type: 'callout',
        x: tip.x + (drawPreview.width || 0),
        y: tip.y + (drawPreview.height || 0),
        width: CALLOUT_W,
        height: CALLOUT_H,
        points: [tip],
        text: '',
        fontSize: textFontSize,
        fontFamily: textFontFamily,
      })
      // El Viewer abre el editor in-situ para escribir de inmediato.
      window.dispatchEvent(new CustomEvent('app:edit-annotation-text', { detail: { id } }))
    }

    setDrawing(false)
    setDrawPreview(null)
    setDrawPoints([])
    setMarkupRects([])
  }

  const closeArea = () => {
    if (!activeDoc || !drawingArea) {
      setDrawingArea(false)
      setAreaPoints([])
      setDrawPreview(null)
      return
    }
    const minPoints = activeTool === 'measure_perimeter' ? 2 : 3
    if (areaPoints.length < minPoints) {
      showToast(activeTool === 'polygon' ? 'Dibuja al menos 3 vértices'
        : activeTool === 'measure_perimeter' ? 'Marca al menos 2 puntos para medir'
        : 'Dibuja al menos 3 puntos para medir un area', 'error')
      setDrawingArea(false)
      setAreaPoints([])
      setDrawPreview(null)
      return
    }
    if (activeTool === 'measure_perimeter') {
      // Longitud acumulada de la polilínea (no se cierra: para el contorno cerrado
      // están el polígono y la medición de área).
      const scale = scaleForPage(activeDoc, activeDoc.currentPage)
      let pixels = 0
      for (let i = 1; i < areaPoints.length; i++) pixels += computeDistance(areaPoints[i - 1], areaPoints[i])
      let value = 0
      let unit = 'px'
      let label = `${pixels.toFixed(1)} px`
      if (scale && scale.pixelsPerUnit > 0) {
        value = pixels / scale.pixelsPerUnit
        unit = scale.unit
        label = formatDistance(value, unit)
      } else {
        showToast('Sin calibración. Usa "Calibrar escala" primero.', 'error')
      }
      addAnnotation(activeDoc.doc_id, {
        id: crypto.randomUUID(),
        type: 'measure_perimeter',
        page: activeDoc.currentPage,
        x: areaPoints[0].x,
        y: areaPoints[0].y,
        color: annotationColor,
        points: areaPoints,
        lineWidth: store.annotationLineWidth,
        lineStyle: store.annotationLineStyle,
        opacity: store.annotationOpacity,
        measurement: { value, unit, label },
      })
      setDrawingArea(false)
      setAreaPoints([])
      setDrawPreview(null)
      releaseTool()
      showToast(`Perímetro: ${label}`, 'success')
      return
    }
    if (activeTool === 'polygon') {
      addAnnotation(activeDoc.doc_id, {
        id: crypto.randomUUID(),
        type: 'polygon',
        page: activeDoc.currentPage,
        x: areaPoints[0].x,
        y: areaPoints[0].y,
        color: annotationColor,
        points: areaPoints,
        lineWidth: store.annotationLineWidth,
        lineStyle: store.annotationLineStyle,
        opacity: store.annotationOpacity,
        ...(store.annotationFillColor
          ? { fillColor: store.annotationFillColor, fillOpacity: store.annotationFillOpacity }
          : {}),
      })
      setDrawingArea(false)
      setAreaPoints([])
      setDrawPreview(null)
      return
    }
    const scale = scaleForPage(activeDoc, activeDoc.currentPage)
    let value = 0
    let label = 'Área no calibrada'
    let unit = 'px²'
    if (scale && scale.pixelsPerUnit > 0) {
      // Shoelace formula for polygon area
      let area = 0
      const pts = areaPoints
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length
        area += pts[i].x * pts[j].y
        area -= pts[j].x * pts[i].y
      }
      area = Math.abs(area) / 2
      const realArea = area / (scale.pixelsPerUnit ** 2)
      value = realArea
      unit = `${scale.unit}²`
      label = `${realArea.toFixed(2)} ${unit}`
    }
    addAnnotation(activeDoc.doc_id, {
      id: crypto.randomUUID(),
      type: 'measure_area',
      page: activeDoc.currentPage,
      x: areaPoints[0].x,
      y: areaPoints[0].y,
      color: annotationColor,
      points: areaPoints,
      lineWidth: store.annotationLineWidth,
      lineStyle: store.annotationLineStyle,
      opacity: store.annotationOpacity,
      measurement: { value, unit, label },
    })
    setDrawingArea(false)
    setAreaPoints([])
    setDrawPreview(null)
    releaseTool()
    showToast(`Área medida: ${label}`, 'success')
  }

  const saveText = () => {
    if (!textPos || !activeDoc || !activeTool) return
    addAnnotation(activeDoc.doc_id, {
      id: crypto.randomUUID(),
      type: 'text',
      page: activeDoc.currentPage,
      x: textPos.x,
      y: textPos.y,
      color: annotationColor,
      text: textInput || 'Texto',
      fontFamily: textFontFamily,
      fontSize: textFontSize,
      bold: store.textStyle.bold || undefined,
      italic: store.textStyle.italic || undefined,
      align: store.textStyle.align !== 'left' ? store.textStyle.align : undefined,
      lineHeight: store.textStyle.lineHeight !== 1.3 ? store.textStyle.lineHeight : undefined,
      listStyle: store.textStyle.listStyle !== 'none' ? store.textStyle.listStyle : undefined,
    })
    setTextPos(null)
    setTextInput('')
  }

  const cancelDraw = () => {
    setDrawing(false)
    setDrawPreview(null)
    setDrawPoints([])
    setTextPos(null)
    setDrawingArea(false)
    setAreaPoints([])
    setSnapPoint(null)
    setMarkupRects([])
  }

  return {
    drawing,
    drawPreview,
    drawPoints,
    pendingNoteId,
    setPendingNoteId,
    textInput,
    setTextInput,
    textPos,
    setTextPos,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    saveText,
    cancelDraw,
    toPdfCoords,
    drawingArea,
    closeArea,
    snapPoint,
    markupRects,
  }
}
