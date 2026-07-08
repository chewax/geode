import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@domain': resolve('src/domain')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        // El preload DEBE ser CommonJS: con sandbox: true, Electron no admite
        // preloads ESM. Forzamos formato cjs y extensión .cjs.
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@domain': resolve('src/domain'),
        '@renderer': resolve('src/renderer/src')
      }
    },
    // El runtime del iframe (Fase 12 / ISO-01) es un IIFE AUTOCONTENIDO pre-
    // compilado aparte (paso `build:iframe`, vite.iframe.config.ts). Se marca como
    // ASSET para que el host lo importe con `?url` y obtenga su URL emitida; luego
    // hace `fetch()` same-origin de ese texto y lo inyecta inline en el srcdoc del
    // iframe. Sin esto, Vite trataría el `.js` como módulo del grafo (no como
    // asset) y `?url` no resolvería.
    assetsInclude: ['**/iframe-runtime/runtime.iife.js'],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html')
        }
      }
    },
    plugins: [react()]
  }
})
