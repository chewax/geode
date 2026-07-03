import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { Check, RefreshCw, Cloud, Sparkles, Puzzle, FolderOpen, AlertTriangle } from 'lucide-react'
import type {
  AiConfig,
  AiModel,
  DeviceFlowStart,
  GithubConfig,
  InstalledPlugin
} from '@shared/ipc'
import { BUILTIN_PLUGINS } from './plugins'

interface SettingsModalProps {
  onClose: () => void
  onConfigChange: (config: AiConfig) => void
}

/** Secciones del panel de ajustes (aside izquierdo). */
type Section = 'ai' | 'github' | 'plugins'

/** USD por token → texto "$X/M" (por millón de tokens), o "gratis"/"—". */
function perMillion(perToken: string | null): string {
  if (perToken == null) return '—'
  const n = Number(perToken)
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return 'gratis'
  const m = n * 1_000_000
  return `$${m < 1 ? m.toFixed(2) : m.toFixed(m < 100 ? 1 : 0)}/M`
}

/** Ajustes de IA: API key de OpenRouter, modelo (con precios) y activación. */
export function SettingsModal({ onClose, onConfigChange }: SettingsModalProps): JSX.Element {
  const [section, setSection] = useState<Section>('ai')
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [models, setModels] = useState<AiModel[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)

  // GitHub
  const [github, setGithub] = useState<GithubConfig | null>(null)
  const [remoteInput, setRemoteInput] = useState('')
  const [device, setDevice] = useState<DeviceFlowStart | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Plugins externos
  const [extPlugins, setExtPlugins] = useState<InstalledPlugin[]>([])
  const refreshPlugins = useCallback(async () => {
    setExtPlugins(await window.geode.plugins.list())
  }, [])

  const apply = useCallback(
    (c: AiConfig) => {
      setConfig(c)
      onConfigChange(c)
    },
    [onConfigChange]
  )

  const loadModels = useCallback(async () => {
    setLoadingModels(true)
    setError(null)
    try {
      const list = await window.geode.ai.listModels()
      list.sort((a, b) => a.name.localeCompare(b.name))
      setModels(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los modelos')
    } finally {
      setLoadingModels(false)
    }
  }, [])

  // Cargar config al abrir; si ya hay key, traer la lista de modelos.
  useEffect(() => {
    void (async () => {
      const c = await window.geode.ai.getConfig()
      apply(c)
      if (c.hasKey) void loadModels()
      const g = await window.geode.github.getConfig()
      setGithub(g)
      setRemoteInput(g.remote ?? '')
      void refreshPlugins()
    })()
  }, [apply, loadModels, refreshPlugins])

  const togglePlugin = async (id: string, enabled: boolean): Promise<void> => {
    setExtPlugins(await window.geode.plugins.setEnabled(id, enabled))
  }

  const connectGithub = async (): Promise<void> => {
    setConnecting(true)
    setError(null)
    try {
      setDevice(await window.geode.github.startDeviceFlow())
      const cfg = await window.geode.github.completeDeviceFlow() // espera la autorización
      setGithub(cfg)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo conectar con GitHub')
    } finally {
      setConnecting(false)
      setDevice(null)
    }
  }

  const disconnectGithub = async (): Promise<void> => {
    setGithub(await window.geode.github.disconnect())
  }

  const saveRemote = async (): Promise<void> => {
    const cfg = await window.geode.github.setRemote(remoteInput.trim())
    setGithub(cfg)
    setRemoteInput(cfg.remote ?? '') // muestra la URL ya normalizada (SSH→HTTPS)
  }

  const saveKey = async (): Promise<void> => {
    if (!keyInput.trim()) return
    setError(null)
    apply(await window.geode.ai.setKey(keyInput.trim()))
    setKeyInput('')
    void loadModels()
  }

  const clearKey = async (): Promise<void> => {
    apply(await window.geode.ai.clearKey())
    setModels([])
  }

  const selectModel = async (model: string): Promise<void> => {
    apply(await window.geode.ai.setModel(model))
  }

  const toggleEnabled = async (enabled: boolean): Promise<void> => {
    apply(await window.geode.ai.setEnabled(enabled))
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
  }, [models, filter])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h2>Ajustes</h2>
        </div>

        <div className="settings-body">
          <nav className="settings-nav">
            <button className={section === 'ai' ? 'active' : ''} onClick={() => setSection('ai')}>
              <Sparkles size={15} /> Mensajes por IA
            </button>
            <button className={section === 'github' ? 'active' : ''} onClick={() => setSection('github')}>
              <Cloud size={15} /> GitHub
            </button>
            <button className={section === 'plugins' ? 'active' : ''} onClick={() => setSection('plugins')}>
              <Puzzle size={15} /> Plugins
            </button>
          </nav>

          <div className="settings-content">
            {section === 'ai' && (
              <section className="settings-section">
                <h2><Sparkles size={18} /> Mensajes por IA</h2>
                <p className="modal-sub">
                  Motor: <strong>OpenRouter</strong>. La API key se guarda cifrada en tu equipo, fuera
                  del repositorio.
                </p>

                <label className="field-label">API key de OpenRouter</label>
                {config?.hasKey ? (
                  <div className="key-row">
                    <span className="key-set"><Check size={14} /> Key guardada</span>
                    <button onClick={() => void clearKey()}>Quitar</button>
                  </div>
                ) : (
                  <div className="key-row">
                    <input
                      type="password"
                      className="text-input"
                      placeholder="sk-or-…"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                    />
                    <button onClick={() => void saveKey()} disabled={!keyInput.trim()}>
                      Guardar
                    </button>
                  </div>
                )}

                <label className="field-label">
                  Modelo
                  {config?.model && <span className="model-current">{config.model}</span>}
                </label>

                {!config?.hasKey ? (
                  <p className="hint">Guardá una API key para ver los modelos.</p>
                ) : (
                  <>
                    <div className="key-row">
                      <input
                        className="text-input"
                        placeholder="Filtrar modelos…"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                      <button className="icon-btn" onClick={() => void loadModels()} disabled={loadingModels} title="Recargar modelos">
                        <RefreshCw size={15} className={loadingModels ? 'spin' : ''} />
                      </button>
                    </div>

                    <ul className="model-list">
                      {filtered.length === 0 && !loadingModels && (
                        <li className="model-empty">Sin resultados</li>
                      )}
                      {filtered.map((m) => (
                        <li
                          key={m.id}
                          className={`model-row${m.id === config?.model ? ' sel' : ''}`}
                          onClick={() => void selectModel(m.id)}
                          title={m.id}
                        >
                          <div className="m-name">{m.name}</div>
                          <div className="m-meta">
                            <span className="m-id">{m.id}</span>
                            <span className="m-price">
                              in {perMillion(m.promptPrice)} · out {perMillion(m.completionPrice)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="hint">
                      Para resumir cambios conviene un modelo rápido y barato (mirá el precio por
                      millón de tokens).
                    </p>
                  </>
                )}

                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={config?.enabled ?? false}
                    disabled={!config?.hasKey || !config?.model}
                    onChange={(e) => void toggleEnabled(e.target.checked)}
                  />
                  Generar resúmenes de versión con IA
                </label>
              </section>
            )}

            {section === 'github' && (
              <section className="settings-section">
                <h2><Cloud size={18} /> GitHub — guardar en tu repo</h2>
                <p className="modal-sub">
                  Conectá tu cuenta y elegí el repo donde se guardan (push) los commits de tu vault.
                </p>

                {github?.connected ? (
                  <div className="key-row">
                    <span className="key-set"><Check size={14} /> Conectado como {github.login}</span>
                    <button onClick={() => void disconnectGithub()}>Desconectar</button>
                  </div>
                ) : device ? (
                  <div className="device-box">
                    <p>Ingresá este código en GitHub (se abrió en tu navegador):</p>
                    <div className="device-code">{device.userCode}</div>
                    <p className="hint">{device.verificationUri} — esperando autorización…</p>
                  </div>
                ) : (
                  <button onClick={() => void connectGithub()} disabled={connecting}>
                    {connecting ? 'conectando…' : 'Conectar con GitHub'}
                  </button>
                )}

                {github?.connected && (
                  <>
                    <label className="field-label">URL del repo</label>
                    <div className="key-row">
                      <input
                        className="text-input"
                        placeholder="https://github.com/usuario/mis-notas.git"
                        value={remoteInput}
                        onChange={(e) => setRemoteInput(e.target.value)}
                      />
                      <button onClick={() => void saveRemote()} disabled={remoteInput.trim() === (github.remote ?? '')}>
                        Guardar
                      </button>
                    </div>

                    <p className="hint">
                      El push al remoto es siempre manual: usá el botón <b>Push</b> de la barra
                      superior.
                    </p>
                  </>
                )}
              </section>
            )}

            {section === 'plugins' && (
              <section className="settings-section">
                <h2><Puzzle size={18} /> Plugins</h2>

                <div className="ps-group-head">
                  <h3>Instalados</h3>
                  <div className="ps-actions">
                    <button className="icon-btn" title="Recargar lista" onClick={() => void refreshPlugins()}>
                      <RefreshCw size={14} />
                    </button>
                    <button onClick={() => void window.geode.plugins.openDir()}>
                      <FolderOpen size={14} /> Abrir carpeta
                    </button>
                  </div>
                </div>
                <p className="modal-sub">
                  Poné cada plugin en su propia carpeta dentro de la carpeta de plugins, con un
                  <code> plugin.json</code>. Los cambios de activación se aplican al reiniciar la app.
                </p>

                {extPlugins.length === 0 ? (
                  <p className="plugin-empty">No hay plugins instalados todavía.</p>
                ) : (
                  <ul className="plugin-settings-list">
                    {extPlugins.map((p) => (
                      <li key={p.manifest.id} className="plugin-settings-row">
                        <div className="ps-info">
                          <div className="ps-name">
                            {p.manifest.name}
                            <span className="ps-ver">v{p.manifest.version}</span>
                          </div>
                          <div className="ps-id">{p.manifest.id}</div>
                          {p.manifest.description && <div className="ps-desc">{p.manifest.description}</div>}
                          {p.error && (
                            <div className="ps-err"><AlertTriangle size={12} /> {p.error}</div>
                          )}
                        </div>
                        {!p.error && (
                          <label className="ps-toggle" title={p.enabled ? 'Activado' : 'Desactivado'}>
                            <input
                              type="checkbox"
                              checked={p.enabled}
                              onChange={(e) => void togglePlugin(p.manifest.id, e.target.checked)}
                            />
                            {p.enabled ? 'activado' : 'desactivado'}
                          </label>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="ps-group-head">
                  <h3>Internos</h3>
                </div>
                <ul className="plugin-settings-list">
                  {BUILTIN_PLUGINS.map((p) => (
                    <li key={p.id} className="plugin-settings-row">
                      <div className="ps-info">
                        <div className="ps-name">{p.name}</div>
                        <div className="ps-id">{p.id}</div>
                      </div>
                      <span className="ps-on"><Check size={12} /> activo</span>
                    </li>
                  ))}
                </ul>
                <p className="hint">
                  Abrí la paleta de comandos con <b>Ctrl+P</b> para ver lo que aportan.
                </p>
              </section>
            )}

            {error && <p className="modal-error">⚠ {error}</p>}
          </div>
        </div>

        <div className="modal-actions settings-actions">
          <button className="primary" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
