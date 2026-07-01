import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Escribe un archivo de forma atómica y durable (ver ARCHITECTURE.md §3, Capa 1).
 *
 * Nunca escribe in-place: vuelca a un temporal en el mismo directorio, hace
 * `fsync` (para que los bytes lleguen al disco antes de exponer el archivo) y
 * recién ahí hace `rename`, que es atómico dentro del mismo filesystem. Si el
 * proceso muere a mitad de camino, el archivo original queda intacto: en el peor
 * caso sobra un temporal, nunca una nota corrupta.
 */
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })

  const tmp = join(dir, `.geode-tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const handle = await open(tmp, 'w')
  try {
    await handle.writeFile(content, 'utf8')
    await handle.sync() // fsync: durabilidad antes del rename
  } finally {
    await handle.close()
  }

  try {
    await rename(tmp, filePath)
  } catch (err) {
    // Si el rename falla, no dejamos basura tirada.
    await unlink(tmp).catch(() => {})
    throw err
  }
}
