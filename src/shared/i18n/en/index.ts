/**
 * Diccionario español → inglés. Se arma con un archivo por área para que sea
 * fácil de mantener y de revisar; las claves son los textos en español tal cual
 * aparecen en el código.
 */
import { common } from './common'
import { features } from './features'

export const en: Record<string, string> = {
  ...common,
  ...features
}
