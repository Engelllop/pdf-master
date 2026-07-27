import { X, Settings } from 'lucide-react'
import { useStoreSlice } from '../hooks/useStoreSlice'
import { type ThemePreference, type WheelMode, type DefaultZoomMode } from '../store/usePdfStore'

/** Ajustes mínimos: lo que antes solo se podía cambiar tocando localStorage o no
 * se podía cambiar en absoluto. */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const {
    annotationAuthor, setAnnotationAuthor, stickyTools, setStickyTools,
    themePreference, setThemePreference, wheelMode, setWheelMode,
    uiScale, setUiScale, defaultZoomMode, setDefaultZoomMode,
    defaultUnit, setDefaultUnit, restoreSession, setRestoreSession,
    backupOnSave, setBackupOnSave,
  } = useStoreSlice(
    'annotationAuthor', 'setAnnotationAuthor', 'stickyTools', 'setStickyTools',
    'themePreference', 'setThemePreference', 'wheelMode', 'setWheelMode',
    'uiScale', 'setUiScale', 'defaultZoomMode', 'setDefaultZoomMode',
    'defaultUnit', 'setDefaultUnit', 'restoreSession', 'setRestoreSession',
    'backupOnSave', 'setBackupOnSave',
  )

  const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-fg">{label}</div>
        {hint && <div className="text-[11px] text-muted mt-0.5 leading-snug">{hint}</div>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  )

  const Segmented = <T extends string>({ value, options, onChange }: {
    value: T
    options: Array<[T, string]>
    onChange: (v: T) => void
  }) => (
    <div className="flex items-center gap-1">
      {options.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)}
          className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
            value === id ? 'border-accent text-accent bg-active' : 'border-border text-muted hover:bg-hover'
          }`}>
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Ajustes" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        className="menu-pop w-[460px] max-w-[92vw] max-h-[86vh] overflow-y-auto rounded-lg border border-border shadow-2xl bg-panel text-fg">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Settings size={16} className="text-accent" />
          <h2 className="text-sm font-semibold flex-1">Ajustes</h2>
          <button onClick={onClose} aria-label="Cerrar"
            className="p-1 rounded text-muted hover:text-fg hover:bg-hover transition-colors"><X size={16} /></button>
        </div>

        <div className="px-4 py-2 divide-y divide-border">
          <Row label="Tu nombre" hint="Firma las marcas que crees; se usa para filtrar por autor y en las respuestas.">
            <input value={annotationAuthor} onChange={(e) => setAnnotationAuthor(e.target.value)}
              placeholder="Sin autor" autoFocus
              className="w-40 border border-border rounded px-2 py-1 text-[12px] bg-surface text-fg placeholder:text-muted focus:outline-none focus:border-accent" />
          </Row>

          <Row label="Herramienta fija" hint="La herramienta se queda activa tras cada marca; Esc la suelta.">
            <Segmented<'on' | 'off'> value={stickyTools ? 'on' : 'off'}
              options={[['on', 'Fija'], ['off', 'Un uso']]}
              onChange={(v) => setStickyTools(v === 'on')} />
          </Row>

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
                onChange={(e) => setUiScale(parseInt(e.target.value) / 100)} className="w-28" />
              <span className="text-[11px] text-muted w-9 tabular-nums">{Math.round(uiScale * 100)}%</span>
            </div>
          </Row>

          <Row label="Zoom al abrir un PDF">
            <Segmented<DefaultZoomMode> value={defaultZoomMode}
              options={[['fit-page', 'Página'], ['fit-width', 'Ancho'], ['actual', '100%']]}
              onChange={setDefaultZoomMode} />
          </Row>

          <Row label="Unidad de medida por defecto" hint="Se propone al calibrar la escala de un plano.">
            <select value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value as typeof defaultUnit)}
              className="border border-border rounded px-2 py-1 text-[12px] bg-surface text-fg focus:outline-none focus:border-accent">
              {(['mm', 'cm', 'm', 'ft', 'in'] as const).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Row>

          <Row label="Reabrir los documentos al iniciar" hint="Restaura las pestañas de la última sesión.">
            <Segmented<'on' | 'off'> value={restoreSession ? 'on' : 'off'}
              options={[['on', 'Sí'], ['off', 'No']]}
              onChange={(v) => setRestoreSession(v === 'on')} />
          </Row>

          <Row label="Copia .bak al guardar"
            hint="Guardar sobrescribe el original. Con esto se deja una copia junto al archivo (solo al guardar, nunca en automático).">
            <Segmented<'on' | 'off'> value={backupOnSave ? 'on' : 'off'}
              options={[['off', 'No'], ['on', 'Sí']]}
              onChange={(v) => setBackupOnSave(v === 'on')} />
          </Row>
        </div>

        <div className="px-4 py-2.5 border-t border-border text-[11px] text-muted">
          Los ajustes se guardan al instante en este equipo.
        </div>
      </div>
    </div>
  )
}
