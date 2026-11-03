import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { X, Cloud, CloudOff, RefreshCw } from 'lucide-react'
import type { DeviceFlowStart } from '@shared/ipc'
import { t } from '@shared/i18n'

/**
 * Wizard de "Respaldar en la nube": guía al usuario a conectar (o crear) una
 * cuenta y habilita el respaldo del cuaderno actual. Sólo presenta y orquesta
 * `window.geode`; el montaje y el estado los cablea App.tsx (plan 12-05).
 *
 * Dos caminos: "Ya tengo cuenta" (device flow directo) y "Crear una gratis"
 * (abre el navegador + checklist de 2 pasos que SOBREVIVE el ida-y-vuelta al
 * navegador, sin desmontarse). "GitHub" se nombra ÚNICAMENTE en el encuadre de
 * la cuenta, como servicio gratuito y seguro. El éxito lo señala `onDone` sólo
 * cuando el push real terminó (STAT-01); nunca se anuncia al iniciar.
 */
export function BackupWizard({
  githubConnected,
  onDone,
  onClose
}: {
  githubConnected: boolean
  onDone: () => void
  onClose: () => void
}): JSX.Element {
  const [connected, setConnected] = useState(githubConnected)
  const [device, setDevice] = useState<DeviceFlowStart | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [busy, setBusy] = useState(false) // durante enable() (push real)
  const [signupStarted, setSignupStarted] = useState(false) // checklist visible
  const [error, setError] = useState<string | null>(null)

  // Device flow sin jerga: pide el código, espera la autorización y marca
  // conectado. Tolera reintentos: si la pestaña se cerró o "Ya tengo cuenta"
  // se tocó antes de crear la cuenta, el flujo espera y expira solo; el catch
  // muestra el mensaje humano y el usuario vuelve a intentar.
  const connect = useCallback(async (): Promise<void> => {
    setConnecting(true)
    setError(null)
    try {
      setDevice(await window.geode.github.startDeviceFlow())
      await window.geode.github.completeDeviceFlow()
      setConnected(true)
      setDevice(null)
    } catch (e) {
      setError((e as Error).message)
      setDevice(null)
    } finally {
      setConnecting(false)
    }
  }, [])

  // Abre la página de creación de cuenta en el navegador y deja la checklist
  // visible para cuando el usuario vuelva.
  const startSignup = useCallback(async (): Promise<void> => {
    setError(null)
    setSignupStarted(true)
    try {
      await window.geode.backup.openSignup()
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  // Habilita el respaldo (createRepo + setRemote + push). El main ya devuelve el
  // mensaje humano de mapBackupError; se muestra tal cual. El éxito honesto se
  // señala vía onDone SÓLO tras el push real (STAT-01).
  const runEnable = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await window.geode.backup.enable()
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [onDone])

  // Al quedar conectado (sin device flow en curso), disparar enable() una vez.
  useEffect(() => {
    if (connected && !device) void runEnable()
    // Depende sólo de `connected`: no queremos re-disparar en cada reintento;
    // el reintento manual llama runEnable() directo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="nv-head">
          <h2>{t('Respaldar en la nube')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('Cerrar')}>
            <X size={16} />
          </button>
        </div>

        {device ? (
          // ── Device flow: código + espera, sin jerga OAuth ──
          <div className="device-box">
            <p>{t('Escribí este código en la página que se abrió para conectar tu cuenta:')}</p>
            <div className="device-code">{device.userCode}</div>
            <p className="hint">
              <RefreshCw size={16} className="spin" /> {t('Esperando que autorices…')}
            </p>
          </div>
        ) : connected ? (
          // ── Respaldo en curso o reintento tras error ──
          <div className="device-box">
            {busy ? (
              <p>
                <RefreshCw size={16} className="spin" /> {t('Guardando tu primera copia en la nube…')}
              </p>
            ) : (
              <button className="primary" autoFocus onClick={() => void runEnable()}>
                <Cloud size={16} /> {t('Reintentar')}
              </button>
            )}
          </div>
        ) : (
          // ── Elección de camino: cuenta existente o crear una gratis ──
          <div className="nv-body">
            <p className="modal-sub">
              {t(
                'Para respaldar tu cuaderno necesitás una cuenta. Es gratis y solo vos podés ver tus copias.'
              )}
            </p>
            <p className="hint">
              {t(
                'Usamos GitHub, un servicio gratuito y seguro para guardar tus copias. Tus cuadernos quedan privados: solo vos los ves.'
              )}
            </p>

            <div className="nv-actions">
              <button
                className="primary"
                autoFocus
                disabled={connecting}
                onClick={() => void connect()}
              >
                {connecting ? <RefreshCw size={16} className="spin" /> : <Cloud size={16} />}{' '}
                {t('Ya tengo cuenta')}
              </button>
              <button className="link-btn" onClick={() => void startSignup()}>
                {t('Crear una gratis')}
              </button>
            </div>

            {signupStarted && (
              // La checklist permanece visible al volver del navegador (no se
              // desmonta): guía los 2 pasos y ofrece el CTA "Conectar cuenta".
              <div className="device-box">
                <p>{t('1. Creá tu cuenta gratis en la página que se abrió en tu navegador.')}</p>
                <p>{t('2. Cuando termines, volvé acá y tocá "Conectar cuenta".')}</p>
                <button
                  className="primary"
                  disabled={connecting}
                  onClick={() => void connect()}
                >
                  {connecting ? <RefreshCw size={16} className="spin" /> : <Cloud size={16} />}{' '}
                  {t('Conectar cuenta')}
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="modal-error">
            <CloudOff size={14} /> {error}
          </p>
        )}
      </div>
    </div>
  )
}
