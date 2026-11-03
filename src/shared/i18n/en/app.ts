/** Traducciones al inglés: área "app" (ver index.ts). */
export const app: Record<string, string> = {
  // Sincronización con la nube
  'Se trajeron cambios de tus otras computadoras.': 'Brought in changes from your other computers.',
  '«{name}» se editó en dos computadoras: quedó tu versión y la de la nube se guardó al lado.':
    '“{name}” was edited on two computers: your version was kept and the cloud one was saved next to it.',
  '{n} notas se editaron en dos computadoras: quedó tu versión y la de la nube se guardó al lado de cada una.':
    '{n} notes were edited on two computers: your version was kept and the cloud one was saved next to each.',
  'No se pudo respaldar': "Couldn't back up",
  'Listo: tu cuaderno está a salvo en la nube.': 'Done: your notebook is safe in the cloud.',

  // Bienvenida y cuadernos
  'Mi primer cuaderno': 'My first notebook',
  'Escribí sin miedo a perder nada.': 'Write without fear of losing anything.',
  'Nombre de tu primer cuaderno': 'Name of your first notebook',
  'Creando tu cuaderno…': 'Creating your notebook…',
  'Crear mi primer cuaderno': 'Create my first notebook',
  'Elegir otra ubicación': 'Choose another location',
  'Abrir una carpeta existente': 'Open an existing folder',
  'No se pudo crear el cuaderno': "Couldn't create the notebook",
  'No se pudo crear el cuaderno. Revisá que tengas permiso de escritura en tu carpeta de Documentos e intentá de nuevo.':
    "Couldn't create the notebook. Check that you can write to your Documents folder and try again.",
  'No se pudo quitar el cuaderno': "Couldn't remove the notebook",
  'El puente con el sistema (preload) no cargó. Reiniciá la app; si persiste, revisá la consola del proceso principal.':
    "The system bridge (preload) didn't load. Restart the app; if it keeps happening, check the main process console.",
  'Abriste tu bóveda de Obsidian ({n} nota). Guardamos una primera versión de todo: enlaces, imágenes, etiquetas y propiedades funcionan igual.':
    'You opened your Obsidian vault ({n} note). We saved a first version of everything: links, images, tags and properties work the same.',
  'Abriste tu bóveda de Obsidian ({n} notas). Guardamos una primera versión de todo: enlaces, imágenes, etiquetas y propiedades funcionan igual.':
    'You opened your Obsidian vault ({n} notes). We saved a first version of everything: links, images, tags and properties work the same.',
  'Guardamos una primera versión de la nota de esta carpeta: desde ahora nada se pierde.':
    'We saved a first version of the note in this folder: from now on nothing gets lost.',
  'Guardamos una primera versión de las {n} notas de esta carpeta: desde ahora nada se pierde.':
    'We saved a first version of the {n} notes in this folder: from now on nothing gets lost.',

  // Notas, enlaces y explorador
  '«{name}» no existía en ese momento.': '“{name}” didn’t exist at that time.',
  'Nota «{name}» creada.': 'Note “{name}” created.',
  'No se pudo crear la nota': "Couldn't create the note",
  'Se actualizaron los enlaces en {n} nota.': 'Links updated in {n} note.',
  'Se actualizaron los enlaces en {n} notas.': 'Links updated in {n} notes.',
  'Se renombró, pero no se pudieron actualizar los enlaces.': "Renamed, but the links couldn't be updated.",
  'No se pudo renombrar': "Couldn't rename",
  'No se pudo mover el elemento.': "Couldn't move the item.",
  'Nueva nota': 'New note',
  'Nueva carpeta': 'New folder',
  'Nueva nota en "{path}"': 'New note in "{path}"',
  'Nueva carpeta en "{path}"': 'New folder in "{path}"',
  'Buscar en todas las notas': 'Search all notes',
  'Buscar en todas las notas (Ctrl+Shift+F)': 'Search all notes (Ctrl+Shift+F)',
  'No disponible durante el viaje en el tiempo': 'Not available while time traveling',
  'Actualizar notas': 'Refresh notes',
  'Orden A→Z (click: Z→A)': 'Sort A→Z (click: Z→A)',
  'Orden Z→A (click: A→Z)': 'Sort Z→A (click: A→Z)',
  'Colapsar todo': 'Collapse all',
  'Expandir todo': 'Expand all',
  'Cuaderno vacío': 'Empty notebook',
  'Creá una nota o una carpeta con las acciones de la cabecera de esta sección.':
    'Create a note or a folder with the actions in this section’s header.',
  'Mostrar en el explorador': 'Show in file explorer',
  Duplicar: 'Duplicate',
  Renombrar: 'Rename',
  Eliminar: 'Delete',

  // Secciones de la barra lateral
  BUSCAR: 'SEARCH',
  'Cerrar búsqueda': 'Close search',
  EXPLORADOR: 'EXPLORER',
  'ENLACES ENTRANTES': 'BACKLINKS',
  ETIQUETAS: 'TAGS',
  'LÍNEA DE TIEMPO': 'TIMELINE',
  'Cargando línea de tiempo…': 'Loading timeline…',
  'Arrastrar para redimensionar': 'Drag to resize',

  // Dictado
  'Para dictar, configurá tu clave de OpenRouter en Ajustes → IA.': 'To dictate, set up your OpenRouter key in Settings → AI.',
  'No se pudo abrir el micrófono.': "Couldn't open the microphone.",
  'No se escuchó nada': "Didn't hear anything",
  'No se entendió nada': "Couldn't understand anything",
  'Listo: texto agregado': 'Done: text added',
  'Listo: agregado a tu nota de hoy': 'Done: added to today’s note',
  'Dictado agregado a tu nota de hoy.': 'Dictation added to today’s note.',
  'No se pudo dictar': "Couldn't dictate",

  // Versiones y viaje en el tiempo
  'Instantánea de seguridad — {date}': 'Safety snapshot — {date}',
  'Versión {date}': 'Version {date}',
  'Cambios {date}': 'Changes {date}',
  'Traído al presente como cambios sin guardar.': 'Brought to the present as unsaved changes.',
  'No se pudo traer esta versión al presente.': "Couldn't bring this version to the present.",
  'Tenés {n} cambio sin guardar como versión.\nSi vas a otra versión ahora, se descarta.\n\nCancelá y usá "Guardar versión" para conservarlo.':
    'You have {n} change not saved as a version.\nIf you go to another version now, it will be discarded.\n\nCancel and use "Save version" to keep it.',
  'Tenés {n} cambios sin guardar como versión.\nSi vas a otra versión ahora, se descartan.\n\nCancelá y usá "Guardar versión" para conservarlos.':
    'You have {n} changes not saved as a version.\nIf you go to another version now, they will be discarded.\n\nCancel and use "Save version" to keep them.',
  'Tenés {n} cambio sin guardar como versión.\nCrear la rama desde otra versión lo descarta.\n\n¿Continuar?':
    'You have {n} change not saved as a version.\nCreating the branch from another version discards it.\n\nContinue?',
  'Tenés {n} cambios sin guardar como versión.\nCrear la rama desde otra versión los descarta.\n\n¿Continuar?':
    'You have {n} changes not saved as a version.\nCreating the branch from another version discards them.\n\nContinue?',
  'Guardar versión': 'Save version',
  'Crear versión': 'Create version',
  'Crear versión (Ctrl+S)': 'Create version (Ctrl+S)',
  'Árbol de versiones': 'Version tree',

  // Modo Avanzado (ramas y etiquetas)
  'No se pudo crear la rama': "Couldn't create the branch",
  'No se pudo agregar la etiqueta': "Couldn't add the tag",
  'No se pudo borrar la rama. {detail}': "Couldn't delete the branch. {detail}",
  'No se pudo borrar la rama.': "Couldn't delete the branch.",
  'Crear una rama desde esta versión': 'Create a branch from this version',
  'Integrar la rama a su rama de origen': 'Merge the branch into its source branch',

  // IA
  'Configurá la API key y el modelo de IA en Ajustes (⚙).': 'Set up the AI API key and model in Settings (⚙).',
  'Error desconocido': 'Unknown error',
  Gastado: 'Spent',
  Límite: 'Limit',
  'sin límite': 'no limit',
  Restante: 'Remaining',
  Modelo: 'Model',
  'No se pudo leer el uso: {error}': "Couldn't read usage: {error}",
  'Cargando uso…': 'Loading usage…',

  // Plugins y comandos de la paleta
  'No se pudieron cargar los plugins instalados.': "Couldn't load the installed plugins.",
  'Plugins con error: {ids}': 'Plugins with errors: {ids}',
  Núcleo: 'Core',
  Vista: 'View',
  Ayuda: 'Help',
  Git: 'Git',
  'Dictar (empezar / terminar)': 'Dictate (start / stop)',
  'Ctrl+Alt+Espacio': 'Ctrl+Alt+Space',
  'Alternar vista previa': 'Toggle preview',
  'Abrir vista previa al lado (en vivo)': 'Open preview to the side (live)',
  'Dividir editor a la derecha': 'Split editor right',
  'Dividir editor abajo': 'Split editor down',
  'Ver el recorrido guiado': 'Take the guided tour',
  'Alternar árbol de versiones': 'Toggle version tree',
  'Crear rama desde la versión actual': 'Create branch from the current version',
  'Integrar rama a su base': 'Merge branch into its base',
  'Push a GitHub': 'Push to GitHub',
  'Paleta de comandos': 'Command palette',
  'Paleta de comandos (Ctrl+P)': 'Command palette (Ctrl+P)',

  // Barra de estado
  '{n} palabra': '{n} word',
  '{n} palabras': '{n} words',
  '{n} carácter': '{n} character',
  '{n} caracteres': '{n} characters',
  '{n} línea': '{n} line',
  '{n} líneas': '{n} lines',
  'Ninguna nota abierta': 'No note open',
  'Guardando…': 'Saving…',
  'Guardado en este dispositivo': 'Saved on this device',
  'Todo en la nube': 'All in the cloud',
  Guardado: 'Saved',
  'Versión de Geode': 'Geode version',
  Versión: 'Version',
  Plataforma: 'Platform'
}
