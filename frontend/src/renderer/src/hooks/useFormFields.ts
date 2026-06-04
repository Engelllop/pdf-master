import { useEffect, useState } from 'react'

const API_BASE = 'http://localhost:8745'

export interface FormField {
  field_name: string
  field_type: string
  rect: { x: number; y: number; width: number; height: number }
  value: string
  options: string[]
}

export function useFormFields(docId: string | null, pageNum: number) {
  const [fields, setFields] = useState<FormField[]>([])

  useEffect(() => {
    if (!docId) {
      setFields([])
      return
    }
    let cancelled = false
    fetch(`${API_BASE}/pdf/widgets/${docId}/${pageNum}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setFields(data)
      })
      .catch(() => {
        if (!cancelled) setFields([])
      })
    return () => { cancelled = true }
  }, [docId, pageNum])

  const updateField = async (fieldName: string, value: string) => {
    if (!docId) return false
    try {
      const res = await fetch(`${API_BASE}/pdf/widgets/${docId}/${pageNum}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_name: fieldName, value }),
      })
      if (res.ok) {
        setFields((prev) => prev.map((f) => (f.field_name === fieldName ? { ...f, value } : f)))
        return true
      }
    } catch { /* ignore */ }
    return false
  }

  return { fields, updateField }
}
