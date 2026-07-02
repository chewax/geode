/**
 * Autenticación con GitHub por OAuth Device Flow (ver ARCHITECTURE.md §8).
 * No requiere client secret: el usuario ve un código, lo ingresa en github.com
 * y la app obtiene un token. El token se guarda cifrado (ver settings).
 */

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'
// Scope `repo` para poder pushear a repos privados y públicos.
const SCOPE = 'repo'

export interface DeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  interval: number
  expiresIn: number
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Paso 1: pedir un código de dispositivo. */
export async function requestDeviceCode(clientId: string): Promise<DeviceCode> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope: SCOPE })
  })
  if (!res.ok) throw new Error(`GitHub device code: ${res.status}`)
  const j = (await res.json()) as Record<string, string | number>
  if (j.error) throw new Error(`GitHub: ${j.error_description ?? j.error}`)
  return {
    deviceCode: String(j.device_code),
    userCode: String(j.user_code),
    verificationUri: String(j.verification_uri),
    interval: Number(j.interval ?? 5),
    expiresIn: Number(j.expires_in ?? 900)
  }
}

/** Paso 2: pollear hasta que el usuario autorice. Devuelve el access token. */
export async function pollForToken(clientId: string, dc: DeviceCode): Promise<string> {
  const deadline = Date.now() + dc.expiresIn * 1000
  let wait = (dc.interval + 1) * 1000

  while (Date.now() < deadline) {
    await sleep(wait)
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: dc.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    })
    const j = (await res.json()) as Record<string, string>
    if (j.access_token) return j.access_token
    switch (j.error) {
      case 'authorization_pending':
        break
      case 'slow_down':
        wait += 5000
        break
      case 'expired_token':
        throw new Error('El código expiró; probá de nuevo')
      case 'access_denied':
        throw new Error('Autorización cancelada')
      default:
        throw new Error(`GitHub: ${j.error_description ?? j.error ?? 'error desconocido'}`)
    }
  }
  throw new Error('Se agotó el tiempo de autorización')
}

/** Login (username) del dueño del token, para mostrar la cuenta conectada. */
export async function getLogin(token: string): Promise<string> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Geode'
    }
  })
  if (!res.ok) throw new Error(`GitHub user: ${res.status}`)
  const j = (await res.json()) as { login: string }
  return j.login
}
