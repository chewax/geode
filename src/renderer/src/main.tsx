import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
// Aplica el tema (claro/oscuro) antes del primer render: evita un destello.
import './theme'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
