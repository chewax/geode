import { describe, expect, it } from 'vitest'
import { linkTargetFromSelection, linkTextFor, maskCode, parseWikilinks, resolveLink, rewriteLinks } from '@shared/links'

describe('parseWikilinks', () => {
  it('extrae destino, sección, alias y embeds con sus posiciones', () => {
    const text = 'Ver [[Idea]] y [[Proyectos/Plan#Fase 1|el plan]] y ![[foto.png]].'
    const links = parseWikilinks(text)
    expect(links.map((l) => l.target)).toEqual(['Idea', 'Proyectos/Plan', 'foto.png'])
    expect(links[1].heading).toBe('Fase 1')
    expect(links[1].alias).toBe('el plan')
    expect(links[2].embed).toBe(true)
    expect(text.slice(links[0].from, links[0].to)).toBe('[[Idea]]')
  })

  it('ignora enlaces dentro de código en línea y bloques de código', () => {
    const text = 'a `[[no]]` b\n```\n[[tampoco]]\n```\n[[si]]'
    expect(parseWikilinks(text).map((l) => l.target)).toEqual(['si'])
    expect(maskCode(text)).toHaveLength(text.length)
  })
})

describe('resolveLink', () => {
  const files = ['Idea.md', 'Proyectos/Plan.md', 'Archivo/Plan.md', 'adjuntos/foto.png', 'Proyectos/Notas/Idea.md']

  it('resuelve por nombre sin distinguir mayúsculas', () => {
    expect(resolveLink('idea', ['Idea.md'])).toBe('Idea.md')
  })

  it('con nombres repetidos prefiere la carpeta de origen y si no la ruta más corta', () => {
    expect(resolveLink('Idea', files, 'Proyectos/Notas/x.md')).toBe('Proyectos/Notas/Idea.md')
    expect(resolveLink('Idea', files, 'otra.md')).toBe('Idea.md')
  })

  it('un punto en el nombre de la nota no se toma como extensión', () => {
    const files = ['Proyectos/Lanzamiento de Geode 1.0.md', 'Plan v2.5.md', 'foto.png']
    expect(resolveLink('Lanzamiento de Geode 1.0', files)).toBe('Proyectos/Lanzamiento de Geode 1.0.md')
    expect(resolveLink('plan v2.5', files)).toBe('Plan v2.5.md')
    expect(resolveLink('foto.png', files)).toBe('foto.png')
  })

  it('resuelve rutas explícitas y archivos con extensión', () => {
    expect(resolveLink('Archivo/Plan', files)).toBe('Archivo/Plan.md')
    expect(resolveLink('foto.png', files)).toBe('adjuntos/foto.png')
    expect(resolveLink('Nada', files)).toBeNull()
  })
})

describe('linkTextFor', () => {
  it('usa el nombre si es único y la ruta si hay otro igual', () => {
    expect(linkTextFor('Idea.md', ['Idea.md', 'b.md'])).toBe('Idea')
    expect(linkTextFor('Proyectos/Plan.md', ['Proyectos/Plan.md', 'Archivo/Plan.md'])).toBe('Proyectos/Plan')
    expect(linkTextFor('adjuntos/foto.png', ['adjuntos/foto.png'])).toBe('foto.png')
  })
})

describe('rewriteLinks', () => {
  it('reescribe los enlaces al archivo renombrado conservando sección, alias y embed', () => {
    const oldPaths = ['Idea.md', 'Otra.md', 'foto.png']
    const newPaths = ['Gran idea.md', 'Otra.md', 'foto.png']
    const renames = new Map([['Idea.md', 'Gran idea.md']])
    const text = 'Ver [[Idea]], [[idea#Intro|esto]] y ![[Idea]] pero no [[Otra]].'
    const res = rewriteLinks(text, 'Otra.md', renames, oldPaths, newPaths)
    expect(res.changed).toBe(3)
    expect(res.text).toBe('Ver [[Gran idea]], [[Gran idea#Intro|esto]] y ![[Gran idea]] pero no [[Otra]].')
  })

  it('mantiene el estilo con ruta cuando el enlace la usaba', () => {
    const renames = new Map([['A/Plan.md', 'B/Plan.md']])
    const res = rewriteLinks('[[A/Plan]]', 'x.md', renames, ['A/Plan.md'], ['B/Plan.md'])
    expect(res.text).toBe('[[B/Plan]]')
  })

  it('no toca nada si no hay enlaces afectados', () => {
    const text = 'sin [[cambios]]'
    expect(rewriteLinks(text, 'x.md', new Map([['a.md', 'b.md']]), ['a.md', 'cambios.md'], ['b.md', 'cambios.md'])).toEqual({ text, changed: 0 })
  })
})

describe('linkTargetFromSelection', () => {
  it('usa el texto tal cual cuando es un nombre válido', () => {
    expect(linkTargetFromSelection('  Plan de viaje ')).toBe('Plan de viaje')
  })
  it('quita caracteres prohibidos en enlaces y nombres de archivo', () => {
    expect(linkTargetFromSelection('¿Qué es [x]? a/b #tag')).toBe('¿Qué es x a b tag')
  })
  it('descarta puntos finales (Windows) y selecciones vacías o multilínea', () => {
    expect(linkTargetFromSelection('Fin de la frase.')).toBe('Fin de la frase')
    expect(linkTargetFromSelection('   ')).toBe('')
    expect(linkTargetFromSelection('línea 1\nlínea 2')).toBe('')
  })
})
