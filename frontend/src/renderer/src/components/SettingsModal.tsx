import { useEffect, useRef, useState } from 'react'
import { X, Settings } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { type ThemePreference, type WheelMode, type DefaultZoomMode } from '../store/usePdfStore'

/** Lo que dura `panel-out`/`overlay-out` en App.css (`--dur-fast`). */
const SALIDA = 120
const sinMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Ajustes mínimos: lo que antes solo se podía cambiar tocando localStorage o no
 * se podía cambiar en absoluto. */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [saliendo, setSaliendo] = useState(false)
  const cerrando = useRef(false)
  const salida = useRef<number | null>(null)

  useEffect(() => () => { if (salida.current) clearTimeout(salida.current) }, [])

  /** Único camino de cierre (Esc, clic en el fondo, la X): marca la salida y desmonta
   * cuando acaba. El guardia impide dispararla dos veces. */
  const cerrar = () => {
    if (cerrando.current) return
    cerrando.current = true
    if (sinMovimiento()) { onClose(); return }
    setSaliendo(true)
    salida.current = window.setTimeout(onClose, SALIDA)
  }

  const {
    annotationAuthor, setAnnotationAuthor, stickyTools, setStickyTools,
    themePreference, setThemePreference, wheelMode, setWheelMode,
    uiScale, setUiScale, defaultZoomMode, setDefaultZoomMode,
    defaultUnit, setDefaultUnit, restoreSession, setRestoreSession,
    backupOnSave, setBackupOnSave, showToast,
  } = useStoreSlice(
    'annotationAuthor', 'setAnnotationAuthor', 'stickyTools', 'setStickyTools',
    'themePreference', 'setThemePreference', 'wheelMode', 'setWheelMode',
    'uiScale', 'setUiScale', 'defaultZoomMode', 'setDefaultZoomMode',
    'defaultUnit', 'setDefaultUnit', 'restoreSession', 'setRestoreSession',
    'backupOnSave', 'setBackupOnSave', 'showToast',
  )

  const [exportando, setExportando] = useState(false)

  /** Los logs viven en %APPDATA%\pdf-master\logs y nadie sabe que existen: sin esto,
   * reportar un fallo desde otra máquina es describirlo de memoria. */
  const exportarDiagnostico = async () => {
    setExportando(true)
    try {
      const ruta = await window.api.exportDiagnostics()
      if (!ruta) return
      showToast('Diagnóstico guardado', 'success')
      window.api.showInFolder(ruta)
    } catch {
      showToast('No se pudo generar el diagnóstico', 'error')
    } finally {
      setExportando(false)
    }
  }

  const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-ui text-fg">{label}</div>
        {hint && <div className="text-micro text-muted mt-0.5 leading-snug">{hint}</div>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  )

  /** Los ajustes se leen por bloques: qué firmo y cómo marco · cómo se ve · qué
   * pasa con mis archivos. Nueve filas seguidas no eran una lista, eran un muro. */
  const Seccion = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
    <section className="px-4 py-1">
      <h3 className="text-micro font-semibold uppercase tracking-wider text-muted pt-3 pb-1">{titulo}</h3>
      <div className="divide-y divide-border">{children}</div>
    </section>
  )

  const Segmented = <T extends string>({ value, options, onChange }: {
    value: T
    options: Array<[T, string]>
    onChange: (v: T) => void
  }) => (
    <div className="flex items-center gap-0.5 rounded-token border border-border bg-surface p-0.5">
      {options.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)}
          className={`px-2.5 h-7 rounded-token-sm text-micro transition-colors duration-fast ease-token ${
            value === id ? 'bg-accent text-on-accent' : 'text-muted hover:bg-hover hover:text-fg'
          }`}>
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="overlay-in fixed inset-0 z-dialog flex items-center justify-center bg-[rgb(var(--scrim)/0.45)] backdrop-blur-[2px]"
      data-closing={saliendo || undefined} onClick={cerrar}>
      <div role="dialog" aria-modal="true" aria-label="Ajustes" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') cerrar() }}
        className="panel-in w-[500px] max-w-[92vw] max-h-[86vh] overflow-y-auto rounded-token-lg border border-border shadow-token-lg bg-panel text-fg">
        <div className="sticky top-0 z-raised flex items-center gap-2 px-4 py-3 border-b border-border bg-panel">
          <Settings size={16} className="text-muted" />
          <h2 className="text-base font-semibold flex-1">Ajustes</h2>
          <button onClick={cerrar} aria-label="Cerrar"
            className="p-1 rounded-token-sm text-muted hover:text-fg hover:bg-hover transition-colors"><X size={16} /></button>
        </div>

        <div className="pb-2">
          <Seccion titulo="Marcado">
          <Row label="Tu nombre" hint="Firma las marcas que crees; se usa para filtrar por autor y en las respuestas.">
            <input value={annotationAuthor} onChange={(e) => setAnnotationAuthor(e.target.value)}
              placeholder="Sin autor" autoFocus
              className="w-44 border border-border rounded-token-sm px-2 h-7 text-mini bg-surface text-fg placeholder:text-muted focus:outline-none focus:border-accent" />
          </Row>

          <Row label="Herramienta fija" hint="La herramienta se queda activa tras cada marca; Esc la suelta.">
            <Segmented<'on' | 'off'> value={stickyTools ? 'on' : 'off'}
              options={[['on', 'Fija'], ['off', 'Un uso']]}
              onChange={(v) => setStickyTools(v === 'on')} />
          </Row>

          <Row label="Unidad de medida por defecto" hint="Se propone al calibrar la escala de un plano.">
            <select value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value as typeof defaultUnit)}
              className="border border-border rounded-token-sm px-2 h-7 text-mini bg-surface text-fg focus:outline-none focus:border-accent">
              {(['mm', 'cm', 'm', 'ft', 'in'] as const).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Row>
          </Seccion>

          <Seccion titulo="Vista">
          <Row label="Rueda del ratón" hint="Al llegar al final de la página: seguir desplazando o saltar a la siguiente.">
            <Segmented<WheelMode> value={wheelMode}
              options={[['page', 'Cambia de página'], ['scroll', 'Solo desplaza']]}
              onChange={setWheelMode} />
          </Row>

          <Row label="Tema">
            <Segmented<ThemePreference> value={themePreference}
              options={[['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Sistema']]}
              onChange={setThemePreference} />
          </Row>

          <Row label="Tamaño de la interfaz" hint="Escala menús, paneles y textos de la app (no el PDF en sí).">
            <div className="flex items-center gap-2">
              <input type="range" min={75} max={150} step={5} value={Math.round(uiScale * 100)}
                onChange={(e) => setUiScale(parseInt(e.target.value) / 100)} className="w-28 accent-accent" />
              <span className="text-micro text-muted w-9 tabular">{Math.round(uiScale * 100)}%</span>
            </div>
          </Row>

          <Row label="Zoom al abrir un PDF">
            <Segmented<DefaultZoomMode> value={defaultZoomMode}
              options={[['fit-page', 'Página'], ['fit-width', 'Ancho'], ['actual', '100%']]}
              onChange={setDefaultZoomMode} />
          </Row>

          </Seccion>

          <Seccion titulo="Archivos">
          <Row label="Reabrir los documentos al iniciar" hint="Restaura las pestañas de la última sesión.">
            <Segmented<'on' | 'off'> value={restoreSession ? 'on' : 'off'}
              options={[['on', 'Sí'], ['off', 'No']]}
              onChange={(v) => setRestoreSession(v === 'on')} />
          </Row>

          <Row label="Copia .bak al guardar"
            hint="Activado por defecto: la primera vez que guardás in-place se deja una copia .bak junto al original. Nunca en automático.">
            <Segmented<'on' | 'off'> value={backupOnSave ? 'on' : 'off'}
              options={[['off', 'No'], ['on', 'Sí']]}
              onChange={(v) => setBackupOnSave(v === 'on')} />
          </Row>
          </Seccion>

          <Seccion titulo="Diagnóstico">
          <Row label="Exportar diagnóstico"
            hint="Un .txt con versiones, si el motor responde y la cola de los registros. Para adjuntar cuando algo falla.">
            <button onClick={exportarDiagnostico} disabled={exportando}
              className="px-2.5 h-7 rounded-token-sm text-micro border border-border bg-surface text-fg hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-fast ease-token">
              {exportando ? 'Generando…' : 'Exportar'}
            </button>
          </Row>
          </Seccion>
        </div>

        <div className="px-4 py-2.5 border-t border-border text-micro text-muted">
          Los ajustes se guardan al instante en este equipo.
        </div>
      </div>
    </div>
  )
}
