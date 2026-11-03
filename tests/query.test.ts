import { describe, expect, it } from 'vitest'
import { matchesFilters, parseQuery, propertyLine } from '../src/shared/query'

const nota = `---
estado: En curso
fecha: 2026-11-20
prioridad: 2
cliente: "Acme Corp"
tags: [trabajo/urgente, ventas]
hecho: false
---
# Propuesta

Revisar el presupuesto con #finanzas.
`

describe('parseQuery', () => {
  it('separa texto libre de filtros', () => {
    expect(parseQuery('presupuesto estado:pendiente #trabajo')).toEqual({
      text: 'presupuesto',
      filters: [
        { kind: 'prop', key: 'estado', op: 'contains', value: 'pendiente', negate: false },
        { kind: 'tag', tag: '#trabajo', negate: false }
      ]
    })
  })

  it('entiende comillas, comparaciones, existencia y negación', () => {
    const { filters, text } = parseQuery('cliente:"Acme Corp" fecha:>=2026-01-01 prioridad: -estado:hecho -#archivo')
    expect(text).toBe('')
    expect(filters).toEqual([
      { kind: 'prop', key: 'cliente', op: 'contains', value: 'Acme Corp', negate: false },
      { kind: 'prop', key: 'fecha', op: '>=', value: '2026-01-01', negate: false },
      { kind: 'prop', key: 'prioridad', op: 'exists', value: '', negate: false },
      { kind: 'prop', key: 'estado', op: 'contains', value: 'hecho', negate: true },
      { kind: 'tag', tag: '#archivo', negate: true }
    ])
  })

  it('no toma una URL como filtro', () => {
    expect(parseQuery('https://geode.app/docs').filters).toEqual([])
    expect(parseQuery('https://geode.app/docs').text).toBe('https://geode.app/docs')
  })
})

describe('matchesFilters', () => {
  const ok = (q: string): boolean => matchesFilters(nota, parseQuery(q).filters)

  it('propiedades sin mayúsculas ni tildes y por contenido', () => {
    expect(ok('estado:"en curso"')).toBe(true)
    expect(ok('ESTADO:curso')).toBe(true)
    expect(ok('estado:pendiente')).toBe(false)
    expect(ok('cliente:acme')).toBe(true)
  })

  it('listas, booleanos y existencia', () => {
    expect(ok('tags:ventas')).toBe(true)
    expect(ok('hecho:no')).toBe(true)
    expect(ok('prioridad:')).toBe(true)
    expect(ok('responsable:')).toBe(false)
  })

  it('comparaciones numéricas y de fecha', () => {
    expect(ok('prioridad:>1')).toBe(true)
    expect(ok('prioridad:>=3')).toBe(false)
    expect(ok('fecha:<2026-12-01')).toBe(true)
    expect(ok('fecha:>2026-12-01')).toBe(false)
  })

  it('etiquetas (también del frontmatter y anidadas) y negación', () => {
    expect(ok('#trabajo')).toBe(true)
    expect(ok('#finanzas')).toBe(true)
    expect(ok('-#finanzas')).toBe(false)
    expect(ok('-estado:hecho #ventas')).toBe(true)
  })
})

describe('propertyLine', () => {
  it('ubica la línea de la propiedad en el frontmatter', () => {
    expect(propertyLine(nota, 'fecha')).toBe(2)
    expect(propertyLine(nota, 'Cliente')).toBe(4)
    expect(propertyLine(nota, 'nada')).toBe(-1)
  })
})
