# Plugins de ejemplo

Cada carpeta es un plugin listo para copiar. Para instalar uno: Ajustes →
**Plugins** → **Abrir carpeta**, copiá la carpeta ahí, activalo en la lista y
reiniciá Geode.

La guía completa para autores (API, manifiesto, empaquetar librerías, buenas
prácticas) está en [`docs/PLUGINS.md`](../../docs/PLUGINS.md).

| Ejemplo | Muestra |
|---|---|
| `barras-de-progreso/` | **Bloque de código propio** (` ```progreso `) que dibuja barras en SVG, y un comando para insertarlo. API v2. |
| `hola-mundo-async/` | Comando con la API async, un **panel** React dentro del iframe, un ítem de **barra de estado** que se actualiza y suscripción a `note:open`. |
| `hola-mundo/` | El mínimo: un comando que inserta un saludo. |

Todos corren **aislados** (iframe sandbox, sin red ni acceso a tus archivos
fuera de lo que expone `ctx`).
