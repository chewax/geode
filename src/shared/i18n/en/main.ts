/** Traducciones al inglés: área "main" (ver index.ts). */
export const main: Record<string, string> = {
  // ── Bóvedas / cuadernos ───────────────────────────────────────────────────
  'No hay cuaderno abierto': 'No notebook is open',
  'Cuaderno desconocido': 'Unknown notebook',
  'No se pudo enviar la carpeta a la papelera: {motivo}. El cuaderno sigue en la lista.':
    "Couldn't move the folder to the trash: {motivo}. The notebook is still in the list.",
  'Elegí una carpeta VACÍA donde clonar el repo': 'Choose an EMPTY folder to clone the repo into',
  'La carpeta no está vacía. Elegí (o creá) una carpeta vacía para clonar.':
    'That folder isn’t empty. Choose (or create) an empty folder to clone into.',
  'Elegí la carpeta para el cuaderno nuevo': 'Choose the folder for the new notebook',
  'Elegí dónde crear tu cuaderno': 'Choose where to create your notebook',
  'Elegí de nuevo la ubicación del cuaderno.': 'Choose the notebook location again.',
  'Elegí una carpeta para abrir como cuaderno': 'Choose a folder to use as a notebook',
  'No se pudo crear el cuaderno. Revisá que tengas permiso de escritura en la carpeta.':
    "Couldn't create the notebook. Check that you have permission to write to that folder.",
  'No se pudo abrir el archivo con la aplicación del sistema': "Couldn't open the file with the system app",
  nota: 'note',
  Cuaderno: 'Notebook',
  'No es una carpeta: {path}': 'Not a folder: {path}',
  'Ruta fuera del cuaderno: {path}': 'Path outside the notebook: {path}',
  'Ya existe: {path}': 'Already exists: {path}',
  'Lista de marcadores inválida': 'Invalid bookmark list',
  'Solo se pueden adjuntar imágenes': 'Only images can be attached',
  'La imagen es demasiado grande (máximo 25 MB)': 'The image is too large (25 MB max)',
  'Pegado {date}': 'Pasted {date}',

  // ── Versiones automáticas (aparecen en la línea de tiempo) ───────────────
  'Instantánea automática — {date}': 'Automatic snapshot — {date}',
  'Primera versión': 'First version',
  'Primera versión (importada de Obsidian)': 'First version (imported from Obsidian)',
  'Cambios antes de sincronizar': 'Changes before syncing',
  'Integrar cambios de la nube': 'Bring in changes from the cloud',
  'Versión de la nube de una nota en conflicto': 'Cloud version of a conflicting note',
  'Versiones de la nube de {n} notas en conflicto': 'Cloud versions of {n} conflicting notes',
  'versión de la nube': 'cloud version',

  // ── Ramas y etiquetas (Modo avanzado) ─────────────────────────────────────
  'Ya existe una rama "{name}"': 'A branch named “{name}” already exists',
  'HEAD detached: no hay rama para integrar': 'Detached HEAD: there’s no branch to merge',
  'La rama "{branch}" no tiene una base a la cual integrar':
    'Branch “{branch}” has no base branch to merge into',
  'La rama es su propia base': 'The branch is its own base',
  'La rama base "{base}" ya no existe': 'Base branch “{base}” no longer exists',
  'Nombre de etiqueta inválido': 'Invalid tag name',
  'Ya existe una etiqueta "{name}"': 'A tag named “{name}” already exists',
  'No se puede borrar la rama principal (main)': 'The main branch (main) can’t be deleted',
  'HEAD está en una versión anterior (detached): no hay rama para pushear':
    'You’re on an earlier version (detached HEAD): there’s no branch to push',

  // ── Respaldo en la nube / GitHub ──────────────────────────────────────────
  'Conectá tu cuenta de GitHub en Ajustes': 'Connect your GitHub account in Settings',
  'No hay un device flow en curso': 'No sign-in is in progress',
  'Este cuaderno todavía no tiene respaldo en la nube. Activalo primero.':
    'This notebook isn’t backed up to the cloud yet. Turn on backup first.',
  'El código expiró; probá de nuevo': 'The code expired; please try again',
  'Autorización cancelada': 'Authorization canceled',
  'Se agotó el tiempo de autorización': 'Authorization timed out',
  'No hay internet. Tu cuaderno sigue guardado en este dispositivo; se respaldará cuando vuelva la conexión.':
    'No internet connection. Your notebook is still saved on this device; it will be backed up when you’re back online.',
  'Se perdió la conexión con tu cuenta. Reconectá para seguir respaldando.':
    'Lost the connection to your account. Reconnect to keep backing up.',
  'Ya tenés un respaldo con ese nombre. Probá con otro nombre de cuaderno.':
    'You already have a backup with that name. Try a different notebook name.',
  'No se pudo respaldar ahora. Tu cuaderno sigue guardado en este dispositivo; volvé a intentarlo en un momento.':
    'Couldn’t back up right now. Your notebook is still saved on this device; try again in a moment.',

  // ── IA ────────────────────────────────────────────────────────────────────
  'Configurá la API key y el modelo de IA en Ajustes': 'Set up the AI API key and model in Settings',
  'El modelo devolvió una respuesta vacía': 'The model returned an empty response',
  'La sugerencia de IA no está disponible: el modelo configurado ya no existe en OpenRouter. Revisá el modelo en Ajustes → IA.':
    'AI suggestions aren’t available: the selected model no longer exists on OpenRouter. Check the model in Settings → AI.',
  'La sugerencia de IA no está disponible: la API key de OpenRouter fue rechazada. Revisá la API key en Ajustes → IA.':
    'AI suggestions aren’t available: OpenRouter rejected the API key. Check the API key in Settings → AI.',
  'La sugerencia de IA no está disponible: no se pudo contactar a OpenRouter. Probá de nuevo en un momento.':
    'AI suggestions aren’t available: couldn’t reach OpenRouter. Try again in a moment.',
  'La sugerencia de IA no está disponible en este momento. Podés escribir el nombre y la descripción a mano.':
    'AI suggestions aren’t available right now. You can write the name and description yourself.',
  'OpenRouter no respondió (timeout de 10s)': 'OpenRouter didn’t respond (10s timeout)',
  'No se pudo contactar OpenRouter: {error}': 'Couldn’t reach OpenRouter: {error}',
  'OpenRouter /models devolvió {status}': 'OpenRouter /models returned {status}',
  'OpenRouter /auth/key devolvió {status}: {body}': 'OpenRouter /auth/key returned {status}: {body}',

  // ── Dictado ───────────────────────────────────────────────────────────────
  'Escuchando…': 'Listening…',
  '{shortcut} para terminar': '{shortcut} to finish',
  'Transcribiendo…': 'Transcribing…',
  Listo: 'Done',
  'Para dictar, configurá tu clave de OpenRouter en Ajustes → IA.':
    'To dictate, set up your OpenRouter key in Settings → AI.',
  'OpenRouter no ofrece ahora ningún modelo que entienda audio. Probá más tarde.':
    'OpenRouter doesn’t currently offer any model that understands audio. Try again later.',
  'No se pudo dictar: la clave de OpenRouter fue rechazada. Revisala en Ajustes → IA.':
    'Couldn’t dictate: OpenRouter rejected your key. Check it in Settings → AI.',
  'No se pudo dictar: tu cuenta de OpenRouter no tiene saldo suficiente.':
    'Couldn’t dictate: your OpenRouter account doesn’t have enough credit.',
  'No se pudo dictar: no hay conexión con OpenRouter. Probá de nuevo en un momento.':
    'Couldn’t dictate: can’t connect to OpenRouter. Try again in a moment.',
  'No se pudo dictar: el modelo de dictado ya no existe. Elegí otro en Ajustes → IA.':
    'Couldn’t dictate: the dictation model no longer exists. Choose another one in Settings → AI.',
  'No se pudo transcribir el audio ahora. Probá de nuevo en un momento.':
    'Couldn’t transcribe the audio right now. Try again in a moment.',

  // ── Plugins (visibles en Ajustes → Plugins) ───────────────────────────────
  'apiVersion inválido: se espera un entero ≥ 1 (recibido {value})':
    'Invalid apiVersion: expected an integer ≥ 1 (got {value})',
  'Requiere API de plugins v{required}; esta versión de Geode soporta v{supported}':
    'Requires plugin API v{required}; this version of Geode supports v{supported}',
  'minAppVersion inválido: se espera una cadena "x.y.z" (recibido {value})':
    'Invalid minAppVersion: expected an "x.y.z" string (got {value})',
  'Requiere Geode ≥ {required} (versión actual {current})': 'Requires Geode ≥ {required} (current version {current})',
  'Manifiesto incompleto: faltan id, name o main': 'Incomplete manifest: id, name or main is missing',
  'No se pudo leer plugin.json: {error}': 'Couldn’t read plugin.json: {error}',
  'Plugin no encontrado: {id}': 'Plugin not found: {id}',
  'El campo "main" del manifiesto no puede ser absoluto ni salir de la carpeta':
    'The manifest’s "main" field can’t be absolute or point outside the plugin folder'
}
