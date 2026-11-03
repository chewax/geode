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
}

export const CLI_SPECS: Record<CliEngine, CliSpec> = {
  claude: {
    bin: 'claude',
    name: 'Claude',
    program: 'Claude Code',
    install: 'npm install -g @anthropic-ai/claude-code',
    login: 'claude',
    plan: 'tu suscripción a Claude (Pro o Max)'
  },
  codex: {
    bin: 'codex',
    name: 'ChatGPT',
    program: 'Codex CLI',
    install: 'npm install -g @openai/codex',
    login: 'codex login',
    plan: 'tu suscripción a ChatGPT (Plus, Pro o Business)'
  },
  gemini: {
    bin: 'gemini',
    name: 'Gemini',
    program: 'Gemini CLI',
    install: 'npm install -g @google/gemini-cli',
    login: 'gemini',
    plan: 'tu cuenta de Google'
  }
}

export const CLI_ENGINES: CliEngine[] = ['claude', 'codex', 'gemini']
