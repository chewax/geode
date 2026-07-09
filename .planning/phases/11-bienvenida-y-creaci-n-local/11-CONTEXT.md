# Phase 11: Bienvenida y creación local - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase entrega el camino de entrada de un usuario nuevo: de "abrir la app por primera vez" a "estar escribiendo en su primer cuaderno" en 1 click, sin cuenta, sin selector de carpeta y sin jerga. Incluye la pantalla de bienvenida sin jerga (CTA primario único), la creación de un cuaderno **local** por defecto en `~/Documents/Geode/<nombre>`, una nota de bienvenida sembrada, sanitización de nombres + resolución de colisiones, y la reescritura de strings de Capa 0 ("bóveda/GitHub/repo/clonar" → "cuaderno / copia de seguridad / respaldo en la nube").

**Fuera de esta fase:** el asistente de respaldo en la nube y su reconstrucción del flujo GitHub (Fase 12), y el tour interactivo (Fase 13). La nota sembrada sí sirve de escenario para el tour, pero el tour se construye en Fase 13.
</domain>

<decisions>
## Implementation Decisions

### Bienvenida (pantalla welcome)
- CTA primario único: **"Crear mi primer cuaderno"** (ONB-01).
- Quitar el clon de GitHub de la pantalla de bienvenida; dejar un único link secundario **"Abrir una carpeta existente"** (abre el picker nativo → `setRoot`). El respaldo/clon es de la Fase 12.
- Reemplazar la tagline actual ("Notas versionadas sobre Git — local-first") por copy sin jerga: **"Escribí sin miedo a perder nada."**
- El CTA primario muestra un **mini-campo de nombre pre-rellenado** ("Mi primer cuaderno"); Enter o botón "Crear" crea el cuaderno. Un campo pre-rellenado mantiene el "1 click" (basta con confirmar) y a la vez da la entrada de texto que ONB-04 necesita sanitizar.

### Creación local (ubicación + naming)
- Carpeta por defecto: **`~/Documents/Geode/<nombre>`**, resolviendo la base con `app.getPath('documents')` (ONB-02). Sin selector de carpeta en el happy path.
- Nombre pre-rellenado: **"Mi primer cuaderno"**.
- Escape secundario **"Elegir otra ubicación"** dentro del paso de creación → abre el picker nativo y crea el cuaderno ahí en vez de en la carpeta por defecto.
- Nuevo IPC **`vault.createLocal(name)`** (canal `geode:vault-create-local`): arma la ruta bajo Documents/Geode, sanitiza el nombre, resuelve colisión de carpeta, hace `git init`, siembra la nota de bienvenida, crea el primer commit (primera versión) y fija el vault (`setRoot`). No pasa por GitHub. Reusar el mismo git-init/primer-commit que usa el flujo existente `createWithRepo` donde aplique.

### Nota de bienvenida sembrada (ONB-03)
- Archivo: **"Bienvenida.md"**.
- Contenido **corto y cálido, ~1 pantalla**: bienvenida + mensaje "esto se guarda solo / nada se pierde" + invitación a escribir y a borrarla. Sirve de escenario para el tour de la Fase 13.
- Se **commitea como la primera versión** del cuaderno, para que "ver historial" (paso del tour) tenga contenido desde el arranque.
- Tono: **2ª persona, español cálido, sin jerga**; menciona "copia de seguridad", nunca "GitHub".

### Sanitización + colisiones (ONB-04)
- Sanitizar (no bloquear): reemplazar los ilegales de Windows `< > : " / \ | ? *`, recortar puntos/espacios finales y evitar nombres reservados (CON, PRN, AUX, NUL, COM1-9, LPT1-9). Implementar en el **main** como util compartida.
- Colisión de carpeta: **sufijo numérico** ` (2)`, `(3)`… hasta que la carpeta quede libre; **nunca pisar** datos existentes.
- Nombre vacío o todo-ilegal: **fallback a "Cuaderno"**.

### Reescritura de copy (COPY-01)
- Reescribir por completo los strings de la **welcome + el nuevo flujo de creación local**.
- Barrer "bóveda → cuaderno" en superficies de Capa 0.
- Dejar la copy **GitHub-específica de respaldo** (NewVaultDialog / sección de respaldo en Ajustes) para que la **finalice la Fase 12**, que reconstruye ese flujo — evita reescribir dos veces lo mismo. En Fase 11 solo se tocan las superficies que no dependen de esa reconstrucción.

### Claude's Discretion
- Redacción exacta de la nota de bienvenida y de los microcopys, dentro del tono acordado.
- Nombres internos de funciones/utils y estructura de archivos nuevos.
- Detalles de estilo CSS reutilizando las clases existentes (`welcome`, `modal`, etc.).
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/src/App.tsx` (bloque `if (!vault)`, líneas ~1079-1105): pantalla de bienvenida actual con `<h1>Geode</h1>`, tagline, botón primario "Abrir carpeta como vault" (`openVault()`) y "Clonar o crear en GitHub" (`setNewVaultOpen(true)`). Punto de integración principal.
- `src/renderer/src/NewVaultDialog.tsx`: diálogo GitHub-céntrico (clonar/crear repo) con clases `modal-overlay`/`modal`/`nv-*`. Referencia de estilo; su reescritura de copy queda para Fase 12.
- `src/main/services/vault.ts`: `VaultService` con `setRoot(root)`, `openDialog()`, `pickFolder(title)`, `isEmptyDir(dir)`, `resolveInside()` (bloquea path traversal), `createNote()`, `writeNote()` (usa `atomicWrite`). Base para el nuevo `createLocal`.
- `src/main/fs/atomic.ts` (`atomicWrite`): escritura atómica para sembrar la nota sin corrupción.
- Flujo existente `createWithRepo` / `cloneFromGithub` (definido fuera de vault.ts; expuesto en `preload/index.ts`, `shared/ipc.ts`): referencia del git-init + primer commit + push.

### Established Patterns
- IPC tipado: canales `geode:*` en `src/shared/ipc.ts`, handlers en `src/main/index.ts`, superficie en `src/preload/index.ts`, consumo vía `window.geode.*`.
- Preload DEBE ser CommonJS (`.cjs`); renderer sandboxed (contextIsolation).
- UI: iconos Lucide monocromo, clases kebab-case (`welcome`, `modal-overlay`, `primary`, `icon-btn`), strings y comentarios en español.
- Detección de cambios/commit racy-git-safe (hash de contenido vs blobs de HEAD) — respetar al hacer el primer commit sembrado.
- Red de seguridad: App.tsx maneja `typeof window.geode === 'undefined'`.

### Integration Points
- Pantalla `if (!vault)` en App.tsx → reemplazar por la nueva bienvenida + flujo de creación local.
- Nuevo canal `geode:vault-create-local` en ipc.ts / main/index.ts / preload / VaultService.
- `adoptVault(info)` / `setNewVaultOpen` ya existen en App.tsx para adoptar la bóveda creada.
</code_context>

<specifics>
## Specific Ideas

- CTA primario textual exacto: "Crear mi primer cuaderno".
- Tagline exacta: "Escribí sin miedo a perder nada."
- Prefill del nombre: "Mi primer cuaderno".
- Ruta por defecto: `~/Documents/Geode/<nombre>` (base vía `app.getPath('documents')`).
- Nota sembrada: `Bienvenida.md`, commiteada como primera versión.
- Fallback de nombre inválido: "Cuaderno".
</specifics>

<deferred>
## Deferred Ideas

- Asistente de respaldo en la nube y reconstrucción del flujo GitHub / reescritura de copy de NewVaultDialog y sección de respaldo en Ajustes → **Fase 12** (BACKUP-01..05).
- Tour interactivo de primera vez que usa la nota sembrada como escenario → **Fase 13** (TOUR-01..03).
- Contenido sembrado personalizado por caso de uso (estudiante/escritor) → v2 (ONBX-03).
</deferred>
