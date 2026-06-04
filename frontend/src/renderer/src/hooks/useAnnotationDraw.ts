import { useState, useCallback } from 'react'
import { usePdfStore, type Annotation, type PdfState } from '../store/usePdfStore'

const API_BASE = 'http://localhost:8745'

export type DrawPreview = Partial<Annotation> & { type?: Annotation['type'] | 'textselect' | 'measure_calibrate' | 'measure_distance' | 'measure_area' }

function computeDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
}

function formatDistance(value: number, unit: string): string {
  if (value >= 1000 && unit === 'm') return `${(value / 1000).toFixed(2)} km`
  if (value >= 100 && unit === 'cm') return `${(value / 100).toFixed(2)} m`
  if (value < 1 && unit === 'm') return `${(value * 100).toFixed(1)} cm`
  return `${value.toFixed(2)} ${unit}`
}

export function useAnnotationDraw(
  activeDoc: PdfState['docs'][number] | undefined,
  pageData: { width: number; height: number; originalWidth: number; originalHeight: number } | null,
) {
  const store = usePdfStore() as PdfState
  const { activeTool, annotationColor, addAnnotation, setActiveTool, showToast, setMeasurementScale } = store

  const [drawing, setDrawing] = useState(false)
  const [drawPreview, setDrawPreview] = useState<DrawPreview | null>(null)
  const [drawPoints, setDrawPoints] = useState<Array<{ x: number; y: number }>>([])
  const [noteText, setNoteText] = useState('')
  const [notePos, setNotePos] = useState<{ x: number; y: number } | null>(null)
  const [textInput, setTextInput] = useState('')
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null)
  const [areaPoints, setAreaPoints] = useState<Array<{ x: number; y: number }>>([])
  const [drawingArea, setDrawingArea] = useState(false)

  const toPdfCoords = useCallback((screenX: number, screenY: number) => {
    if (!pageData) return { x: 0, y: 0 }
    return {
      x: screenX * (pageData.originalWidth / pageData.width),
      y: screenY * (pageData.originalHeight / pageData.height),
    }
  }, [pageData])

  const handleMouseDown = (svgPoint: { x: number; y: number }) => {
    if (!activeDoc || !pageData || !activeTool) return false
    const pdf = toPdfCoords(svgPoint.x, svgPoint.y)
    setDrawing(true)

    if (activeTool === 'note') {
      setNotePos({ x: pdf.x, y: pdf.y })
      setDrawing(false)
      return true
    }
    if (activeTool === 'text') {
      setTextPos({ x: pdf.x, y: pdf.y })
      setDrawing(false)
      return true
    }

    if (activeTool === 'measure_area') {
      if (!drawingArea) {
        setDrawingArea(true)
        setAreaPoints([{ x: pdf.x, y: pdf.y }])
        setDrawPreview({
          id: crypto.randomUUID(),
          type: 'measure_area',
          page: activeDoc.currentPage,
          x: pdf.x,
          y: pdf.y,
          color: annotationColor,
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
    setDrawPreview({
      id: crypto.randomUUID(),
      type: isSignature ? 'signature' : toolType,
      page: activeDoc.currentPage,
      x: pdf.x,
      y: pdf.y,
      color: isSignature ? '#000000' : annotationColor,
      lineWidth: 2,
    })
    setDrawPoints([{ x: pdf.x, y: pdf.y }])
    return true
  }

  const handleMouseMove = (svgPoint: { x: number; y: number }) => {
    if (!drawing || !drawPreview || !activeDoc || !pageData || !activeTool) return
    const pdf = toPdfCoords(svgPoint.x, svgPoint.y)

    if (activeTool === 'draw' || activeTool === 'signature') {
      setDrawPoints((prev) => [...prev, { x: pdf.x, y: pdf.y }])
    } else if (activeTool === 'highlight' || activeTool === 'rect' || activeTool === 'circle' || activeTool === 'textselect') {
      setDrawPreview({
        ...drawPreview,
        width: Math.abs(pdf.x - (drawPreview.x || 0)),
        height: Math.abs(pdf.y - (drawPreview.y || 0)),
      })
    } else if (activeTool === 'underline' || activeTool === 'strikethrough' || activeTool === 'arrow' || activeTool === 'measure_calibrate' || activeTool === 'measure_distance') {
      setDrawPreview({
        ...drawPreview,
        width: pdf.x - (drawPreview.x || 0),
        height: pdf.y - (drawPreview.y || 0),
      })
    } else if (activeTool === 'measure_area' && drawingArea) {
      setDrawPreview((prev) => {
        if (!prev) return null
        const nextPoints = [...areaPoints, { x: pdf.x, y: pdf.y }]
        return { ...prev, points: nextPoints }
      })
    }
  }

  const handleMouseUp = async () => {
    if (!drawing || !drawPreview || !activeDoc) {
      setDrawing(false)
      return
    }

    // Text area selection
    if (activeTool === 'textselect' && drawPreview.width && drawPreview.width > 2) {
      const x = Math.min(drawPreview.x || 0, (drawPreview.x || 0) + (drawPreview.width || 0))
      const y = Math.min(drawPreview.y || 0, (drawPreview.y || 0) + (drawPreview.height || 0))
      const w = Math.abs(drawPreview.width || 0)
      const h = Math.abs(drawPreview.height || 0)
      try {
        const res = await fetch(`${API_BASE}/pdf/text-clip/${activeDoc.doc_id}/${activeDoc.currentPage}`, {
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
      setActiveTool(null)
      return
    }

    // Calibration tool
    if (activeTool === 'measure_calibrate' && drawPreview.width && Math.abs(drawPreview.width) > 2) {
      const pixelDist = computeDistance(
        { x: drawPreview.x || 0, y: drawPreview.y || 0 },
        { x: (drawPreview.x || 0) + (drawPreview.width || 0), y: (drawPreview.y || 0) + (drawPreview.height || 0) }
      )
      const input = prompt(`Distancia real de la línea calibrada (${pixelDist.toFixed(1)} px):`, '1')
      if (input) {
        const realDist = parseFloat(input)
        if (!isNaN(realDist) && realDist > 0) {
          const unit = prompt('Unidad (m, cm, mm, ft, in):', 'm') || 'm'
          const validUnit = (['m', 'cm', 'mm', 'ft', 'in'].includes(unit) ? unit : 'm') as 'm' | 'cm' | 'mm' | 'ft' | 'in'
          setMeasurementScale(activeDoc.doc_id, {
            pixelsPerUnit: pixelDist / realDist,
            unit: validUnit,
          })
          showToast(`Escala calibrada: ${pixelDist.toFixed(1)} px = ${realDist} ${validUnit}`, 'success')
        }
      }
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
      const scale = activeDoc.measurementScale
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
      setActiveTool(null)
      return
    }

    if ((activeTool === 'draw' || activeTool === 'signature') && drawPoints.length > 2) {
      addAnnotation(activeDoc.doc_id, {
        ...drawPreview as Annotation,
        points: drawPoints,
      })
      if (activeTool === 'signature') {
        const name = prompt('¿Nombre para guardar esta firma? (deja vacío para no guardar)')
        if (name && name.trim()) {
          const saved = JSON.parse(localStorage.getItem('pdfmaster_signatures') || '[]')
          saved.push({ id: crypto.randomUUID(), name: name.trim(), points: drawPoints })
          localStorage.setItem('pdfmaster_signatures', JSON.stringify(saved.slice(-10)))
          showToast('Firma guardada', 'success')
        }
      }
    } else if ((activeTool === 'highlight' || activeTool === 'rect' || activeTool === 'circle') && drawPreview.width && drawPreview.width > 2) {
      let finalPreview = { ...drawPreview }
      if (activeTool === 'circle') {
        const size = Math.min(finalPreview.width || 0, finalPreview.height || 0)
        finalPreview.width = size
        finalPreview.height = size
      }
      addAnnotation(activeDoc.doc_id, finalPreview as Annotation)
    } else if ((activeTool === 'underline' || activeTool === 'strikethrough' || activeTool === 'arrow') && (drawPreview.width || 0) !== 0) {
      addAnnotation(activeDoc.doc_id, drawPreview as Annotation)
    }

    setDrawing(false)
    setDrawPreview(null)
    setDrawPoints([])
  }

  const closeArea = () => {
    if (!activeDoc || !drawingArea || areaPoints.length < 3) {
      setDrawingArea(false)
      setAreaPoints([])
      setDrawPreview(null)
      return
    }
    const scale = activeDoc.measurementScale
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
      measurement: { value, unit, label },
    })
    setDrawingArea(false)
    setAreaPoints([])
    setDrawPreview(null)
    setActiveTool(null)
    showToast(`Área medida: ${label}`, 'success')
  }

  const saveNote = () => {
    if (!notePos || !activeDoc || !activeTool) return
    addAnnotation(activeDoc.doc_id, {
      id: crypto.randomUUID(),
      type: 'note',
      page: activeDoc.currentPage,
      x: notePos.x,
      y: notePos.y,
      color: annotationColor,
      text: noteText || 'Nota',
    })
    setNotePos(null)
    setNoteText('')
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
    })
    setTextPos(null)
    setTextInput('')
  }

  const cancelDraw = () => {
    setDrawing(false)
    setDrawPreview(null)
    setDrawPoints([])
    setNotePos(null)
    setTextPos(null)
    setDrawingArea(false)
    setAreaPoints([])
  }

  return {
    drawing,
    drawPreview,
    drawPoints,
    noteText,
    setNoteText,
    notePos,
    setNotePos,
    textInput,
    setTextInput,
    textPos,
    setTextPos,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    saveNote,
    saveText,
    cancelDraw,
    toPdfCoords,
    drawingArea,
    closeArea,
  }
}
