import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  CliError,
  buildCliPrompt,
  classifyCliOutput,
  cleanCliOutput,
  cliArgs,
  isCliEngine,
  mapCliError,
  parseVersion,
  runCli
} from '../src/main/services/aiCli'

describe('aiCli: piezas puras', () => {
  it('arma el pedido con instrucciones y entrada', () => {
    const p = buildCliPrompt('  Resumí esto.  ', 'contenido de la nota')
    expect(p.startsWith('Resumí esto.')).toBe(true)
    expect(p).toContain('=== ENTRADA ===\ncontenido de la nota\n=== FIN DE LA ENTRADA ===')
  })

  it('usa el modo no interactivo de cada CLI', () => {
    expect(cliArgs('claude', '/tmp/x')).toEqual(['-p', '--output-format', 'text'])
    const codex = cliArgs('codex', '/tmp/out.txt')
    expect(codex[0]).toBe('exec')
    expect(codex).toContain('--skip-git-repo-check')
    expect(codex.slice(-3)).toEqual(['--output-last-message', '/tmp/out.txt', '-'])
    expect(cliArgs('gemini', '/tmp/x')[0]).toBe('-p')
  })

  it('extrae el número de versión', () => {
    expect(parseVersion('2.1.317 (Claude Code)\n')).toBe('2.1.317')
    expect(parseVersion('codex-cli 0.46.0')).toBe('0.46.0')
    expect(parseVersion('sin número')).toBe('sin número')
  })

  it('reconoce los motores CLI', () => {
    expect(isCliEngine('claude')).toBe(true)
    expect(isCliEngine('gemini')).toBe(true)
    expect(isCliEngine('openrouter')).toBe(false)
    expect(isCliEngine(undefined)).toBe(false)
  })

  it('clasifica los fallos más comunes', () => {
    expect(classifyCliOutput('Invalid API key · Please run /login')).toBe('not-logged-in')
    expect(classifyCliOutput('Error: 401 Unauthorized')).toBe('not-logged-in')
    expect(classifyCliOutput("You've hit your usage limit")).toBe('quota')
    expect(classifyCliOutput('429 Too Many Requests')).toBe('quota')
    expect(classifyCliOutput("'claude' is not recognized as an internal or external command")).toBe(
      'not-installed'
    )
    expect(classifyCliOutput('algo raro pasó')).toBe('failed')
  })

  it('limpia colores y avisos del CLI', () => {
    expect(cleanCliOutput('claude', '\x1b[32mHola\x1b[0m\n')).toBe('Hola')
    expect(cleanCliOutput('gemini', 'Loaded cached credentials.\nReunión de equipo')).toBe(
      'Reunión de equipo'
    )
  })

  it('traduce los errores a español accionable', () => {
    expect(mapCliError('claude', new CliError('not-installed', 'claude', '')).message).toContain(
      'npm install -g @anthropic-ai/claude-code'
    )
    expect(mapCliError('codex', new CliError('not-logged-in', 'codex', '')).message).toContain(
      'codex login'
    )
    expect(mapCliError('gemini', new CliError('quota', 'gemini', '')).message).toContain(
      'límite de uso'
    )
    // Nunca filtra el texto crudo del CLI.
    expect(mapCliError('claude', new Error('stack interno xyz')).message).not.toContain('xyz')
  })
})

// Los CLIs falsos son scripts de shell: no aplican en Windows.
describe.skipIf(process.platform === 'win32')('aiCli: ejecución', () => {
  let dir = ''

  const fakeCli = async (name: string, body: string): Promise<string> => {
    const path = join(dir, name)
    await writeFile(path, `#!/bin/sh\n${body}\n`)
    await chmod(path, 0o755)
    return path
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'geode-fake-cli-'))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('devuelve lo que el CLI imprime, leyendo el pedido por stdin', async () => {
    // Eco del pedido: así verificamos que llega completo por stdin.
    const bin = await fakeCli('eco', 'cat')
    const out = await runCli('claude', 'Instrucción X', 'nota con ñ y tildes: canción', { bin })
    expect(out).toContain('Instrucción X')
    expect(out).toContain('nota con ñ y tildes: canción')
  })

  it('corre en una carpeta temporal, no en el vault', async () => {
    const bin = await fakeCli('pwd', 'cat > /dev/null; pwd')
    const out = await runCli('gemini', 's', 'u', { bin })
    expect(out).toContain('geode-ai-')
  })

  it('clasifica una sesión vencida', async () => {
    const bin = await fakeCli('sin-sesion', 'cat > /dev/null; echo "Invalid API key · Please run /login"; exit 1')
    await expect(runCli('claude', 's', 'u', { bin })).rejects.toMatchObject({ kind: 'not-logged-in' })
  })

  it('avisa si el programa no está instalado', async () => {
    await expect(
      runCli('codex', 's', 'u', { bin: join(dir, 'no-existe') })
    ).rejects.toMatchObject({ kind: 'not-installed' })
  })

  it('corta si tarda demasiado', async () => {
    const bin = await fakeCli('lento', 'sleep 5')
    await expect(runCli('claude', 's', 'u', { bin, timeoutMs: 300 })).rejects.toMatchObject({
      kind: 'timeout'
    })
  })

  it('una respuesta vacía es un error', async () => {
    const bin = await fakeCli('vacio', 'cat > /dev/null')
    await expect(runCli('claude', 's', 'u', { bin })).rejects.toMatchObject({ kind: 'failed' })
  })
})
