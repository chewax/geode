import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en } from '../src/shared/i18n/en'
import { resolveLocale, setLocale, t } from '../src/shared/i18n'

/** Archivos .ts/.tsx de src que importan el módulo de i18n. */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p))
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/** Claves literales usadas en `t('…')`, `t("…")` y `t(`…`)` sin `${}`. */
function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>()
  const re = /(?<![\w.$])t\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\$]|\\.)*`)/g
  for (const file of sourceFiles('src')) {
    if (file.includes(join('shared', 'i18n'))) continue
    const src = readFileSync(file, 'utf8')
    if (!/from '@shared\/i18n'|from '\.\.?\/(?:\.\.\/)*i18n'/.test(src)) continue
    for (const m of src.matchAll(re)) {
      const key = new Function(`return ${m[1]}`)() as string
      keys.set(key, file)
    }
  }
  return keys
}

const vars = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('i18n', () => {
  it('cada texto usado con t() tiene traducción al inglés', () => {
    const missing = [...usedKeys()].filter(([k]) => !(k in en)).map(([k, f]) => `${f}: ${k}`)
    expect(missing).toEqual([])
  })

  it('las traducciones conservan las mismas {variables}', () => {
    const bad = Object.entries(en)
      .filter(([k, v]) => vars(k).join() !== vars(v).join())
      .map(([k, v]) => `${k} → ${v}`)
    expect(bad).toEqual([])
  })

  it('traduce, interpola y cae al español si falta la traducción', () => {
    setLocale('en')
    expect(t('hace {n} minutos', { n: 5 })).toBe('5 minutes ago')
    expect(t('Texto sin traducir {x}', { x: 1 })).toBe('Texto sin traducir 1')
    setLocale('es')
    expect(t('hace {n} minutos', { n: 5 })).toBe('hace 5 minutos')
  })

  it('resuelve el idioma del sistema', () => {
    expect(resolveLocale('system', 'es-UY')).toBe('es')
    expect(resolveLocale(undefined, 'en-US')).toBe('en')
    expect(resolveLocale('system', 'pt-BR')).toBe('en')
    expect(resolveLocale('es', 'en-US')).toBe('es')
  })
})
