import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { CloudDownload, CloudOff, Plus, X, Lock, Globe, RefreshCw, Cloud, HardDrive, FolderCog, AlertTriangle } from 'lucide-react'
import type { DeviceFlowStart, GithubRepoInfo, VaultInfo } from '@shared/ipc'
import { t } from '@shared/i18n'

/** Pestañas del diálogo: local (sin cuenta), traer de GitHub o crear con respaldo. */
export type NewNotebookMode = 'local' | 'clone' | 'create'

/**
 * Diálogo "Nuevo cuaderno". Por defecto crea un cuaderno LOCAL (versionado con
 * git, sin cuenta ni nube): el respaldo en GitHub es opcional y vive en las otras
 * dos pestañas (traer uno respaldado / crear uno ya respaldado), que recién ahí
 * piden conectar la cuenta. La carpeta la elige el usuario en un diálogo nativo
 * (lo abre el main). onReady recibe el cuaderno listo para abrirlo.
 */
export function NewVaultDialog({
  githubConnected,
  initialMode = 'local',
  onReady,
  onClose
}: {
  githubConnected: boolean
  initialMode?: NewNotebookMode
  onReady: (info: VaultInfo) => void
  onClose: () => void
}): JSX.Element {
  const [connected, setConnected] = useState(githubConnected)
  const [device, setDevice] = useState<DeviceFlowStart | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [mode, setMode] = useState<NewNotebookMode>(initialMode)
  const [repos, setRepos] = useState<GithubRepoInfo[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null) // cloneUrl elegida
  const [name, setName] = useState('')
  const [isPrivate, setIsPrivate] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = async (): Promise<void> => {
    setConnecting(true)
    setError(null)
    try {
      setDevice(await window.geode.github.startDeviceFlow()) // abre github.com + muestra código
      await window.geode.github.completeDeviceFlow() // espera la autorización
      setConnected(true)
      setDevice(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setConnecting(false)
    }
  }

  useEffect(() => {
    if (!connected || mode !== 'clone') return
    let cancelled = false
    setRepos(null)
    setError(null)
    void (async () => {
      try {
        const list = await window.geode.github.listRepos()
        if (!cancelled) setRepos(list)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [connected, mode])

  const doClone = async (): Promise<void> => {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const info = await window.geode.vault.cloneFromGithub(selected)
      if (info) onReady(info) // null = el usuario canceló el diálogo de carpeta
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Cuaderno local: sin GitHub. `pickLocation` abre el selector de carpeta; si no,
  // va a la ubicación por defecto (Documentos/Geode).
  const doCreateLocal = async (pickLocation: boolean): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const info = await window.geode.vault.createLocal(name.trim(), pickLocation)
      if (info) onReady(info) // null = el usuario canceló el selector de carpeta
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const doCreate = async (): Promise<void> => {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const info = await window.geode.vault.createWithRepo(name.trim(), isPrivate)
      if (info) onReady(info)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal newvault-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nv-head">
          <h2>{t('Nuevo cuaderno')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('Cerrar')}>
            <X size={16} />
          </button>
        </div>

        <div className="nv-tabs">
          <button className={mode === 'local' ? 'active' : ''} onClick={() => setMode('local')}>
            <HardDrive size={14} /> {t('En este equipo')}
          </button>
          <button className={mode === 'clone' ? 'active' : ''} onClick={() => setMode('clone')}>
            <CloudDownload size={14} /> {t('Traer uno respaldado')}
          </button>
          <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>
            <Cloud size={14} /> {t('Crear cuaderno respaldado')}
          </button>
        </div>

        {mode === 'local' ? (
          <div className="nv-body">
            <label className="nv-label">{t('Nombre del cuaderno')}</label>
            <input
              className="nv-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy) void doCreateLocal(false)
              }}
              placeholder={t('mi-cuaderno')}
              autoFocus
            />
            <div className="nv-actions">
              <button onClick={onClose}>{t('Cancelar')}</button>
              <button disabled={busy} onClick={() => void doCreateLocal(true)}>
                <FolderCog size={14} /> {t('Elegir ubicación…')}
              </button>
              <button className="primary" disabled={busy} onClick={() => void doCreateLocal(false)}>
                {busy ? <RefreshCw size={14} className="spin" /> : <Plus size={14} />} {t('Crear y abrir')}
              </button>
            </div>
            <p className="hint">
              {t('Se guarda en Documentos/Geode, con todo su historial en tu equipo. No hace falta ninguna cuenta: podés respaldarlo en la nube cuando quieras.')}
            </p>
          </div>
        ) : !connected ? (
          <div className="nv-connect">
            <p className="modal-sub">
              {t('Para respaldar o traer cuadernos de la nube, conectá tu cuenta.')}
            </p>
            {device ? (
              <div className="nv-device">
                <p>
                  {t('Escribí este código en la página que se abrió:')}
                  <b className="nv-code"> {device.userCode}</b>
                </p>
                <p className="hint">{t('Esperando autorización…')}</p>
              </div>
            ) : (
              <button className="primary" disabled={connecting} onClick={() => void connect()}>
                {connecting ? <RefreshCw size={14} className="spin" /> : <Cloud size={14} />}{' '}
                {t('Conectar mi cuenta')}
              </button>
            )}
          </div>
        ) : mode === 'clone' ? (
          <div className="nv-body">
            {!repos ? (
              <p className="plugin-empty">{t('Buscando tus cuadernos respaldados…')}</p>
            ) : repos.length === 0 ? (
              <p className="plugin-empty">{t('Todavía no tenés cuadernos respaldados en tu cuenta.')}</p>
            ) : (
              <ul className="nv-repos">
                {repos.map((r) => (
                  <li
                    key={r.fullName}
                    className={`nv-repo${selected === r.cloneUrl ? ' sel' : ''}`}
                    onClick={() => setSelected(r.cloneUrl)}
                  >
                    <span className="nv-repo-name">{r.fullName}</span>
                    <span className="nv-repo-vis">
                      {r.private ? (
                        <>
                          <Lock size={11} /> {t('privado')}
                        </>
                      ) : (
                        <>
                          <Globe size={11} /> {t('público')}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="nv-actions">
              <button onClick={onClose}>{t('Cancelar')}</button>
              <button className="primary" disabled={!selected || busy} onClick={() => void doClone()}>
                {busy ? <RefreshCw size={14} className="spin" /> : <CloudDownload size={14} />} {t('Traer y abrir')}
              </button>
            </div>
            <p className="hint">{t('Vas a elegir una carpeta vacía en tu equipo donde guardar la copia.')}</p>
          </div>
        ) : (
          <div className="nv-body">
            <label className="nv-label">{t('Nombre del cuaderno')}</label>
            <input
              className="nv-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('mi-cuaderno')}
              autoFocus
            />
            <label className="nv-check">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              {t('Privado (solo vos lo ves)')}
            </label>
            <div className="nv-actions">
              <button onClick={onClose}>{t('Cancelar')}</button>
              <button className="primary" disabled={!name.trim() || busy} onClick={() => void doCreate()}>
                {busy ? <RefreshCw size={14} className="spin" /> : <Plus size={14} />} {t('Crear y abrir')}
              </button>
            </div>
            <p className="hint">{t('Vas a elegir dónde guardarlo: si la carpeta está vacía se usa tal cual; si no, se crea una subcarpeta con el nombre.')}</p>
          </div>
        )}
        {error && (
          <p className="modal-error">
            {mode === 'local' ? <AlertTriangle size={14} /> : <CloudOff size={14} />} {error}
          </p>
        )}
      </div>
    </div>
  )
}
