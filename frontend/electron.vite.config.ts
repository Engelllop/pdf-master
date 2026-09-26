import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    root: resolve(__dirname, 'src/renderer'),
    // El CORS del motor (backend/main.py) solo acepta este puerto en desarrollo: si
    // estuviera ocupado, Vite saltaba al siguiente y el motor rechazaba todo sin que
    // se notara por qué. Con strictPort falla al arrancar, diciendo que está ocupado.
    server: {
      port: 5173,
      strictPort: true
    },
    build: {
      // Solo bajo demanda: el sourcemap del renderer son varios MB y no tiene nada
      // que hacer dentro del instalador. `npm run analizar:bundle` lo necesita para
      // atribuir los bytes del chunk a cada fuente.
      sourcemap: !!process.env.ANALIZAR_BUNDLE,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
