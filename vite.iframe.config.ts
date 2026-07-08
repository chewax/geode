import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * ── Build DEDICADO del runtime del iframe (Fase 12 / ISO-01) ─────────────────
 *
 * Emite un artefacto ÚNICO y AUTOCONTENIDO en formato IIFE que empaqueta
 * react/react-dom/react-jsx-runtime/@codemirror/state|view + el lado-plugin del
 * puente (`buildAsyncContext`) + el bootstrap. El host lo lee con `?url`+`fetch`
 * (same-origin, permitido por su CSP) e inyecta su TEXTO inline en el `srcdoc`
 * de un iframe sandbox de origen opaco (que conserva `connect-src 'none'`).
 *
 * Se compila APARTE de electron-vite (paso `build:iframe` en package.json) porque
 * un IIFE autocontenido, inyectable inline, NO coexiste con la entrada HTML del
 * renderer en un solo pase de Rollup: una build multi-entrada del renderer emite
 * ESM con chunks compartidos (react se separa), y esos `import` de nivel superior
 * no resuelven dentro del origen opaco del iframe. El IIFE de este build no tiene
 * imports sin resolver: es 100% self-contained.
 *
 * `define` fija `process.env.NODE_ENV` a 'production' para que react/react-dom
 * bundleados no referencien `process` (inexistente en el iframe).
 */
export default defineConfig({
  root: resolve('src/renderer'),
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@domain': resolve('src/domain'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  plugins: [react()],
  build: {
    // Se emite dentro del árbol del renderer para que la build principal lo pueda
    // referenciar con `import ... '?url'`. emptyOutDir=false: no borrar el resto.
    outDir: resolve('src/renderer/iframe-runtime'),
    emptyOutDir: false,
    minify: 'esbuild',
    lib: {
      entry: resolve('src/renderer/iframe-runtime/index.ts'),
      name: 'GeodePluginRuntime',
      formats: ['iife'],
      fileName: () => 'runtime.iife.js'
    },
    rollupOptions: {
      // Todo se inlinea: sin externals, sin chunks compartidos → artefacto único.
      output: { inlineDynamicImports: true }
    }
  }
})
