/**
 * Diccionario español → inglés. Se arma con un archivo por área para que sea
 * fácil de mantener y de revisar; las claves son los textos en español tal cual
 * aparecen en el código. Si dos áreas traducen el mismo texto, gana la última.
 */
import { common } from './common'
import { features } from './features'
import { app } from './app'
import { main } from './main'
import { core } from './core'
import { views } from './views'
import { panels } from './panels'
import { merged } from './merged'

export const en: Record<string, string> = {
  ...common,
  ...features,
  ...main,
  ...core,
  ...views,
  ...panels,
  ...merged,
  ...app
}
