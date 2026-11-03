import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/**
 * Tests del núcleo (lógica pura + servicios del main sobre carpetas temporales).
 * Corren en Node: no levantan Electron. Los alias calcan electron.vite.config.ts.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@domain': resolve('src/domain')
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // isomorphic-git sobre disco real: más holgura que el default de 5 s.
    testTimeout: 20_000
  }
})
