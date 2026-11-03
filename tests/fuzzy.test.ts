import { describe, expect, it } from 'vitest'
import { fuzzyNotes } from '../src/shared/fuzzy'

const paths = [
  'Proyectos/Lanzamiento de Geode 1.0.md',
  'Ideas.md',
  'Diario/2026-11-03.md',
  'Recetas/Lasaña.md',
  'Geografía.md'
]

describe('fuzzyNotes', () => {
  it('encuentra por letras en orden, sin tildes ni mayúsculas', () => {
    expect(fuzzyNotes(paths, 'lgeo')[0].path).toBe('Proyectos/Lanzamiento de Geode 1.0.md')
    expect(fuzzyNotes(paths, 'LASANA')[0].path).toBe('Recetas/Lasaña.md')
  })

  it('prefiere coincidencias en el nombre y al inicio', () => {
    const r = fuzzyNotes(paths, 'geo').map((h) => h.path)
    expect(r[0]).toBe('Geografía.md')
    expect(r).toContain('Proyectos/Lanzamiento de Geode 1.0.md')
  })

  it('busca también en la carpeta', () => {
    expect(fuzzyNotes(paths, 'diario').map((h) => h.path)).toEqual(['Diario/2026-11-03.md'])
  })

  it('marca las letras coincidentes del nombre', () => {
    expect(fuzzyNotes(paths, 'ide')[0].nameHits).toEqual([0, 1, 2])
  })

  it('sin coincidencia ni consulta devuelve vacío', () => {
    expect(fuzzyNotes(paths, 'xyz')).toEqual([])
    expect(fuzzyNotes(paths, '  ')).toEqual([])
  })
})
