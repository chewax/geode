# Ideas de features para Geode

Backlog de ideas (no comprometidas). Dos ejes: **features del core** y **cosas que
se pueden construir como plugins** sobre la API v1 (ver `docs/PLUGINS.md`).

Marca de estado: 🟢 en progreso · ⬜ pendiente · ✅ hecho.

---

## Features del core

### Explotar el versionado (el diferencial de Geode)
- 🟢 **Scrubber de línea de tiempo por nota** — slider para "rebobinar" una nota y
  ver cómo evolucionó, versión por versión, con fecha + mensaje. Payoff visual del
  "guardar = commit, nunca perdés nada". *(En ejecución.)*
- ⬜ **Restauración selectiva** — traer una nota (o un fragmento) desde cualquier
  versión pasada sin checkout de todo el vault.
- ⬜ **Blame / anotado** — de qué versión viene cada línea.
- ⬜ **Heatmap de actividad + "un día como hoy"** — calendario de escritura desde el
  historial de commits.

### Table stakes de una app de notas (core: necesitan índice)
- ⬜ **Búsqueda full-text + quick switcher** (Ctrl+O saltar a nota, Ctrl+Shift+F
  buscar) con índice SQLite/FTS5.
- ⬜ **`[[Wiki-links]]` + backlinks + menciones no enlazadas** — enlazado de primera
  clase (necesita índice de links + grafo).
- ⬜ **Attachments** — pegar imágenes/archivos, storage consciente de git (binarios).

### Aprovechar la integración con GitHub (único)
- ⬜ **Publicar a GitHub Pages** — botón "publicar esta nota/carpeta como sitio web".
  Reusa el OAuth + push que ya existen. Fuerte para el "vendible".
- ⬜ **Sync multi-dispositivo real con UI de merge 3-way** — historia local-first de
  sincronizar con tu propio repo; resolver conflictos por nota cuando `main`
  divergió. (Roadmap Fase 2 en `ARCHITECTURE.md`.)

### Pulido de editor/UX
- ⬜ **Split panes** (dos editores lado a lado).
- ⬜ **Plantillas / daily notes.**
- ⬜ **Temas** (claro/oscuro/custom).
- ⬜ **Modo Vim** (CodeMirror lo soporta).
- ⬜ **Restaurar sesión** (reabrir tabs y paneles al arrancar).

---

## Ideas para plugins (sobre la API v1)

En el editor (CodeMirror, `editorExtensions.add`):
- `[[Wiki-links]]` clickeables + autocomplete, resaltado de `#tags`, checkboxes
  interactivos, modo foco/máquina de escribir, callouts `> [!nota]`, formateador
  de tablas, snippets `/comando`.

Paneles (`panels.register`):
- Graph view de enlaces, calendario/daily notes, kanban, explorador de tags,
  bookmarks.

Versionado (git, `git.graph` + `events`):
- Heatmap de escritura, "un día como hoy", stats de versionado, recordatorio de
  snapshot tras N cambios.

Barra de estado y comandos:
- Conteo de palabras, tiempo de lectura, rama actual; captura rápida a inbox,
  insertar plantillas, exportar.

**Límite actual (Fase A):** el renderer tiene CSP `default-src 'self'`, así que los
plugins **no** pueden hacer red externa (web clipper, IA con key propia, sync a
terceros). La escritura es acotada (`editor.insertAtCursor` en la nota activa). Red
y escritura amplia dependen del modelo de permisos de **Fase B** (`docs/PLUGINS.md`).

---

## Recomendación de orden
1. **Scrubber de timeline** — barato, visual, refuerza la identidad. 🟢
2. **Búsqueda + `[[wiki-links]]`/backlinks** — lo que la gente espera; desbloquea el resto.
3. **Publicar a GitHub Pages** — jugada vendible que reusa la integración existente.
