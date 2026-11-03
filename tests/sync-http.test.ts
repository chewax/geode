import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { GitService } from '../src/main/services/git'

/**
 * Sync de punta a punta por HTTP real (fetch + push de isomorphic-git) contra un
 * servidor git local (`git http-backend`). Requiere git instalado en la máquina;
 * si no está, el test se saltea (los de tests/sync.test.ts cubren la lógica).
 */
function findBackend(): string | null {
  try {
    const dir = execFileSync('git', ['--exec-path']).toString().trim()
    for (const name of ['git-http-backend', 'git-http-backend.exe']) {
      const p = join(dir, name)
      if (fs.existsSync(p)) return p
    }
  } catch {
    // sin git en el PATH
  }
  return null
}
const backend = findBackend()

let root = ''
let server: http.Server
let url = ''

beforeAll(async () => {
  if (!backend) return
  root = await mkdtemp(join(tmpdir(), 'geode-http-'))
  const bare = join(root, 'remote.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  execFileSync('git', ['-C', bare, 'config', 'http.receivepack', 'true'])
  // Puente mínimo HTTP → CGI de git-http-backend.
  server = http.createServer((req, res) => {
    const [pathInfo, query] = (req.url ?? '').split('?')
    const cgi = spawn(backend, [], {
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: root,
        GIT_HTTP_EXPORT_ALL: '1',
        PATH_INFO: pathInfo,
        QUERY_STRING: query ?? '',
        REQUEST_METHOD: req.method ?? 'GET',
        CONTENT_TYPE: req.headers['content-type'] ?? '',
        REMOTE_USER: 'test',
        REMOTE_ADDR: '127.0.0.1'
      }
    })
    req.pipe(cgi.stdin)
    let head = Buffer.alloc(0)
    let sent = false
    cgi.stdout.on('data', (chunk: Buffer) => {
      if (sent) return void res.write(chunk)
      head = Buffer.concat([head, chunk])
      const i = head.indexOf('\r\n\r\n')
      if (i < 0) return
      sent = true
      let status = 200
      for (const line of head.subarray(0, i).toString().split('\r\n')) {
        const k = line.slice(0, line.indexOf(':'))
        const v = line.slice(line.indexOf(':') + 1).trim()
        if (k.toLowerCase() === 'status') status = parseInt(v, 10)
        else res.setHeader(k, v)
      }
      res.writeHead(status)
      res.write(head.subarray(i + 4))
    })
    cgi.stdout.on('end', () => res.end())
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/remote.git`
})

afterAll(async () => {
  if (!backend) return
  server.close()
  await rm(root, { recursive: true, force: true })
})

it.skipIf(!backend)('dos computadoras se sincronizan por la nube sin perder nada', async () => {
  const g = new GitService()
  const A = join(root, 'A')
  const B = join(root, 'B')
  const note = (dir: string, f = 'Nota.md'): Promise<string> => readFile(join(dir, f), 'utf8')

  await mkdir(A)
  await g.ensureRepo(A)
  await g.setRemote(A, url)
  await writeFile(join(A, 'Nota.md'), 'uno\ndos\n')
  await g.commit(A, 'inicio')
  expect((await g.sync(A, url, 't')).pulled).toBe(false) // primer respaldo: remoto vacío

  await g.clone(B, url, 't') // la segunda computadora
  await writeFile(join(B, 'Nota.md'), 'uno (B)\ndos\n')
  await g.commit(B, 'B')
  await g.sync(B, url, 't')

  // A editó otra cosa sin saber de B: antes, este push quedaba rechazado para siempre.
  await writeFile(join(A, 'Otra.md'), 'de A\n')
  await g.commit(A, 'A')
  expect((await g.sync(A, url, 't')).pulled).toBe(true)
  expect(await note(A)).toBe('uno (B)\ndos\n')

  expect((await g.sync(B, url, 't')).pulled).toBe(true) // B trae lo de A
  expect(await note(B, 'Otra.md')).toBe('de A\n')

  // Las dos editan la misma línea: queda lo local y lo de la nube al lado.
  await writeFile(join(A, 'Nota.md'), 'uno (A2)\ndos\n')
  await g.commit(A, 'A2')
  await g.sync(A, url, 't')
  await writeFile(join(B, 'Nota.md'), 'uno (B2)\ndos\n')
  await g.commit(B, 'B2')
  const res = await g.sync(B, url, 't')
  expect(res.cloudCopies).toEqual(['Nota (versión de la nube).md'])
  expect(await note(B)).toBe('uno (B2)\ndos\n')
  expect(await note(B, 'Nota (versión de la nube).md')).toBe('uno (A2)\ndos\n')

  // Y A, al sincronizar, recibe tanto la versión de B como la copia.
  await g.sync(A, url, 't')
  expect(await note(A)).toBe('uno (B2)\ndos\n')
  expect(await note(A, 'Nota (versión de la nube).md')).toBe('uno (A2)\ndos\n')
}, 60_000)
