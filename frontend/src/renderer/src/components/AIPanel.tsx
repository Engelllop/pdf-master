import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Send, KeyRound, Loader2, Eraser, Square } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'

const KEY_STORAGE = 'pdfmaster_anthropic_key'

interface Msg { role: 'user' | 'assistant'; text: string }

export default function AIPanel({ onClose }: { onClose: () => void }) {
  const { docs, activeDocId } = useStoreSlice('docs', 'activeDocId')
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)

  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_STORAGE) || '')
  const [keyInput, setKeyInput] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  // Conversación independiente por documento (clave = doc_id, o '__nodoc__' sin doc).
  const [conversations, setConversations] = useState<Record<string, Msg[]>>({})
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const reqRef = useRef<string | null>(null)
  const reqKeyRef = useRef<string>('__nodoc__')
  const scrollRef = useRef<HTMLDivElement>(null)

  const convKey = activeDocId || '__nodoc__'
  const messages = conversations[convKey] || []
  const setMsgsFor = (key: string, fn: (prev: Msg[]) => Msg[]) =>
    setConversations((c) => ({ ...c, [key]: fn(c[key] || []) }))

  useEffect(() => {
    const offChunk = window.api.onAiChunk(({ requestId, text }) => {
      if (requestId !== reqRef.current) return
      setMsgsFor(reqKeyRef.current, (m) => {
        const next = [...m]
        next[next.length - 1] = { role: 'assistant', text: next[next.length - 1].text + text }
        return next
      })
    })
    const offDone = window.api.onAiDone(({ requestId }) => {
      if (requestId === reqRef.current) { setStreaming(false); reqRef.current = null }
    })
    const offErr = window.api.onAiError(({ requestId, error }) => {
      if (requestId !== reqRef.current) return
      setMsgsFor(reqKeyRef.current, (m) => {
        const next = [...m]
        next[next.length - 1] = { role: 'assistant', text: `⚠️ ${error}` }
        return next
      })
      setStreaming(false); reqRef.current = null
    })
    return () => { offChunk(); offDone(); offErr() }
  }, [])

  const stop = () => {
    if (reqRef.current) window.api.aiAbort(reqRef.current)
    setStreaming(false); reqRef.current = null
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Apertura con preset desde el ribbon IA.
  useEffect(() => {
    const onPreset = (e: Event) => {
      const preset = (e as CustomEvent).detail?.preset as string | undefined
      if (preset) send(preset)
    }
    window.addEventListener('app:ai-preset', onPreset as EventListener)
    return () => window.removeEventListener('app:ai-preset', onPreset as EventListener)
  }, [apiKey, activeDocId, conversations, streaming])

  const saveKey = () => {
    const k = keyInput.trim()
    if (!k) return
    localStorage.setItem(KEY_STORAGE, k)
    setApiKey(k); setEditingKey(false); setKeyInput('')
  }

  const send = (text: string) => {
    const content = text.trim()
    if (!content || streaming || !apiKey) return
    const key = activeDocId || '__nodoc__'
    const history = [...(conversations[key] || []), { role: 'user' as const, text: content }]
    const requestId = crypto.randomUUID()
    reqRef.current = requestId
    reqKeyRef.current = key
    setMsgsFor(key, () => [...history, { role: 'assistant', text: '' }])
    setInput('')
    setStreaming(true)
    window.api.aiChat({ requestId, docId: activeDocId, apiKey, messages: history })
  }

  if (!apiKey || editingKey) {
    return (
      <div className="w-[360px] border-l border-border bg-panel flex flex-col shrink-0">
        <Header onClose={onClose} onKey={() => {}} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <KeyRound size={28} className="text-muted" />
          <p className="text-sm text-fg font-medium">Conecta tu cuenta de Anthropic</p>
          <p className="text-xs text-muted">Usa tu suscripción (Claude Pro/Max): instala Claude Code y ejecuta <code className="px-1 rounded bg-surface border border-border">claude setup-token</code> en una terminal. Copia el token (empieza por <code className="px-1 rounded bg-surface border border-border">sk-ant-oat…</code>) y pégalo aquí.</p>
          <p className="text-[11px] text-muted">También sirve una API key de pago (<code className="px-1 rounded bg-surface border border-border">sk-ant-api…</code>). Se guarda solo en este equipo.</p>
          <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveKey()} placeholder="sk-ant-oat… o sk-ant-api…"
            className="w-full border border-border rounded px-2 py-1.5 text-sm bg-surface text-fg focus:outline-none focus:border-accent" />
          <button onClick={saveKey} disabled={!keyInput.trim()}
            className="w-full px-3 py-1.5 text-sm rounded bg-fg text-toolbar hover:opacity-90 transition-opacity disabled:opacity-40">Conectar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-[360px] border-l border-border bg-panel flex flex-col shrink-0">
      <Header onClose={onClose} onKey={() => { setKeyInput(''); setEditingKey(true) }} />
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-xs text-muted text-center mt-6 px-4">
            {emptyHint(activeDoc?.file_name)}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-fg text-toolbar' : 'bg-surface text-fg border border-border'
            }`}>
              {m.text || (streaming && reqKeyRef.current === convKey && i === messages.length - 1 ? <Loader2 size={14} className="animate-spin" /> : '')}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border p-2">
        <div className="flex items-end gap-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder={activeDoc ? `Pregunta sobre ${activeDoc.file_name}…` : 'Abre un PDF para preguntar…'}
            className="flex-1 resize-none border border-border rounded px-2 py-1.5 text-sm bg-surface text-fg focus:outline-none focus:border-accent" />
          <button onClick={() => (streaming ? stop() : send(input))} disabled={!streaming && !input.trim()}
            title={streaming ? 'Detener' : 'Enviar'}
            className="p-2 rounded-lg bg-fg text-toolbar hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0">
            {streaming ? <Square size={16} /> : <Send size={16} />}
          </button>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMsgsFor(convKey, () => [])} className="mt-1 text-[11px] text-muted hover:text-fg flex items-center gap-1">
            <Eraser size={11} /> Limpiar conversación
          </button>
        )}
      </div>
    </div>
  )
}

function emptyHint(name?: string) {
  return name ? `Pregúntame lo que quieras sobre “${name}”. Puedo resumirlo, responder dudas o extraer datos.` : 'Abre un PDF y pregúntame sobre su contenido.'
}

function Header({ onClose, onKey }: { onClose: () => void; onKey: () => void }) {
  return (
    <div className="h-10 flex items-center gap-2 px-3 border-b border-border shrink-0">
      <Sparkles size={16} className="text-fg" />
      <span className="text-sm font-semibold flex-1">Asistente IA</span>
      <button onClick={onKey} title="Cambiar API key" className="p-1.5 rounded text-muted hover:text-fg hover:bg-hover transition-colors"><KeyRound size={15} /></button>
      <button onClick={onClose} title="Cerrar" className="p-1.5 rounded text-muted hover:text-fg hover:bg-hover transition-colors"><X size={16} /></button>
    </div>
  )
}
