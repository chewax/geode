/**
 * Autenticación con GitHub por OAuth Device Flow (ver ARCHITECTURE.md §8).
 * No requiere client secret: el usuario ve un código, lo ingresa en github.com
 * y la app obtiene un token. El token se guarda cifrado (ver settings).
 */

import type { GithubRepoInfo } from '@shared/ipc'

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

/**
 * Normaliza una URL de repo a HTTPS: isomorphic-git no soporta SSH. Convierte
 * las formas `git@host:owner/repo.git` y `ssh://git@host/owner/repo.git` a
 * `https://host/owner/repo.git`. Las URLs https se dejan igual.
 */
export function normalizeRemoteUrl(url: string): string {
  const u = url.trim()
  const scp = /^git@([^:]+):(.+)$/.exec(u) // git@github.com:owner/repo.git
  if (scp) return `https://${scp[1]}/${scp[2]}`
  const ssh = /^ssh:\/\/(?:git@)?([^/]+)\/(.+)$/.exec(u) // ssh://git@github.com/owner/repo.git
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`
  return u
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

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Geode'
  }
}

/** Repos del dueño del token, más reciente primero (para el selector de clonado). */
export async function listRepos(token: string): Promise<GithubRepoInfo[]> {
  const res = await fetch(
    'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner',
    { headers: ghHeaders(token) }
  )
  if (!res.ok) throw new Error(`GitHub repos: ${res.status} ${await res.text()}`)
  const list = (await res.json()) as {
    name: string
    full_name: string
    private: boolean
    clone_url: string
    updated_at: string
  }[]
  return list.map((r) => ({
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    cloneUrl: r.clone_url,
    updatedAt: r.updated_at
  }))
}

/**
 * Crea un repo nuevo en la cuenta del token. `auto_init: false` para que el
 * primer push del vault sea el contenido inicial (sin README que genere conflicto).
 * Devuelve la URL de clonado (HTTPS).
 */
export async function createRepo(
  token: string,
  name: string,
  isPrivate: boolean
): Promise<GithubRepoInfo> {
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, private: isPrivate, auto_init: false })
  })
  if (!res.ok) throw new Error(`GitHub crear repo: ${res.status} ${await res.text()}`)
  const r = (await res.json()) as {
    name: string
    full_name: string
    private: boolean
    clone_url: string
    updated_at: string
  }
  return {
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    cloneUrl: r.clone_url,
    updatedAt: r.updated_at
  }
}
