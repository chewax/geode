---
phase: 01-sidebar-sections
plan: 02
subsystem: ui
tags: [uat, human-verify, checkpoint, sidebar, activity-bar]

# Dependency graph
requires:
  - phase: 01-sidebar-sections
    plan: 01
    provides: SidebarSection, sidebar restructure, VaultSwitcher inline disclosure
provides:
  - "Confirmación humana (UAT) de SIDE-01, SIDE-02 y SIDE-04 en la app en ejecución"
  - "ActivityBar: riel vertical estilo VSCode con Ajustes + Ayuda anclados abajo"
  - "VaultSwitcher reubicado al fondo del sidebar con etiqueta fija 'Bóvedas'"
affects: [02-timeline-section, activity-bar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Barra de actividad vertical separada del sidebar para chrome global (no se desplaza al colapsar secciones)"
    - "Elemento anclado al fondo del sidebar con margin-top:auto (robusto ante secciones colapsadas)"

key-files:
  created:
    - src/renderer/src/ActivityBar.tsx
  modified:
    - src/renderer/src/App.tsx
    - src/renderer/src/VaultSwitcher.tsx
    - src/renderer/src/index.css
---

# Plan 01-02 — UAT de paridad de comportamiento del sidebar (SIDE-01/02/04)

**Tipo:** checkpoint:human-verify (puerta bloqueante)
**Resultado:** APROBADO por el usuario en la app en ejecución.

## Qué se verificó

Puerta de verificación humana para la reestructuración del sidebar del plan 01-01.
Como el repo no tiene harness de tests automatizados (solo `npm run typecheck`),
esta comprobación visual/interactiva es la que confirma que SIDE-01, SIDE-02 y
SIDE-04 se cumplen sin regresiones.

El usuario ejecutó la app (`npm run dev`) y recorrió la checklist §A–§D. Confirmó:
- **SIDE-01** — las secciones colapsan/expanden por click en la cabecera, el
  twisty gira, y el estado persiste.
- **SIDE-02** — las acciones de notas viven en la cabecera de la sección, se
  revelan al hover, se ocultan al colapsar y no alternan la sección.
- **SIDE-04** — el selector de bóvedas es un disclosure en flujo (no popover) y
  el cambio de bóveda funciona.
- Paridad de comportamiento sin regresiones; empty-state sin emojis.

## Ajustes emergentes de la UAT (gap-closure)

La UAT surfaceó dos cambios de diseño, resueltos e incorporados (commit `bc8a040`):

1. **Regresión — el chrome del footer (Ajustes/Ayuda) se desplazaba** al colapsar
   la sección NOTAS. Solución acordada con el usuario: nueva **ActivityBar**
   vertical estilo VSCode en el borde izquierdo de la ventana que aloja Ajustes +
   Ayuda anclados abajo, fuera del sidebar. La zona superior del riel queda
   reservada para conmutadores de vista de fases próximas (Timeline, Fase 2).

2. **Reubicación del selector de bóvedas** — a pedido del usuario, se movió al
   **fondo** del sidebar con etiqueta fija **"Bóvedas"** (el lugar donde se
   gestionan, no el nombre de la bóveda activa), con disclosure en flujo hacia
   arriba. Anclado con `margin-top:auto` para que permanezca abajo aunque las
   secciones estén colapsadas.

## Nota operativa (no bloqueante, fuera de alcance de la fase)

Al lanzar la app para la UAT se detectó que **el proceso main no arranca cuando
`ELECTRON_RUN_AS_NODE=1` está seteado en el entorno** (era el caso del shell de
la herramienta, un default de sandbox): en ese modo `require('electron')`
devuelve la ruta al binario (string) en vez de la API, y el arranque falla antes
de crear la ventana. NO es un bug del proyecto — `npm run dev` en una terminal
normal funciona sin cambios. Se verificó lanzando con la variable desactivada
(`env -u ELECTRON_RUN_AS_NODE npm run dev`), y la app abrió correctamente
(`[icon] cargado ...`). No se requirió ningún cambio de código para esto; los
avisos de "GPU Cache Creation failed / Access denied" son ruido benigno del
sandbox.

## Verificación

- `npm run typecheck` en verde (item 20 de la checklist) tras 01-01 y tras el
  gap-closure.
- Comprobaciones §A–§D confirmadas por el usuario en la app en ejecución.
