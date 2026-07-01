import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { AppInfo } from '@shared/ipc'

/**
 * Pantalla mínima de Fase 0: confirma que el puente IPC tipado funciona
 * extremo a extremo (renderer → preload → main → back). No es UI de producto;
 * es la prueba viva de que el andamiaje está sano.
 */
export function App(): JSX.Element {
  const [pong, setPong] = useState<string>('…')
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.geode.ping().then(setPong)
    void window.geode.getAppInfo().then(setInfo)
  }, [])

  return (
    <main className="app">
      <h1>Geode</h1>
      <p className="tagline">Notas versionadas sobre Git — local-first.</p>

      <section className="card">
        <h2>Estado del andamiaje</h2>
        <ul>
          <li>Puente IPC (ping): <strong>{pong}</strong></li>
          {info && (
            <>
              <li>App: <strong>{info.appVersion}</strong></li>
              <li>Electron: <strong>{info.electronVersion}</strong></li>
              <li>Chromium: <strong>{info.chromeVersion}</strong></li>
              <li>Node: <strong>{info.nodeVersion}</strong></li>
              <li>Plataforma: <strong>{info.platform}</strong></li>
            </>
          )}
        </ul>
      </section>
    </main>
  )
}
