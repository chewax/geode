import { describe, expect, it } from 'vitest'
import { applyTemplate, localDate } from '../src/renderer/src/plugins/builtin/templating'

describe('applyTemplate', () => {
  it('reemplaza variables en español e inglés y deja las desconocidas', () => {
    const now = new Date(2026, 0, 5, 9, 7)
    const out = applyTemplate('# {{titulo}} — {{fecha}} {{hora}} / {{date}} {{Title}} {{otra}}', { title: 'Hoy', now })
    expect(out).toBe('# Hoy — 2026-01-05 09:07 / 2026-01-05 Hoy {{otra}}')
  })

  it('usa la fecha local, no UTC', () => {
    expect(localDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})
