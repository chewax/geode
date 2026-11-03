import React from 'react'
import ReactDOM from 'react-dom/client'
import { setLocale } from '@shared/i18n'
import { App } from './App'
import './index.css'
// Aplica el tema (claro/oscuro) antes del primer render: evita un destello.
import './theme'

/** Lee el idioma antes de dibujar: así ningún texto aparece en el idioma equivocado. */
async function boot(): Promise<void> {
  try {
    const { locale } = await window.geode.i18n.get()
    setLocale(locale)
    document.documentElement.lang = locale
  } catch {
    // Sin puente (preload roto) o error: queda el español; App muestra el aviso.
  }
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void boot()
