import { describe, expect, it } from 'vitest'
import { cellIndexAt, cellStartCol, emptyTable, findTableAt, formatTable, parseTable, splitRow } from '@shared/mdtable'

describe('splitRow', () => {
  it('separa celdas respetando pipes escapados y código en línea', () => {
    expect(splitRow('| a | b \\| c | `x|y` |')).toEqual(['a', 'b \\| c', '`x|y`'])
    expect(splitRow('a | b')).toEqual(['a', 'b'])
  })
})

describe('parseTable / formatTable', () => {
  const src = ['| Nombre | Edad |', '|:--|--:|', '| Ana | 30 |', '| Bartolomé | 7 |']

  it('lee encabezado, alineación y filas', () => {
    expect(parseTable(src)).toEqual({
      header: ['Nombre', 'Edad'],
      align: ['left', 'right'],
      rows: [['Ana', '30'], ['Bartolomé', '7']]
    })
  })

  it('escribe alineado y vuelve a leerse igual (ida y vuelta)', () => {
    const t = parseTable(src)!
    const out = formatTable(t)
    expect(out).toBe(
      ['| Nombre    | Edad |', '| :-------- | ---: |', '| Ana       |   30 |', '| Bartolomé |    7 |'].join('\n')
    )
    expect(parseTable(out.split('\n'))).toEqual(t)
  })

  it('completa filas cortas con celdas vacías', () => {
    expect(parseTable(['| a | b |', '| - | - |', '| solo |'])!.rows).toEqual([['solo', '']])
  })

  it('no confunde texto con pipes con una tabla', () => {
    expect(parseTable(['a | b', 'sin separador'])).toBeNull()
  })

  it('tabla vacía de N×M', () => {
    const t = emptyTable(2, 1)
    expect(formatTable(t).split('\n')).toHaveLength(3)
  })
})

describe('findTableAt / celdas', () => {
  const doc = ['texto', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', 'fin']

  it('encuentra el rango de la tabla desde cualquier fila', () => {
    expect(findTableAt(doc, 4)).toEqual({ from: 2, to: 4 })
    expect(findTableAt(doc, 2)).toEqual({ from: 2, to: 4 })
    expect(findTableAt(doc, 0)).toBeNull()
    expect(findTableAt(doc, 6)).toBeNull()
  })

  it('calcula en qué celda está el cursor y dónde empieza cada celda', () => {
    expect(cellIndexAt('| a | b |', 2)).toBe(0)
    expect(cellIndexAt('| a | b |', 6)).toBe(1)
    expect(cellStartCol('| aa | bb |', 1)).toBe(7)
  })
})
