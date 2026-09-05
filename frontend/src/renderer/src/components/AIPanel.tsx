import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, X, Send, KeyRound, Loader2, Eraser, Square } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { PanelHeader, SegmentedGroup, iconBtn } from './panelUi'

const LEGACY_KEY_STORAGE = 'pdfmaster_anthropic_key'

interface Msg { role: 'user' | 'assistant'; text: string }

// Las conversaciones sobreviven a cerrar el panel. El panel se desmonta al cerrarlo
// (`{aiOpen && <AIPanel/>}`), así que tenerlas solo en su estado significaba perder el
// hilo entero por cerrarlo sin querer — justo lo contrario de la intención de
// mantener una conversación por documento.
const conversacionesGuardadas: Record<string, Msg[]> = {}

export default function AIPanel({ onClose }: { onClose: () => void }) {
  const { docs, activeDocId } = useStoreSlice('docs', 'activeDocId')
  const activeDoc = docs.find((d) => d.doc_id === activeDocId)

  // La key vive cifrada en el main (safeStorage); aquí solo se sabe si existe. `null`
  // mientras se pregunta: arrancando en `false`, cada apertura del panel pintaba un
  // frame del onboarding de «conecta tu cuenta» aunque la key estuviera guardada.
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [editingKey, setEditingKey] = useState(false)

  useEffect(() => {
    // Migración: keys guardadas en localStorage por versiones anteriores pasan al
    // almacén cifrado y se borran de localStorage.
    const legacy = localStorage.getItem(LEGACY_KEY_STORAGE)
    if (legacy) {
      window.api.aiSetKey(legacy).then((r) => {
        if (r.success) {
          localStorage.removeItem(LEGACY_KEY_STORAGE)
          setHasKey(true)
        }
      })
      return
    }
    window.api.aiHasKey().then(setHasKey)
  }, [])
  // Conversación independiente por documento (clave = doc_id, o '__nodoc__' sin doc).
  const [conversations, setConversations] = useState<Record<string, Msg[]>>(conversacionesGuardadas)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [scope, setScope] = useState<'doc' | 'page'>('doc')
  const reqRef = useRef<string | null>(null)
  const reqKeyRef = useRef<string>('__nodoc__')
  const scrollRef = useRef<HTMLDivElement>(null)

  const convKey = activeDocId || '__nodoc__'
  // `|| []` a secas devolvia un array nuevo por render, asi que el efecto que baja el
  // scroll dependia de una identidad que cambiaba siempre: se ejecutaba en cada render
  // del panel, no cuando llegaba un mensaje.
  const messages = useMemo(() => conversations[convKey] || [], [conversations, convKey])
  const setMsgsFor = (key: string, fn: (prev: Msg[]) => Msg[]) =>
    setConversations((c) => {
      const next = { ...c, [key]: fn(c[key] || []) }
      conversacionesGuardadas[key] = next[key]
      return next
    })

  useEffect(() => {
    const offChunk = window.api.onAiChunk(({ requestId, text }) => {
      if (requestId !== reqRef.current) return
      setMsgsFor(reqKeyRef.current, (m) => {
        const next = [...m]
        next[next.length - 1] = { role: 'assistant', text: next[next.length - 1].text + text }
        return next
      })
    })
    const offDone = window.api.onAiDone(({ requestId, truncated }) => {
      if (requestId !== reqRef.current) return
      // Al llegar al tope de longitud la API corta la respuesta a media frase. Sin
      // decirlo, la frase cortada se lee como un fallo de la app.
      if (truncated) {
        setMsgsFor(reqKeyRef.current, (m) => {
          const next = [...m]
          const ultimo = next[next.length - 1]
          next[next.length - 1] = { role: 'assistant', text: `${ultimo.text}

⚠️ Respuesta cortada por longitud. Pedile que siga o acotá la pregunta.` }
          return next
        })
      }
      setStreaming(false); reqRef.current = null
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

  // Apertura con preset desde el ribbon IA. El listener se registra UNA vez y llama a
  // la última versión de `send` por ref: al depender de `conversations`, se
  // desuscribía y volvía a suscribirse con cada fragmento del streaming.
  const sendRef = useRef<(text: string) => void>(() => {})
  useEffect(() => {
    const onPreset = (e: Event) => {
      const preset = (e as CustomEvent).detail?.preset as string | undefined
      if (preset) sendRef.current(preset)
    }
    window.addEventListener('app:ai-preset', onPreset as EventListener)
    return () => window.removeEventListener('app:ai-preset', onPreset as EventListener)
  }, [])

  const saveKey = async () => {
    const k = keyInput.trim()
    if (!k) return
    const r = await window.api.aiSetKey(k)
    if (r.success) { setHasKey(true); setEditingKey(false); setKeyInput('') }
  }

  const send = (text: string) => {
    const content = text.trim()
    if (!content || streaming || !hasKey) return
    const key = activeDocId || '__nodoc__'
    const history = [...(conversations[key] || []), { role: 'user' as const, text: content }]
    const requestId = crypto.randomUUID()
    reqRef.current = requestId
    reqKeyRef.current = key
    setMsgsFor(key, () => [...history, { role: 'assistant', text: '' }])
    setInput('')
    setStreaming(true)
    window.api.aiChat({ requestId, docId: activeDocId, messages: history, scope, page: activeDoc?.currentPage ?? 0 })
  }
  sendRef.current = send

  if (hasKey === null) {
    return (
      <div className="w-[360px] border-l border-border-strong bg-panel flex flex-col shrink-0">
        <Header onClose={onClose} onKey={() => {}} />
        <div className="flex-1 skeleton opacity-40 m-3 rounded-token" />
      </div>
    )
  }

  if (!hasKey || editingKey) {
    return (
      <div className="w-[360px] border-l border-border-strong bg-panel flex flex-col shrink-0">
        <Header onClose={onClose} onKey={() => {}} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <KeyRound size={28} className="text-muted" />
          <p className="text-base text-fg font-medium">Conecta tu cuenta de Anthropic</p>
          <p className="text-mini text-muted">Usa tu suscripción (Claude Pro/Max): instala Claude Code y ejecuta <code className="px-1 rounded-token-sm bg-surface border border-border">claude setup-token</code> en una terminal. Copia el token (empieza por <code className="px-1 rounded-token-sm bg-surface border border-border">sk-ant-oat…</code>) y pégalo aquí.</p>
          <p className="text-micro text-muted">También sirve una API key de pago (<code className="px-1 rounded-token-sm bg-surface border border-border">sk-ant-api…</code>). Se guarda solo en este equipo.</p>
          <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveKey()} placeholder="sk-ant-oat… o sk-ant-api…"
            className="w-full border border-border rounded-token-sm px-2 py-1.5 text-base bg-surface text-fg focus:outline-none focus:border-fg" />
          <button onClick={saveKey} disabled={!keyInput.trim()}
            className="w-full px-3 py-1.5 text-base rounded-token-sm bg-fg text-panel hover:opacity-90 active:opacity-80 transition-[filter] duration-fast ease-token disabled:opacity-40 disabled:cursor-not-allowed">Conectar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-[360px] border-l border-border-strong bg-panel flex flex-col shrink-0">
      <Header onClose={onClose} onKey={() => { setKeyInput(''); setEditingKey(true) }} />
      {/* live region: sin esto, un lector de pantalla no anuncia la respuesta que va
          llegando por streaming. */}
      <div ref={scrollRef} role="log" aria-live="polite" aria-label="Conversación con el asistente"
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-mini text-muted text-center mt-6 px-4 space-y-3">
            <p>{emptyHint(activeDoc?.file_name)}</p>
            {activeDoc && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {[
                  ['Resumí las marcas de este PDF: tipo, página y texto.', 'Resumir marcas'],
                  ['Listá los pendientes abiertos (marcas no resueltas) por página.', 'Pendientes'],
                  ['Extraé tablas o cómputos que veas en el documento, en formato lista.', 'Extraer tablas'],
                ].map(([prompt, label]) => (
                  <button key={label} onClick={() => send(prompt)}
                    className="px-2.5 h-7 rounded-token border border-border text-mini text-fg transition-colors duration-fast ease-token hover:border-fg/30 hover:bg-hover">
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-token px-3 py-2 text-base whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-selected text-fg' : 'bg-active text-fg border border-border'
            }`}>
              {m.text || (streaming && reqKeyRef.current === convKey && i === messages.length - 1 ? <Loader2 size={14} className="animate-spin" /> : '')}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border p-2">
        <div className="flex items-center gap-1.5 mb-1.5 text-micro">
          <span className="text-muted shrink-0">Contexto</span>
          <SegmentedGroup<'doc' | 'page'> value={scope} onChange={setScope}
            options={[['doc', 'Documento'], ['page', 'Página actual']]} />
        </div>
        <div className="flex items-end gap-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2}
            aria-label="Pregunta para el asistente" 
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder={activeDoc ? `Pregunta sobre ${activeDoc.file_name}…` : 'Abre un PDF para preguntar…'}
            className="flex-1 resize-none border border-border rounded-token-sm px-2 py-1.5 text-base bg-surface text-fg focus:outline-none focus:border-fg" />
          <button onClick={() => (streaming ? stop() : send(input))} disabled={!streaming && !input.trim()}
            title={streaming ? 'Detener' : 'Enviar'} aria-label={streaming ? 'Detener la respuesta' : 'Enviar la pregunta'}
            className="p-2 rounded-token bg-fg text-panel hover:opacity-90 active:opacity-80 transition-[filter] duration-fast ease-token disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
            {streaming ? <Square size={16} /> : <Send size={16} />}
          </button>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMsgsFor(convKey, () => [])} className="mt-1 -ml-1 px-1.5 py-0.5 rounded-token-sm text-micro text-muted flex items-center gap-1 transition-colors duration-fast ease-token hover:text-fg hover:bg-hover">
            <Eraser size={12} /> Limpiar conversación
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
    // El accent está reservado al relleno de un estado activo: decorando el icono del
    // título competía con el segmentado de contexto, que sí dice algo.
    <PanelHeader icon={Sparkles} title="Asistente IA">
      <button onClick={onKey} title="Cambiar API key" aria-label="Cambiar la clave de Anthropic" className={iconBtn}><KeyRound size={14} /></button>
      <button onClick={onClose} title="Cerrar" aria-label="Cerrar el asistente" className={iconBtn}><X size={14} /></button>
    </PanelHeader>
  )
}
