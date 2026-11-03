import type { TreeNode } from '@shared/ipc'
import { displayName } from '@shared/links'
import type { GeodePlugin, PluginContext } from '../types'
import { TEMPLATES_DIR, applyTemplate } from './templating'

/** Notas dentro de la carpeta de plantillas (recursivo). */
function templatePaths(tree: TreeNode[]): string[] {
  const dir = tree.find((n) => n.isDir && n.name.toLowerCase() === TEMPLATES_DIR.toLowerCase())
  const out: string[] = []
  const walk = (nodes: TreeNode[]): void => {
    for (const n of nodes) {
      if (n.isDir) walk(n.children ?? [])
      else if (n.path.toLowerCase().endsWith('.md')) out.push(n.path)
    }
  }
  if (dir?.children) walk(dir.children)
  return out.sort((a, b) => a.localeCompare(b))
}

/** Pide elegir una plantilla. null si no hay o se cancela (avisando por qué). */
async function chooseTemplate(ctx: PluginContext): Promise<string | null> {
  const paths = templatePaths(await ctx.vault.tree())
  if (paths.length === 0) {
    ctx.notify(`Creá notas dentro de la carpeta «${TEMPLATES_DIR}» para usarlas como plantillas.`)
    return null
  }
  return ctx.ui.pick(
    paths.map((p) => ({ label: displayName(p), value: p })),
    'Elegí una plantilla…'
  )
}

/**
 * Plugin interno: plantillas. Cualquier nota en `Plantillas/` es una plantilla;
 * se inserta en el cursor reemplazando {{fecha}}, {{hora}} y {{titulo}}.
 */
export const templatesPlugin: GeodePlugin = {
  id: 'templates',
  name: 'Plantillas',
  description: 'Inserta notas de la carpeta «Plantillas» con {{fecha}}, {{hora}} y {{titulo}}',
  activate(ctx) {
    ctx.commands.register({
      id: 'templates.insert',
      title: 'Insertar plantilla…',
      category: 'Editor',
      isEnabled: () => ctx.activeNote() !== null,
      run: async () => {
        const note = ctx.activeNote()
        if (!note) return
        const path = await chooseTemplate(ctx)
        if (!path) return
        try {
          const text = await ctx.vault.readNote(path)
          ctx.editor.insertAtCursor(applyTemplate(text, { title: displayName(note.path) }))
        } catch (e) {
          ctx.notify(e instanceof Error ? e.message : 'No se pudo leer la plantilla')
        }
      }
    })
    ctx.commands.register({
      id: 'templates.newFromTemplate',
      title: 'Nueva nota desde plantilla…',
      category: 'Notas',
      run: async () => {
        const path = await chooseTemplate(ctx)
        if (!path) return
        try {
          const base = displayName(path)
          // Nombre libre "<plantilla> 2", "<plantilla> 3"… en la raíz: nunca pisa.
          let name = base
          for (let n = 2; await ctx.vault.exists(`${name}.md`); n++) name = `${base} ${n}`
          const text = applyTemplate(await ctx.vault.readNote(path), { title: name })
          await ctx.vault.createNote(`${name}.md`, text)
          await ctx.openNote(`${name}.md`)
        } catch (e) {
          ctx.notify(e instanceof Error ? e.message : 'No se pudo crear la nota')
        }
      }
    })
  }
}
