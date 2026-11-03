import type { CliEngine } from './ipc'

/**
 * Datos de los CLIs de IA que Geode sabe usar (compartidos entre el main, que
 * los ejecuta, y los Ajustes, que muestran cómo instalarlos e iniciar sesión).
 */
export interface CliSpec {
  /** Ejecutable en el PATH. */
  bin: string
  /** Nombre de la suscripción / proveedor, para la UI. */
  name: string
  /** Nombre del programa oficial. */
  program: string
  /** Cómo instalarlo. */
  install: string
  /** Qué ejecutar en una terminal para iniciar sesión. */
  login: string
  /** Con qué cuenta o plan se usa (para la UI). */
  plan: string
  /**
   * Modelos sugeridos. Los CLIs no tienen un comando para listar modelos, así que
   * usamos los alias estables que documenta cada uno (apuntan siempre al último
   * modelo de esa familia). Además el usuario puede escribir cualquier otro.
   */
  models: { id: string; label: string }[]
  /** Ejemplo para el campo "Otro modelo". */
  modelExample: string
}

/**
 * Nombre de modelo aceptable para pasarle a un CLI. Solo letras, números y
 * . _ - : / [ ] : en Windows el CLI corre a través de cmd.exe, así que no dejamos
 * pasar espacios ni caracteres especiales del shell.
 */
export function isValidModelName(model: string): boolean {
  return /^[A-Za-z0-9._:\/\[\]-]{1,80}$/.test(model)
}

export const CLI_SPECS: Record<CliEngine, CliSpec> = {
  claude: {
    bin: 'claude',
    name: 'Claude',
    program: 'Claude Code',
    install: 'npm install -g @anthropic-ai/claude-code',
    login: 'claude',
    plan: 'tu suscripción a Claude (Pro o Max)',
    models: [
      { id: 'sonnet', label: 'Sonnet (equilibrado)' },
      { id: 'opus', label: 'Opus (el más capaz)' },
      { id: 'haiku', label: 'Haiku (el más rápido)' },
      { id: 'fable', label: 'Fable' }
    ],
    modelExample: 'claude-sonnet-5-5'
  },
  codex: {
    bin: 'codex',
    name: 'ChatGPT',
    program: 'Codex CLI',
    install: 'npm install -g @openai/codex',
    login: 'codex login',
    plan: 'tu suscripción a ChatGPT (Plus, Pro o Business)',
    // Codex no tiene alias: los nombres cambian seguido, se escriben a mano.
    models: [],
    modelExample: 'gpt-5.5'
  },
  gemini: {
    bin: 'gemini',
    name: 'Gemini',
    program: 'Gemini CLI',
    install: 'npm install -g @google/gemini-cli',
    login: 'gemini',
    plan: 'tu cuenta de Google',
    models: [
      { id: 'auto', label: 'Automático' },
      { id: 'pro', label: 'Pro (el más capaz)' },
      { id: 'flash', label: 'Flash (rápido)' },
      { id: 'flash-lite', label: 'Flash-Lite (el más rápido)' }
    ],
    modelExample: 'gemini-2.5-pro'
  }
}

export const CLI_ENGINES: CliEngine[] = ['claude', 'codex', 'gemini']
