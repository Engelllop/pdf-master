import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsModal from './SettingsModal'
import { usePdfStore } from '../store/usePdfStore'

const exportDiagnostics = vi.fn<() => Promise<string | null>>()
const showInFolder = vi.fn()

beforeEach(() => {
  exportDiagnostics.mockReset().mockResolvedValue('C:\\Users\\x\\Documents\\diag.txt')
  showInFolder.mockReset()
  Object.assign(window.api, { exportDiagnostics, showInFolder })
  usePdfStore.setState({ toasts: [] })
})

describe('exportar diagnóstico desde Ajustes', () => {
  it('guarda el informe y lo señala en la carpeta', async () => {
    render(<SettingsModal onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }))
    await waitFor(() => expect(exportDiagnostics).toHaveBeenCalledOnce())
    await waitFor(() => expect(showInFolder).toHaveBeenCalledWith('C:\\Users\\x\\Documents\\diag.txt'))
    expect(usePdfStore.getState().toasts.some((t) => t.message === 'Diagnóstico guardado')).toBe(true)
  })

  it('cancelar el diálogo no avisa de nada ni abre carpetas', async () => {
    exportDiagnostics.mockResolvedValue(null)
    render(<SettingsModal onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }))
    await waitFor(() => expect(exportDiagnostics).toHaveBeenCalledOnce())
    expect(showInFolder).not.toHaveBeenCalled()
    expect(usePdfStore.getState().toasts).toHaveLength(0)
  })

  it('un fallo del main se dice, no se traga', async () => {
    exportDiagnostics.mockRejectedValue(new Error('sin permisos'))
    render(<SettingsModal onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }))
    await waitFor(() =>
      expect(usePdfStore.getState().toasts.some((t) => t.type === 'error')).toBe(true),
    )
  })
})
