import { usePdfStore } from '../store/usePdfStore'

export function useThemeClasses() {
  const theme = usePdfStore((s) => s.theme)
  return (dark: string, light: string) => (theme === 'dark' ? dark : light)
}
