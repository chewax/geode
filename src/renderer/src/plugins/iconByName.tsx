import type { ComponentType, JSX } from 'react'
import { Puzzle, List, Star, Info, FileText, Tag, Bell, Bookmark } from 'lucide-react'

/**
 * ── Íconos Lucide por NOMBRE (Fase 12 / UI-01) ───────────────────────────────
 *
 * Los plugins EXTERNOS cruzan el puente con DATOS serializables: un panel o un
 * status-item declara su ícono como un NOMBRE (string), no como un Component (que
 * no serializa por el MessagePort). El host mapea ese nombre a un ícono Lucide de
 * un conjunto ACOTADO (allowlist) — así el contenido del plugin nunca inyecta un
 * Component ni HTML activo en el árbol del host (T-12-06). Un nombre desconocido o
 * ausente devuelve null (sin ícono). Solo Lucide; jamás emojis.
 */
const ICONS: Record<string, ComponentType<{ size?: number }>> = {
  Puzzle,
  List,
  Star,
  Info,
  FileText,
  Tag,
  Bell,
  Bookmark
}

/** Devuelve el ícono Lucide para `name` (allowlist acotada) o null si no existe. */
export function iconByName(name?: string, size = 14): JSX.Element | null {
  if (!name) return null
  const Icon = ICONS[name]
  if (!Icon) return null
  return <Icon size={size} />
}
