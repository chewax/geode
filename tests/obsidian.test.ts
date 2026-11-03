import { describe, expect, it } from 'vitest'
import {
  deleteProperty,
  extractTags,
  readProperties,
  renameProperty,
  setProperty,
  splitFrontmatter,
  stripComments,
  tagMatches
} from '@shared/obsidian'

const note = `---
estado: en progreso # comentario que se conserva
fecha: 2026-11-03
tags: [trabajo, cliente-x]
publicado: false
---
# Reunión
Hablamos del #presupuesto y #trabajo/urgente.
`

describe('frontmatter / propiedades', () => {
  it('separa el bloque y lee tipos (texto, fecha, lista, booleano)', () => {
    expect(splitFrontmatter(note)!.end).toBe(note.indexOf('# Reunión'))
    expect(readProperties(note)).toEqual([
      { key: 'estado', value: 'en progreso' },
      { key: 'fecha', value: '2026-11-03' },
      { key: 'tags', value: ['trabajo', 'cliente-x'] },
      { key: 'publicado', value: false }
    ])
  })

  it('una nota sin frontmatter no tiene propiedades; YAML roto devuelve null', () => {
    expect(readProperties('# hola')).toEqual([])
    expect(readProperties('---\na: [\n---\nx')).toBeNull()
  })

  it('cambiar una propiedad conserva el resto y los comentarios', () => {
    const out = setProperty(note, 'estado', 'listo')
    expect(out).toContain('estado: listo')
    expect(out).toContain('fecha: 2026-11-03')
    expect(out).toContain('tags: [trabajo, cliente-x]') // sin reformatear las listas
    expect(out.endsWith('Hablamos del #presupuesto y #trabajo/urgente.\n')).toBe(true)
  })

  it('crea el bloque si no existía y lo borra al quitar la última', () => {
    const added = setProperty('# Hola\n', 'autor', 'Ana')
    expect(added).toBe('---\nautor: Ana\n---\n\n# Hola\n')
    expect(deleteProperty(added, 'autor')).toBe('# Hola\n')
  })

  it('renombra una propiedad sin perder su valor', () => {
    expect(readProperties(renameProperty(note, 'estado', 'status'))![0]).toEqual({ key: 'status', value: 'en progreso' })
  })
})

describe('tags', () => {
  it('encuentra tags del texto y del frontmatter, ignorando código, títulos y enlaces', () => {
    const text = note + '\n`#nocode` [[otra#seccion]] # Título #2024 (#entreparentesis)\n'
    const tags = extractTags(text).map((t) => t.tag)
    expect(tags).toEqual(['trabajo', 'cliente-x', 'presupuesto', 'trabajo/urgente', 'entreparentesis'])
  })

  it('un tag padre incluye a sus hijos', () => {
    expect(tagMatches('trabajo/urgente', '#trabajo')).toBe(true)
    expect(tagMatches('trabajos', 'trabajo')).toBe(false)
  })
})

describe('comentarios', () => {
  it('quita %%comentarios%% de una y varias líneas, no dentro de código', () => {
    expect(stripComments('a %%oculto%% b\n%%\nvarias\n%%\nc `%%x%%`')).toBe('a  b\n\nc `%%x%%`')
  })
})
