# Phase 9: Snapshots automáticos con IA opcional - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Permitir que las snapshots automáticas (auto-snapshots) lleven título/descripción generados por IA, como **opt-in** configurable en Ajustes (por defecto APAGADO). Cuando está activo, la MISMA snapshot de seguridad que ya existe pasa a nombrarse con IA — no se agrega un segundo mecanismo. Con el opt-in apagado, el comportamiento v1.0 (mensaje marcador sin IA) queda intacto. NO incluye detector de idle nuevo, ni cambiar la cadencia del timer, ni IA en snapshots por tiempo transcurrido sin cambios.

</domain>

<decisions>
## Implementation Decisions

### El "idle" es emergente — NO se construye detector de idle ni se toca el timer (decisión del usuario)
- El `setInterval` de cadencia (`restartSnapshotTimer`) **sigue igual**: no se para, no se reemplaza por un detector de inactividad.
- El costo de IA NO escala por tiempo transcurrido porque `snapshotIfChanged` ya es no-op con árbol limpio (`commit()` devuelve `null`). Como el usuario guarda manualmente, cuando el timer dispara normalmente **no hay cambios** → no hay snapshot → no hay IA. La IA solo corre en los intervalos donde de verdad hubo edición sin snapshotear todavía. Eso satisface AISNAP-01 ("solo con cambios, nunca por tiempo transcurrido").

### La misma snapshot de seguridad usa IA — no hay un segundo path (decisión del usuario)
- Se modifica `snapshotIfChanged` para que, cuando el opt-in está ON y hay cambios, genere título/descripción por IA y commitee con ese mensaje. NO se crea una función/snapshot paralela.
- Formato del mensaje: espejar el flujo manual → `[title, description].filter(Boolean).join('\n\n')` (título, línea en blanco, descripción como punteo). Reusa `OpenRouterProvider.generateNamedVersion(diff)` con `pendingDiff` (ya acotado a .md).

### Opt-in en Ajustes, default OFF
- Nuevo flag persistido en `settings.snapshots` (p.ej. `aiTitles?: boolean`, `undefined`/`false` = OFF). Resolver defensivo como `resolveCadenceMinutes` (valor ausente o basura → OFF).
- Toggle en la sección de snapshots/IA de `SettingsModal.tsx`, en español, Lucide. Copy que deje claro que usa la API key de IA (tiene costo) y que solo corre cuando una snapshot automática realmente tiene cambios.

### Fallback: nunca perder la snapshot (invariante de no-pérdida)
- Si el opt-in está ON pero **no hay API key o modelo configurado**, o la **llamada a IA falla/timeout**, `snapshotIfChanged` cae al **mensaje marcador actual** y commitea igual. La snapshot de seguridad nunca se pierde por un problema de IA. `snapshotIfChanged` sigue sin lanzar nunca.

### Claude's Discretion
- **Guardrail del path de salida/cambio de bóveda**: los llamados forzados por ciclo de vida — `'cierre'` (quit, con race de 3s), `'cambio-de-boveda'`, `'baja-de-boveda'` — deben conservar el **marcador instantáneo, sin IA** (una llamada de red en el cierre casi siempre excedería el timeout de 3s y demoraría la salida). La IA solo aplica al path periódico `'cadencia'`. Esto NO es "otra snapshot": es la misma `snapshotIfChanged` con un parámetro (p.ej. `allowAi: boolean`) para que el cierre siga siendo instantáneo.
- Nombre exacto del flag de settings, del parámetro y ubicación precisa del toggle en Ajustes.
- Si conviene un pequeño timeout/AbortController alrededor de la llamada de IA en el path de cadencia para no dejar el commit colgado (recomendado, ~10s como en `getOpenRouterUsage`).

</decisions>

<code_context>
## Existing Code Insights

### Motor de auto-snapshots (a modificar)
- `src/main/index.ts` `snapshotIfChanged(reason)` (~122): hoy `gitService.commit(root, snapshotMessage())`. **Punto de cambio principal**: cuando `reason==='cadencia'` y el opt-in está ON y hay diff, generar `{title, description}` por IA y commitear con el mensaje armado; si no, marcador actual.
- `snapshotMessage()` (~111): marcador `'Instantánea automática — ' + fecha`. Se mantiene como fallback y para el opt-in OFF.
- `restartSnapshotTimer()` (~155) / `setInterval` (~163): **sin cambios** (el usuario pidió no tocar el timer).
- Llamados de ciclo de vida a `snapshotIfChanged`: `'cambio-de-boveda'` (~272), `'baja-de-boveda'` (~296), `'cierre'` (~671). Estos NO usan IA (guardrail).

### IA (a reusar, sin cambios de fondo)
- `src/main/services/ai.ts` `OpenRouterProvider.generateNamedVersion(diff): Promise<NamedVersion>` (~140) — ya produce `{title, description}`. Reusar tal cual.
- Patrón de invocación desde el main: `IPC.aiSuggestVersion` (~458) muestra cómo se obtienen `key`+`ai.model` de settings, se valida, se llama `pendingDiff` y se genera. La lógica de la snapshot con IA replica esto dentro de `snapshotIfChanged`.
- `gitService.pendingDiff(root)` (~755 en git.ts): diff unificado SOLO .md, base para la IA (content-hash vs HEAD; regla racy-git).

### Settings (a extender)
- `src/main/services/settings.ts` `snapshots?: { cadenceMinutes?: number | null }` (~39): agregar `aiTitles?: boolean`. Nuevo setter análogo a `setSnapshotCadence` (~184).
- `SnapshotsConfig` en `@shared/ipc.ts`: extender con el flag; canal IPC `snapshotsGet`/`snapshotsSet` (index.ts ~488/494) o uno nuevo para el toggle. Bridge en `src/preload/index.ts`.

### UI de Ajustes (a extender)
- `src/renderer/src/SettingsModal.tsx`: sección de snapshots (cadencia) y sección de IA (key/modelo, ~261/275). El toggle de opt-in vive acá; espejar el patrón de toggles existentes (`.ps-toggle` en la sección de plugins, ~392).
- Formato del mensaje AI espejando `CommitDialog.tsx` (~59): `[title, description].filter(Boolean).join('\n\n')`.

### Established Patterns
- IPC tipado `geode:*`; resolver defensivo de config (como `resolveCadenceMinutes`); `snapshotIfChanged` nunca lanza.
- Detección de cambios SIEMPRE por content-hash vs HEAD (racy-git; nunca statusMatrix).
- Strings/comentarios en español; iconos Lucide.

### Integration Points
- El toggle en Ajustes escribe `settings.snapshots.aiTitles`; el main lo lee en cada tick de cadencia.
- La snapshot con IA aparece en la timeline con título/descripción legibles, idéntica a un guardado manual con IA (SC-04).

</code_context>

<specifics>
## Specific Ideas

- AISNAP-01 relaja explícitamente el invariante de costo v1.0 ("auto-snapshots nunca invocan IA") de forma acotada: solo opt-in + solo con cambios reales. El usuario aceptó que el gate de "solo con cambios" (árbol limpio = no-op) es suficiente, sin necesidad de un detector de idle separado.
- El usuario fue explícito: "no es necesario parar el timer" y "el snapshot de seguridad comienza a usar IA, no se usa otro".

</specifics>

<deferred>
## Deferred Ideas

- Detector de idle real (inactividad del editor / powerMonitor) — descartado: innecesario dado el gate de "solo con cambios".
- IA en los snapshots de ciclo de vida (cierre/cambio de bóveda) — fuera de alcance: esos paths siguen instantáneos con marcador.
- Cadencia/umbral configurable específico para IA — no aplica (se reusa la cadencia existente).

</deferred>
