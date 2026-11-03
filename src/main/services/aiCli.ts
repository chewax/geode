import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import type { AiCliStatus, AiEngineTest, CliEngine, NamedVersion } from '@shared/ipc'
import { CLI_ENGINES, CLI_SPECS } from '@shared/aiEngines'
import {
  NAMED_VERSION_PROMPT,
  SYSTEM_PROMPT,
  WRITER_PROMPT,
  parseNamedVersion,
  toOneLine,
  writerUserMessage,
  type AiTextProvider
} from './ai'

/**
 * IA con la suscripción del usuario, a través del CLI oficial de cada proveedor
 * (Claude Code, Codex CLI, Gemini CLI) ya instalado y con sesión iniciada.
 *
 * Geode NUNCA lee ni guarda las credenciales de esos programas: solo los ejecuta
 * en modo no interactivo, les pasa el pedido por stdin y lee la respuesta. Corren
 * en una carpeta temporal vacía (no en el vault), así no ven ni tocan las notas
 * más allá del texto que les mandamos.
 */

export function isCliEngine(x: unknown): x is CliEngine {
  return typeof x === 'string' && (CLI_ENGINES as string[]).includes(x)
}

/** Tope por defecto de una respuesta (los CLIs tardan más en arrancar que una API). */
const DEFAULT_TIMEOUT_MS = 120_000
/** Tope de salida que acumulamos de un CLI (evita memoria sin límite). */
const MAX_OUTPUT = 2 * 1024 * 1024

/** Indicación corta para Gemini CLI: el pedido completo le llega por stdin. */
const GEMINI_DIRECTIVE = 'Seguí las instrucciones del texto recibido y devolvé solo la respuesta pedida.'

/**
 * Los CLIs no tienen un canal separado para el "system prompt" que funcione igual
 * en los tres, así que mandamos instrucciones + entrada en un solo texto.
 */
export function buildCliPrompt(system: string, user: string): string {
  return `${system.trim()}\n\n=== ENTRADA ===\n${user}\n=== FIN DE LA ENTRADA ===`
}

/** Argumentos del modo no interactivo de cada CLI (el pedido va por stdin). */
export function cliArgs(engine: CliEngine, outFile: string): string[] {
  switch (engine) {
    case 'claude':
      return ['-p', '--output-format', 'text']
    case 'codex':
      // "-" = leer el pedido de stdin. Sandbox de solo lectura: no debe tocar nada.
      return [
        'exec',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--color',
        'never',
        '--output-last-message',
        outFile,
        '-'
      ]
    case 'gemini':
      return ['-p', GEMINI_DIRECTIVE]
  }
}

/** Quita secuencias de color ANSI. */
export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

/** Limpia la respuesta: sin color, sin avisos del CLI, sin espacios de borde. */
export function cleanCliOutput(engine: CliEngine, raw: string): string {
  let text = stripAnsi(raw).replace(/\r/g, '')
  if (engine === 'gemini') {
    // Gemini CLI a veces imprime este aviso antes de la respuesta.
    text = text.replace(/^\s*Loaded cached credentials\.?\s*$/gim, '')
  }
  return text.trim()
}

export type CliFailure = 'not-installed' | 'not-logged-in' | 'quota' | 'timeout' | 'failed'

export class CliError extends Error {
  constructor(
    readonly kind: CliFailure,
    readonly engine: CliEngine,
    detail: string
  ) {
    super(`[${engine}] ${kind}: ${detail}`)
  }
}

/** Clasifica un fallo a partir de lo que imprimió el CLI. */
export function classifyCliOutput(text: string): CliFailure {
  const t = text.toLowerCase()
  if (/is not recognized as an internal or external command|command not found|no such file or directory/.test(t)) {
    return 'not-installed'
  }
  if (/rate.?limit|usage limit|quota|\b429\b|limit reached|too many requests/.test(t)) return 'quota'
  if (/not logged in|log ?in|sign ?in|unauthori[sz]ed|authenticat|credential|\b401\b|invalid api key|oauth/.test(t)) {
    return 'not-logged-in'
  }
  return 'failed'
}

/** Traduce un fallo de CLI a un mensaje en español, accionable y sin texto crudo. */
export function mapCliError(engine: CliEngine, e: unknown): Error {
  const spec = CLI_SPECS[engine]
  const kind: CliFailure = e instanceof CliError ? e.kind : 'failed'
  switch (kind) {
    case 'not-installed':
      return new Error(
        `No encontramos ${spec.program} en tu computadora. Instalalo con «${spec.install}» y volvé a probar en Ajustes → IA.`
      )
    case 'not-logged-in':
      return new Error(
        `${spec.program} no tiene una sesión iniciada. Abrí una terminal, ejecutá «${spec.login}» e iniciá sesión con tu cuenta de ${spec.name}.`
      )
    case 'quota':
      return new Error(
        `Llegaste al límite de uso de tu suscripción de ${spec.name}. Probá más tarde o elegí otro motor en Ajustes → IA.`
      )
    case 'timeout':
      return new Error(`${spec.program} tardó demasiado en responder. Probá de nuevo en un momento.`)
    default:
      return new Error(
        `${spec.program} no pudo generar la respuesta. Podés escribir el texto a mano o probar otro motor en Ajustes → IA.`
      )
  }
}

// ── PATH ───────────────────────────────────────────────────────────────────────

const PATH_MARK = '__GEODE_PATH__'
let pathPromise: Promise<string> | null = null

/**
 * PATH con el que buscamos los CLIs. Una app abierta desde el Finder (o el menú
 * del escritorio) no hereda el PATH de la terminal, así que sumamos el del shell
 * de login del usuario y las carpetas donde suelen quedar los instaladores
 * (Homebrew, npm global, ~/.local/bin…). Se calcula una sola vez.
 */
export function cliSearchPath(): Promise<string> {
  if (!pathPromise) pathPromise = computeSearchPath()
  return pathPromise
}

async function computeSearchPath(): Promise<string> {
  const home = homedir()
  const common =
    process.platform === 'win32'
      ? [process.env.APPDATA ? join(process.env.APPDATA, 'npm') : '']
      : [
          join(home, '.local', 'bin'),
          join(home, '.npm-global', 'bin'),
          join(home, '.bun', 'bin'),
          join(home, '.volta', 'bin'),
          join(home, '.claude', 'local'),
          '/opt/homebrew/bin',
          '/usr/local/bin'
        ]
  const parts = [currentPath(), await loginShellPath(), ...common]
    .flatMap((p) => p.split(delimiter))
    .filter((p) => p.length > 0)
  return [...new Set(parts)].join(delimiter)
}

function currentPath(): string {
  const key = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH')
  return (key && process.env[key]) || ''
}

/** PATH del shell de login (macOS/Linux). '' si no se pudo obtener. */
function loginShellPath(): Promise<string> {
  if (process.platform === 'win32') return Promise.resolve('')
  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  return new Promise((resolve) => {
    let out = ''
    let done = false
    const finish = (value: string): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(value)
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(shell, ['-ilc', `printf '%s' "${PATH_MARK}$PATH${PATH_MARK}"`], {
        stdio: ['ignore', 'pipe', 'ignore']
      })
    } catch {
      resolve('')
      return
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish('')
    }, 5_000)
    child.stdout?.on('data', (d: Buffer) => (out += d.toString()))
    child.on('error', () => finish(''))
    child.on('close', () => {
      const m = out.match(new RegExp(`${PATH_MARK}(.*)${PATH_MARK}`, 's'))
      finish(m ? m[1].trim() : '')
    })
  })
}

// ── Ejecución ────────────────────────────────────────────────────────────────

interface RunOptions {
  input?: string
  cwd: string
  timeoutMs: number
  signal?: AbortSignal
}

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  /** true si se cortó por el tope de tiempo o por el signal. */
  timedOut: boolean
  /** true si el ejecutable no existe. */
  missing: boolean
}

/** Comillas para cmd.exe (en Windows los CLIs de npm son .cmd y requieren shell). */
function quoteWinArg(a: string): string {
  return /[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a
}

function killTree(child: ReturnType<typeof spawn>): void {
  const pid = child.pid
  if (process.platform === 'win32') {
    if (pid) spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }).on('error', () => {})
    return
  }
  // En macOS/Linux el CLI corre en su propio grupo de procesos (detached): matamos
  // el grupo entero para no dejar subprocesos vivos que retengan la salida.
  try {
    if (pid) process.kill(-pid, 'SIGTERM')
    else child.kill('SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

async function runProcess(bin: string, args: string[], opts: RunOptions): Promise<RunResult> {
  const searchPath = await cliSearchPath()
  const env: NodeJS.ProcessEnv = { ...process.env }
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  env[pathKey] = searchPath
  // Sin colores ni interactividad: queremos texto plano.
  env.NO_COLOR = '1'
  env.CI = env.CI ?? '1'

  const win = process.platform === 'win32'
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const finish = (r: Omit<RunResult, 'stdout' | 'stderr' | 'timedOut'>): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      resolve({ ...r, stdout, stderr, timedOut })
    }

    const child = spawn(bin, win ? args.map(quoteWinArg) : args, {
      cwd: opts.cwd,
      env,
      shell: win,
      windowsHide: true,
      detached: !win,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const stop = (): void => {
      timedOut = true
      killTree(child)
      // No esperamos a que cierre la salida: un subproceso huérfano podría
      // retenerla y dejar la espera colgada.
      finish({ code: null, missing: false })
    }
    const onAbort = (): void => stop()
    const timer = setTimeout(stop, opts.timeoutMs)
    if (opts.signal?.aborted) stop()
    else opts.signal?.addEventListener('abort', onAbort)

    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString()
    })
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += d.toString()
    })
    child.on('error', (err: NodeJS.ErrnoException) => {
      finish({ code: null, missing: err.code === 'ENOENT' })
    })
    child.on('close', (code) => finish({ code, missing: false }))

    // Un CLI que sale antes de leer todo stdin no debe tirar la app (EPIPE).
    child.stdin.on('error', () => {})
    if (opts.input !== undefined) child.stdin.end(opts.input)
    else child.stdin.end()
  })
}

export interface RunCliOptions {
  signal?: AbortSignal
  timeoutMs?: number
  /** Solo para tests: ejecutable a usar en lugar del oficial. */
  bin?: string
}

/**
 * Le pide una respuesta al CLI de `engine`. Lanza CliError (clasificado) si no
 * está instalado, no tiene sesión, llegó al límite, tardó demasiado o falló.
 */
export async function runCli(
  engine: CliEngine,
  system: string,
  user: string,
  opts: RunCliOptions = {}
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'geode-ai-'))
  try {
    const outFile = join(dir, 'respuesta.txt')
    const res = await runProcess(opts.bin ?? CLI_SPECS[engine].bin, cliArgs(engine, outFile), {
      input: buildCliPrompt(system, user),
      cwd: dir,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      signal: opts.signal
    })
    if (res.missing) throw new CliError('not-installed', engine, 'ejecutable no encontrado')
    if (res.timedOut) throw new CliError('timeout', engine, 'sin respuesta a tiempo')
    if (res.code !== 0) {
      const output = `${res.stderr}\n${res.stdout}`
      throw new CliError(classifyCliOutput(output), engine, output.trim().slice(-500))
    }
    const raw =
      engine === 'codex' ? await readFile(outFile, 'utf8').catch(() => res.stdout) : res.stdout
    const text = cleanCliOutput(engine, raw)
    if (!text) throw new CliError('failed', engine, 'respuesta vacía')
    return text
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Número de versión de la salida de `--version` (p. ej. "2.1.3 (Claude Code)" → "2.1.3"). */
export function parseVersion(output: string): string | null {
  const text = stripAnsi(output).trim()
  const semver = text.match(/\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?/)
  return semver ? semver[0] : text.split('\n')[0]?.trim() || null
}

/** Qué CLIs están instalados (y su versión). Nunca lanza. */
export async function detectClis(): Promise<AiCliStatus[]> {
  return Promise.all(
    CLI_ENGINES.map(async (engine): Promise<AiCliStatus> => {
      try {
        const res = await runProcess(CLI_SPECS[engine].bin, ['--version'], {
          cwd: homedir(),
          timeoutMs: 15_000
        })
        const installed = !res.missing && !res.timedOut && res.code === 0
        const version = installed ? parseVersion(res.stdout) : null
        return { engine, installed, version }
      } catch {
        return { engine, installed: false, version: null }
      }
    })
  )
}

/** "Probar conexión": una consulta mínima para verificar instalación y sesión. */
export async function testCli(engine: CliEngine): Promise<AiEngineTest> {
  const spec = CLI_SPECS[engine]
  try {
    await runCli(engine, 'Respondé exactamente con la palabra OK y nada más.', 'Prueba de conexión desde Geode.')
    return { ok: true, message: `${spec.program} respondió. Geode ya puede usar tu suscripción de ${spec.name}.` }
  } catch (e) {
    return { ok: false, message: mapCliError(engine, e).message }
  }
}

/** Motor de texto que usa el CLI de un proveedor (mismos prompts que OpenRouter). */
export class CliProvider implements AiTextProvider {
  constructor(private readonly engine: CliEngine) {}

  async generateMessage(diff: string): Promise<string> {
    return toOneLine(await runCli(this.engine, SYSTEM_PROMPT, diff))
  }

  async generateNamedVersion(diff: string, signal?: AbortSignal): Promise<NamedVersion> {
    return parseNamedVersion(await runCli(this.engine, NAMED_VERSION_PROMPT, diff, { signal }))
  }

  async generateText(instruction: string, selection: string, before: string): Promise<string> {
    return runCli(this.engine, WRITER_PROMPT, writerUserMessage(instruction, selection, before))
  }
}
