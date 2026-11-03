import { describe, expect, it } from 'vitest'
import { foldQuery, searchText } from '@shared/search'

describe('searchText', () => {
  it('ignora tildes y mayúsculas pero devuelve posiciones del texto original', () => {
    const text = 'Primera línea\nUna CANCIÓN y otra canción'
    const m = searchText(text, foldQuery('cancion'))
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ line: 1, col: 4, length: 7, text: 'CANCIÓN' })
    expect(m[1].text).toBe('canción')
  })

  it('respeta el límite y devuelve vacío sin consulta', () => {
    expect(searchText('a a a a', foldQuery('a'), 2)).toHaveLength(2)
    expect(searchText('algo', foldQuery('   '))).toEqual([])
  })

  it('no se rompe con emojis antes de la coincidencia', () => {
    const m = searchText('😀 hola', foldQuery('hola'))
    expect(m[0].text).toBe('hola')
  })
})
