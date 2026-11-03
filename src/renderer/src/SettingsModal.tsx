import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { Check, RefreshCw, Cloud, Sparkles, Puzzle, FolderOpen, AlertTriangle, Clock, SlidersHorizontal, Monitor, Sun, Moon, Mic, Languages } from 'lucide-react'
import type {
  AiConfig,
  AiModel,
  DeviceFlowStart,
  GithubConfig,
  InstalledPlugin
} from '@shared/ipc'
import { BUILTIN_PLUGINS } from './plugins'
import { getThemePref, setThemePref, type ThemePref } from './theme'
import { LOCALES, getLocale, t, type LocalePref } from '@shared/i18n'
import { tx } from './i18n'
import { PREF_FORMAT_TOOLBAR, useBoolPref } from './prefs'

interface SettingsModalProps {
  onClose: () => void
  onConfigChange: (config: AiConfig) => void
}

/** Secciones del panel de ajustes (aside izquierdo). */
type Section = 'general' | 'ai' | 'github' | 'plugins' | 'snapshots'

/** USD por token → texto "$X/M" (por millón de tokens), o "gratis"/"—". */
function perMillion(perToken: string | null): string {
  if (perToken == null) return '—'
  const n = Number(perToken)
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return t('gratis')
  const m = n * 1_000_000
  return `$${m < 1 ? m.toFixed(2) : m.toFixed(m < 100 ? 1 : 0)}/M`
}

/** Ajustes de IA: API key de OpenRouter, modelo (con precios) y activación. */
export function SettingsModal({ onClose, onConfigChange }: SettingsModalProps): JSX.Element {
  const [section, setSection] = useState<Section>('ai')
  const [themePref, setThemePrefState] = useState<ThemePref>(getThemePref)
  const [langPref, setLangPref] = useState<LocalePref>('system')
  useEffect(() => {
    window.geode.i18n.get().then((l) => setLangPref(l.pref)).catch(() => {})
  }, [])
  /** Cambia el idioma y recarga la ventana (todo el texto se arma al dibujar). */
  const changeLanguage = async (pref: LocalePref): Promise<void> => {
    if (pref === langPref) return
    const before = getLocale()
    const info = await window.geode.i18n.set(pref)
    setLangPref(info.pref)
    if (info.locale !== before) window.location.reload()
  }
  const [formatToolbar, setFormatToolbar] = useBoolPref(PREF_FORMAT_TOOLBAR, true)
  /** Atajo global del dictado (null si no se pudo registrar). */
  const [dictationShortcut, setDictationShortcut] = useState<string | null>(null)
  useEffect(() => {
    window.geode.dictation.getShortcut().then(setDictationShortcut).catch(() => setDictationShortcut(null))
  }, [])
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

  // Guardado automático (cadencia de snapshots; null = manual)
  const [cadence, setCadence] = useState<number | null>(10)
  // Opt-in de nombrado por IA de las auto-snapshots (default apagado)
  const [aiTitles, setAiTitles] = useState(false)

  // Modo Avanzado (interruptor de las superficies git; default off)
  const [advanced, setAdvanced] = useState(false)

  // Plugins externos
  const [extPlugins, setExtPlugins] = useState<InstalledPlugin[]>([])
  // Mapa de habilitados de los built-ins (id → on). Ausente = ON por defecto.
  const [builtinEnabled, setBuiltinEnabled] = useState<Record<string, boolean>>({})
  const refreshPlugins = useCallback(async () => {
    setExtPlugins(await window.geode.plugins.list())
    setBuiltinEnabled(await window.geode.plugins.getEnabled())
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
      setError(e instanceof Error ? e.message : t('No se pudieron cargar los modelos'))
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
      // Fallback: si snapshots.get() fallara, cadencia y aiTitles quedan en sus defaults.
      try {
        const s = await window.geode.snapshots.get()
        setCadence(s.cadenceMinutes)
        setAiTitles(s.aiTitles)
      } catch {
        setAiTitles(false)
      }
      // Fallback git-free: si la lectura del flag falla, queda en off (sin error bloqueante).
      try {
        setAdvanced((await window.geode.advanced.get()).enabled)
      } catch {
        setAdvanced(false)
      }
      void refreshPlugins()
    })()
  }, [apply, loadModels, refreshPlugins])

  const togglePlugin = async (id: string, enabled: boolean): Promise<void> => {
    setExtPlugins(await window.geode.plugins.setEnabled(id, enabled))
  }

  // Toggle de un built-in: persiste vía setEnabled y relee el mapa para reflejar
  // el nuevo estado (el retorno de setEnabled es la lista de externos, que acá
  // no usamos). El cambio se aplica al reiniciar la app.
  const toggleBuiltin = async (id: string, enabled: boolean): Promise<void> => {
    await window.geode.plugins.setEnabled(id, enabled)
    setBuiltinEnabled(await window.geode.plugins.getEnabled())
  }

  const changeCadence = async (value: number | null): Promise<void> => {
    const cfg = await window.geode.snapshots.set(value)
    setCadence(cfg.cadenceMinutes)
  }

  const changeAiTitles = async (value: boolean): Promise<void> => {
    const cfg = await window.geode.snapshots.setAiTitles(value)
    setAiTitles(cfg.aiTitles)
  }

  const changeAdvanced = async (value: boolean): Promise<void> => {
    const cfg = await window.geode.advanced.set(value)
    setAdvanced(cfg.enabled)
  }

  const connectGithub = async (): Promise<void> => {
    setConnecting(true)
    setError(null)
    try {
      setDevice(await window.geode.github.startDeviceFlow())
      const cfg = await window.geode.github.completeDeviceFlow() // espera la autorización
      setGithub(cfg)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('No se pudo conectar con GitHub'))
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
          <h2>{t('Ajustes')}</h2>
        </div>

        <div className="settings-body">
          <nav className="settings-nav">
            <button className={section === 'general' ? 'active' : ''} onClick={() => setSection('general')}>
              <SlidersHorizontal size={15} /> {t('General')}
            </button>
            <button className={section === 'ai' ? 'active' : ''} onClick={() => setSection('ai')}>
              <Sparkles size={15} /> {t('Mensajes por IA')}
            </button>
            <button className={section === 'github' ? 'active' : ''} onClick={() => setSection('github')}>
              <Cloud size={15} /> {t('Respaldo en la nube')}
            </button>
            <button className={section === 'snapshots' ? 'active' : ''} onClick={() => setSection('snapshots')}>
              <Clock size={15} /> {t('Guardado automático')}
            </button>
            <button className={section === 'plugins' ? 'active' : ''} onClick={() => setSection('plugins')}>
              <Puzzle size={15} /> {t('Plugins')}
            </button>
          </nav>

          <div className="settings-content">
            {section === 'general' && (
              <section className="settings-section">
                <h2><SlidersHorizontal size={18} /> {t('General')}</h2>
                <p className="modal-sub">
                  {t('Elegí cómo se ve Geode. Modo Avanzado muestra el historial técnico de versiones (ramas, etiquetas y grafo). Desactivado por defecto.')}
                </p>

                <div className="field-label">{t('Apariencia')}</div>
                <div className="theme-choices" role="radiogroup" aria-label={t('Tema')}>
                  {([
                    ['sistema', t('Como el sistema'), Monitor],
                    ['claro', t('Claro'), Sun],
                    ['oscuro', t('Oscuro'), Moon]
                  ] as const).map(([value, label, Icon]) => (
                    <button
                      key={value}
                      role="radio"
                      aria-checked={themePref === value}
                      className={themePref === value ? 'active' : ''}
                      onClick={() => {
                        setThemePref(value)
                        setThemePrefState(value)
                      }}
                    >
                      <Icon size={14} /> {label}
                    </button>
                  ))}
                </div>

                <div className="field-label">{t('Idioma')}</div>
                <div className="theme-choices" role="radiogroup" aria-label={t('Idioma')}>
                  {([['system', t('Como el sistema')], ...LOCALES.map((l) => [l.id, l.label])] as [LocalePref, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      role="radio"
                      aria-checked={langPref === value}
                      className={langPref === value ? 'active' : ''}
                      onClick={() => void changeLanguage(value)}
                    >
                      <Languages size={14} /> {label}
                    </button>
                  ))}
                </div>

                <div className="field-label">{t('Barra de formato')}</div>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={formatToolbar}
                    onChange={(e) => setFormatToolbar(e.target.checked)}
                  />
                  <span className="switch-track" aria-hidden="true" />
                  <span className="switch-text">{formatToolbar ? t('Visible arriba del editor') : t('Oculta (los atajos siguen funcionando)')}</span>
                </label>

                <div className="field-label">{t('Modo Avanzado')}</div>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    className="switch-input"
                    checked={advanced}
                    onChange={(e) => void changeAdvanced(e.target.checked)}
                  />
                  <span className="switch-track" aria-hidden="true" />
                  <span className="switch-text">{advanced ? t('Activado') : t('Desactivado')}</span>
                </label>
              </section>
            )}

            {section === 'ai' && (
              <section className="settings-section">
                <h2><Sparkles size={18} /> {t('Mensajes por IA')}</h2>
                <p className="modal-sub">
                  {tx('Motor: {engine}. La API key se guarda cifrada en tu equipo, fuera del repositorio.', {
                    engine: <strong>OpenRouter</strong>
                  })}
                </p>

                <label className="field-label">{t('API key de OpenRouter')}</label>
                {config?.hasKey ? (
                  <div className="key-row">
                    <span className="key-set"><Check size={14} /> {t('Key guardada')}</span>
                    <button onClick={() => void clearKey()}>{t('Quitar')}</button>
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
                      {t('Guardar')}
                    </button>
                  </div>
                )}

                <label className="field-label">
                  {t('Modelo')}
                  {config?.model && <span className="model-current">{config.model}</span>}
                </label>

                {!config?.hasKey ? (
                  <p className="hint">{t('Guardá una API key para ver los modelos.')}</p>
                ) : (
                  <>
                    <div className="key-row">
                      <input
                        className="text-input"
                        placeholder={t('Filtrar modelos…')}
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                      <button className="icon-btn" onClick={() => void loadModels()} disabled={loadingModels} title={t('Recargar modelos')}>
                        <RefreshCw size={15} className={loadingModels ? 'spin' : ''} />
                      </button>
                    </div>

                    <ul className="model-list">
                      {filtered.length === 0 && !loadingModels && (
                        <li className="model-empty">{t('Sin resultados')}</li>
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
                      {t('Para resumir cambios conviene un modelo rápido y barato (mirá el precio por millón de tokens).')}
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
                  {t('Generar resúmenes de versión con IA')}
                </label>

                <h3 className="settings-subtitle"><Mic size={15} /> {t('Dictado por voz')}</h3>
                <p className="modal-sub">
                  {dictationShortcut ? (
                    <>
                      {tx(
                        'Apretá {key} desde cualquier lugar para empezar a dictar, y otra vez para terminar. Si Geode está al frente, el texto va donde está el cursor; si no, se agrega a tu nota de hoy. Usa tu clave de OpenRouter (cuesta centavos por minuto).',
                        { key: <kbd>{dictationShortcut}</kbd> }
                      )}
                    </>
                  ) : (
                    <>
                      {t('El atajo global no se pudo registrar (puede que otra app lo use). Podés dictar igual desde la paleta de comandos: «Dictar».')}
                    </>
                  )}
                </p>
                <label className="field-label" htmlFor="dictation-model">{t('Modelo para transcribir')}</label>
                <select
                  id="dictation-model"
                  className="text-input"
                  disabled={!config?.hasKey}
                  value={config?.dictationModel ?? ''}
                  onChange={async (e) => {
                    const next = await window.geode.ai.setDictationModel(e.target.value || null)
                    setConfig(next)
                    onConfigChange(next)
                  }}
                >
                  <option value="">{t('Automático (recomendado)')}</option>
                  {models
                    .filter((m) => m.audioInput || m.id === config?.dictationModel)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — in {perMillion(m.promptPrice)}
                      </option>
                    ))}
                </select>
              </section>
            )}

            {section === 'github' && (
              <section className="settings-section">
                <h2><Cloud size={18} /> {t('Respaldo en la nube')}</h2>
                <p className="modal-sub">
                  {t('Conectá tu cuenta para guardar copias de seguridad de tus cuadernos en la nube.')}
                </p>

                {github?.connected ? (
                  <div className="key-row">
                    <span className="key-set"><Check size={14} /> {t('Conectado como {login}', { login: github.login ?? '' })}</span>
                    <button onClick={() => void disconnectGithub()}>{t('Desconectar')}</button>
                  </div>
                ) : device ? (
                  <div className="device-box">
                    <p>{t('Escribí este código en la página que se abrió para conectar tu cuenta:')}</p>
                    <div className="device-code">{device.userCode}</div>
                    <p className="hint">{t('Esperando que autorices…')}</p>
                  </div>
                ) : (
                  <button onClick={() => void connectGithub()} disabled={connecting}>
                    {connecting ? t('conectando…') : t('Conectar mi cuenta')}
                  </button>
                )}

                {github?.connected && (
                  <>
                    <details className="advanced-remote">
                      <summary className="field-label">{t('Dirección del respaldo (avanzado)')}</summary>
                      <div className="key-row">
                        <input
                          className="text-input"
                          placeholder={t('https://github.com/usuario/mi-cuaderno.git')}
                          value={remoteInput}
                          onChange={(e) => setRemoteInput(e.target.value)}
                        />
                        <button onClick={() => void saveRemote()} disabled={remoteInput.trim() === (github.remote ?? '')}>
                          {t('Guardar')}
                        </button>
                      </div>
                    </details>

                    <p className="hint">
                      {t('Tu cuaderno se respalda solo cada vez que guardás. También podés forzar una copia desde el botón de la barra inferior.')}
                    </p>
                  </>
                )}
              </section>
            )}

            {section === 'plugins' && (
              <section className="settings-section">
                <h2><Puzzle size={18} /> {t('Plugins')}</h2>

                <div className="ps-group-head">
                  <h3>{t('Integrados')}</h3>
                </div>
                <p className="modal-sub">
                  {t('Vienen incluidos con Geode y están activos por defecto. Al desactivar uno, el cambio se aplica al reiniciar la app.')}
                </p>
                <ul className="plugin-settings-list">
                  {BUILTIN_PLUGINS.map((p) => (
                    <li key={p.id} className="plugin-settings-row">
                      <div className="ps-info">
                        <div className="ps-name">{p.name}</div>
                        <div className="ps-id">{p.id}</div>
                        {p.description && <div className="ps-desc">{p.description}</div>}
                      </div>
                      <label
                        className="ps-toggle"
                        title={(builtinEnabled[p.id] ?? true) ? t('Activado') : t('Desactivado')}
                      >
                        <input
                          type="checkbox"
                          checked={builtinEnabled[p.id] ?? true}
                          onChange={(e) => void toggleBuiltin(p.id, e.target.checked)}
                        />
                        {(builtinEnabled[p.id] ?? true) ? t('activado') : t('desactivado')}
                      </label>
                    </li>
                  ))}
                </ul>

                <div className="ps-group-head">
                  <h3>{t('Instalados')}</h3>
                  <div className="ps-actions">
                    <button className="icon-btn" title={t('Recargar lista')} onClick={() => void refreshPlugins()}>
                      <RefreshCw size={14} />
                    </button>
                    <button onClick={() => void window.geode.plugins.openDir()}>
                      <FolderOpen size={14} /> {t('Abrir carpeta')}
                    </button>
                  </div>
                </div>
                <p className="modal-sub">
                  {tx('Poné cada plugin en su propia carpeta dentro de la carpeta de plugins, con un {file}. Los cambios de activación se aplican al reiniciar la app.', {
                    file: <code>plugin.json</code>
                  })}
                </p>

                {extPlugins.length === 0 ? (
                  <p className="plugin-empty">{t('No hay plugins instalados todavía.')}</p>
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
                          <label className="ps-toggle" title={p.enabled ? t('Activado') : t('Desactivado')}>
                            <input
                              type="checkbox"
                              checked={p.enabled}
                              onChange={(e) => void togglePlugin(p.manifest.id, e.target.checked)}
                            />
                            {p.enabled ? t('activado') : t('desactivado')}
                          </label>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="hint">
                  {tx('Abrí la paleta de comandos con {key} para ver lo que aportan.', { key: <b>Ctrl+P</b> })}
                </p>
              </section>
            )}

            {section === 'snapshots' && (
              <section className="settings-section">
                <h2><Clock size={18} /> {t('Guardado automático')}</h2>
                <p className="modal-sub">
                  {t('La bóveda se guarda sola cada cierto tiempo, y sólo cuando algo cambió. Opcionalmente, la IA puede ponerle un nombre a cada una de esas snapshots automáticas.')}
                </p>

                <label className="field-label">{t('Cadencia')}</label>
                <select
                  className="text-input"
                  value={cadence === null ? 'manual' : String(cadence)}
                  onChange={(e) =>
                    void changeCadence(e.target.value === 'manual' ? null : Number(e.target.value))
                  }
                >
                  <option value="manual">{t('Manual (sólo al guardar)')}</option>
                  <option value="5">{t('Cada {n} minutos', { n: 5 })}</option>
                  <option value="10">{t('Cada {n} minutos', { n: 10 })}</option>
                  <option value="15">{t('Cada {n} minutos', { n: 15 })}</option>
                  <option value="30">{t('Cada {n} minutos', { n: 30 })}</option>
                </select>
                <p className="hint">{t('Por defecto: cada {n} minutos.', { n: 10 })}</p>

                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={aiTitles}
                    onChange={(e) => void changeAiTitles(e.target.checked)}
                  />
                  {t('Nombrar las snapshots automáticas con IA')}
                </label>
                <p className="hint">
                  {t('Usa tu API key de IA, así que tiene costo. La IA sólo se invoca cuando una snapshot automática realmente tiene cambios — nunca por el tiempo transcurrido.')}
                </p>
              </section>
            )}

            {error && (
              <p className="modal-error">
                <AlertTriangle size={14} /> {error}
              </p>
            )}
          </div>
        </div>

        <div className="modal-actions settings-actions">
          <button className="primary" onClick={onClose}>
            {t('Listo')}
          </button>
        </div>
      </div>
    </div>
  )
}
