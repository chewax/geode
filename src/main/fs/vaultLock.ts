import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { t } from '@shared/i18n'

/**
 * Candado ENTRE PROCESOS por bóveda (`.geode/write.lock`).
 *
 * Por qué existe: además de la app, ahora el servidor MCP (otro proceso, lanzado
 * por Claude/Cursor/etc.) escribe notas y commitea en la misma bóveda. isomorphic-git
 * no protege el index ni los refs contra dos procesos a la vez, y un commit que se
 * cruza con otro puede pisar el index. Todo lo que toca el repo (commit, sync,
 * checkout, restore) y toda escritura de nota pasa por este candado, así hay UN solo
 * escritor a la vez sobre la bóveda, sea quien sea.
 *
 * Diseño:
 *   - El candado es un archivo creado con O_EXCL ('wx'): crearlo es atómico en
 *     todos los SO, así que dos procesos nunca lo "ganan" a la vez.
 *   - Se sostiene SOLO lo que dura la operación (milisegundos para una nota,
 *     lo que tarde un commit), nunca mientras la app está abierta.
 *   - Reentrante dentro del mismo flujo asíncrono (AsyncLocalStorage): `sync`
 *     puede llamar a `commit` sin bloquearse a sí mismo. Dos operaciones
 *     INDEPENDIENTES del mismo proceso sí se esperan entre sí.
 *   - Candado huérfano (el proceso murió sin borrarlo): se rompe si su pid ya no
 *     existe o si es más viejo que STALE_MS.
 */

const STALE_MS = 2 * 60_000
const POLL_MS = 25

/** Bóvedas cuyo candado ya sostiene el flujo asíncrono actual (reentrancia). */
const held = new AsyncLocalStorage<Set<string>>()

function lockPath(dir: string): string {
  return join(dir, '.geode', 'write.lock')
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    // EPERM = existe pero es de otro usuario: vivo.
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** true si el candado existente quedó huérfano y se puede romper. */
async function isStale(path: string): Promise<boolean> {
  try {
    const raw = await readFile(path, 'utf8')
    const info = JSON.parse(raw) as { pid?: unknown; at?: unknown }
    if (typeof info.pid === 'number' && !pidAlive(info.pid)) return true
    if (typeof info.at === 'number' && Date.now() - info.at > STALE_MS) return true
    return false
  } catch {
    // Ilegible o a medio escribir: decide la antigüedad del archivo.
    try {
      return Date.now() - (await stat(path)).mtimeMs > STALE_MS
    } catch {
      return false // ya no existe: el próximo intento lo crea
    }
  }
}

/** Intenta crear el candado. true si lo ganó. */
async function tryAcquire(path: string, owner: string): Promise<boolean> {
  try {
    const fh = await open(path, 'wx')
    try {
      await fh.writeFile(JSON.stringify({ pid: process.pid, owner, at: Date.now() }))
    } finally {
      await fh.close()
    }
    return true
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    return false
  }
}

export interface VaultLockOptions {
  /** Quién lo pide (diagnóstico: queda escrito en el archivo). */
  owner?: string
  /** Cuánto esperar antes de rendirse. Default 30 s. */
  timeoutMs?: number
  /**
   * Qué hacer si se agota la espera. 'throw' (default) para operaciones que
   * pueden reintentarse (MCP, commits). 'proceed' para las escrituras del
   * usuario: NUNCA se pierde lo tipeado por un candado trabado.
   */
  onTimeout?: 'throw' | 'proceed'
}

/**
 * Corre `fn` sosteniendo el candado de la bóveda `dir`. Libera siempre (finally).
 */
export async function withVaultLock<T>(
  dir: string,
  fn: () => Promise<T>,
  opts: VaultLockOptions = {}
): Promise<T> {
  const key = resolve(dir)
  const current = held.getStore()
  if (current?.has(key)) return fn() // reentrante: ya lo tenemos en este flujo

  const path = lockPath(key)
  const owner = opts.owner ?? 'geode'
  const deadline = Date.now() + (opts.timeoutMs ?? 30_000)
  await mkdir(join(key, '.geode'), { recursive: true })

  let acquired = false
  for (;;) {
    if (await tryAcquire(path, owner)) {
      acquired = true
      break
    }
    if (await isStale(path)) {
      await unlink(path).catch(() => {})
      continue
    }
    if (Date.now() > deadline) {
      if (opts.onTimeout === 'proceed') break
      throw new Error(t('La bóveda está ocupada por otra operación; probá de nuevo en unos segundos'))
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }

  const next = new Set(current ?? [])
  next.add(key)
  try {
    return await held.run(next, fn)
  } finally {
    if (acquired) await unlink(path).catch(() => {})
  }
}
