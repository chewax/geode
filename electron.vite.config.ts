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
    // El runtime del iframe de plugins es un IIFE AUTOCONTENIDO compilado aparte
    // (`build:iframe`, vite.iframe.config.ts). Se marca como ASSET para importarlo
    // con `?url` y leer su texto (se inyecta inline en el srcdoc del iframe).
    assetsInclude: ['**/iframe-runtime/runtime.iife.js'],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@domain': resolve('src/domain'),
        '@renderer': resolve('src/renderer/src')
      }
    },
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
