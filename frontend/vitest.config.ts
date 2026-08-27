import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/renderer/src/**/*.test.{ts,tsx}', 'src/main/**/*.test.ts'],
    setupFiles: ['src/renderer/src/test/setup.ts'],
  },
})
