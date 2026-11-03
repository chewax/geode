/** Traducciones al inglés: área "views" (ver index.ts). */
export const views: Record<string, string> = {
  // Árbol de versiones (Modo avanzado: admite jerga git)
  'Estás en esta versión': "You're on this version",
  'Ir a esta versión (checkout)': 'Go to this version (checkout)',
  'Rama actual': 'Current branch',
  'Rama {name}': 'Branch {name}',
  'Última versión subida a GitHub': 'Latest version pushed to GitHub',
  'en GitHub': 'on GitHub',
  'Comparar con la versión actual': 'Compare with the current version',
  'Crear rama desde esta versión': 'Create branch from this version',
  Etiquetas: 'Tags',
  'Editar etiquetas': 'Edit tags',
  'Árbol de versiones': 'Version tree',
  Cerrar: 'Close',
  'Filtrar por etiqueta': 'Filter by tag',
  'Mostrar, ocultar, podar o borrar ramas': 'Show, hide, prune or delete branches',
  'Ramas ({n} ocultas)': 'Branches ({n} hidden)',
  Ramas: 'Branches',
  'Quitar filtro': 'Remove filter',
  'Mostrar de nuevo': 'Show again',
  'Todavía no hay versiones. Editá y guardá una nota.': 'No versions yet. Edit and save a note.',
  'Ninguna versión con ese filtro.': 'No versions match that filter.',
  'Quitar etiqueta': 'Remove tag',
  'Nueva etiqueta…': 'New tag…',
  Agregar: 'Add',
  'Los espacios se convierten en guiones. Debe ser única.':
    'Spaces become hyphens. It must be unique.',
  'Buscar etiqueta…': 'Search tags…',
  'Sin resultados': 'No results',
  'Limpiar filtros ({n})': 'Clear filters ({n})',
  'Buscar rama…': 'Search branches…',
  'Oculta — click para mostrar': 'Hidden — click to show',
  'Visible — click para ocultar': 'Visible — click to hide',
  prod: 'prod',
  actual: 'current',
  fusionada: 'merged',
  'Borrar rama (ya fusionada)': 'Delete branch (already merged)',
  'Borrar rama (no fusionada)': 'Delete branch (not merged)',
  'Borrar la rama {name}': 'Delete branch {name}',
  Borrar: 'Delete',
  'Mostrar todas ({n} ocultas)': 'Show all ({n} hidden)',

  // Línea de tiempo y viaje en el tiempo
  'Todavía no hay versiones': 'No versions yet',
  'Guardá una versión para empezar tu línea de tiempo.': 'Save a version to start your timeline.',
  'Un paso atrás': 'One step back',
  'Un paso adelante': 'One step forward',
  'Saltar al presente': 'Jump to the present',
  'en el presente': 'in the present',
  presente: 'present',
  viendo: 'viewing',
  'Estás viendo el pasado': "You're viewing the past",
  'Volver al presente': 'Back to the present',
  'Traer este momento como cambios sin guardar': 'Bring this moment back as unsaved changes',
  'Volver aquí': 'Go back here',

  // Explorador, secciones y chrome de la ventana
  Eliminar: 'Delete',
  Imagen: 'Image',
  'Expandir sección {title}': 'Expand section {title}',
  'Colapsar sección {title}': 'Collapse section {title}',
  'Barra de actividad': 'Activity bar',
  'Ver el recorrido guiado': 'Show the guided tour',
  Ajustes: 'Settings',
  Minimizar: 'Minimize',
  Restaurar: 'Restore',
  Maximizar: 'Maximize',

  // Ramas
  'Nueva rama': 'New branch',
  'Se crea desde la versión actual y cambia a ella.':
    'It is created from the current version and switches to it.',
  'Nombre de la rama (vacío = automático)': 'Branch name (empty = automatic)',
  'Los espacios se convierten en guiones.': 'Spaces become hyphens.',
  Cancelar: 'Cancel',
  'Crear rama': 'Create branch',
  'versión anterior': 'earlier version',
  'HEAD en una versión anterior — elegí una rama': 'HEAD on an earlier version — pick a branch',
  'Cambiar de rama': 'Switch branch',

  // Confirmaciones de borrado
  '¿Eliminar la carpeta "{name}"?': 'Delete the folder “{name}”?',
  '¿Eliminar la nota "{name}"?': 'Delete the note “{name}”?',
  'Se elimina del disco, pero podés recuperarla desde una versión anterior en el historial.':
    "It's removed from disk, but you can recover it from an earlier version in the history.",
  'Se eliminarán también las notas que contiene.': 'The notes inside it will be deleted too.',
  '¿Borrar la rama "{name}"?': 'Delete the branch “{name}”?',
  'La rama ya está fusionada: se puede descartar sin perder versiones.':
    'The branch is already merged: it can be discarded without losing versions.',
  'Esta rama tiene versiones que no están en su base. Si la borrás, esas versiones se pierden.':
    "This branch has versions that aren't in its base. If you delete it, those versions are lost.",
  'Borrar rama': 'Delete branch',
  '¿Quitar el cuaderno "{name}" de la lista?': 'Remove the notebook “{name}” from the list?',
  'Se saca del selector de cuadernos. Tus archivos y todo el historial quedan intactos en el disco.':
    'It’s removed from the notebook switcher. Your files and all their history stay untouched on disk.',
  'Eliminar también los archivos del disco': 'Also delete the files from disk',
  'Se mueve a la papelera del sistema (recuperable). Se borra la carpeta completa, incluido el historial de versiones.':
    'It’s moved to the system trash (recoverable). The whole folder is deleted, including its version history.',
  'Quitar y enviar a la papelera': 'Remove and move to trash',
  'Quitar de la lista': 'Remove from list',

  // Nuevo cuaderno (local o respaldado)
  'Nuevo cuaderno': 'New notebook',
  'En este equipo': 'On this computer',
  Ubicación: 'Location',
  'Cambiar…': 'Change…',
  'Todo su historial queda en tu equipo. No hace falta ninguna cuenta: podés respaldarlo en la nube cuando quieras.':
    'Its full history stays on your computer. No account needed: you can back it up to the cloud whenever you want.',
  'Para respaldar o traer cuadernos de la nube, conectá tu cuenta.':
    'To back up or get notebooks from the cloud, connect your account.',
  'Escribí este código en la página que se abrió:': 'Enter this code on the page that opened:',
  'Esperando autorización…': 'Waiting for authorization…',
  'Conectar mi cuenta': 'Connect my account',
  'Traer uno respaldado': 'Get a backed-up one',
  'Crear cuaderno respaldado': 'Create backed-up notebook',
  'Buscando tus cuadernos respaldados…': 'Looking for your backed-up notebooks…',
  'Todavía no tenés cuadernos respaldados en tu cuenta.':
    "You don't have any backed-up notebooks in your account yet.",
  privado: 'private',
  público: 'public',
  'Traer y abrir': 'Get and open',
  'Vas a elegir una carpeta vacía en tu equipo donde guardar la copia.':
    "You'll choose an empty folder on your computer to store the copy.",
  'Nombre del cuaderno': 'Notebook name',
  'mi-cuaderno': 'my-notebook',
  'Privado (solo vos lo ves)': 'Private (only you can see it)',
  'Crear y abrir': 'Create and open',

  // Selector de cuadernos
  'Gestionar cuadernos': 'Manage notebooks',
  'Cuadernos': 'Notebooks',
  'Quitar cuaderno…': 'Remove notebook…',
  'Abrir carpeta…': 'Open folder…',
  'Nuevo cuaderno…': 'New notebook…',
  'Traer de GitHub…': 'Get from GitHub…',

  // Respaldo en la nube
  'Respaldando…': 'Backing up…',
  'No se pudo respaldar': "Couldn't back up",
  'Todo en la nube': 'All in the cloud',
  'Sin subir': 'Not uploaded',
  'Sin respaldo': 'No backup',
  'Respaldo en la nube': 'Cloud backup',
  'No se pudo respaldar ahora. Tocá para volver a intentarlo.':
    "Couldn't back up right now. Click to try again.",
  Cuenta: 'Account',
  'Sin respaldar': 'Not backed up',
  'Copia automática': 'Automatic copy',
  activada: 'on',
  desactivada: 'off',
  'Todavía sin respaldo. Tocá para respaldar tu cuaderno en la nube.':
    'No backup yet. Click to back up your notebook to the cloud.',
  'Respaldá tu cuaderno en la nube': 'Back up your notebook to the cloud',
  'Guardá una copia de seguridad para no perder tu cuaderno aunque le pase algo a este dispositivo.':
    'Save a backup so you never lose your notebook, even if something happens to this device.',
  'Hacerlo después': 'Do it later',
  'Respaldar en la nube': 'Back up to the cloud',
  'Escribí este código en la página que se abrió para conectar tu cuenta:':
    'Enter this code on the page that opened to connect your account:',
  'Esperando que autorices…': 'Waiting for you to authorize…',
  'Guardando tu primera copia en la nube…': 'Saving your first copy to the cloud…',
  Reintentar: 'Try again',
  'Para respaldar tu cuaderno necesitás una cuenta. Es gratis y solo vos podés ver tus copias.':
    'To back up your notebook you need an account. It’s free and only you can see your copies.',
  'Usamos GitHub, un servicio gratuito y seguro para guardar tus copias. Tus cuadernos quedan privados: solo vos los ves.':
    'We use GitHub, a free and secure service, to store your copies. Your notebooks stay private: only you can see them.',
  'Ya tengo cuenta': 'I already have an account',
  'Crear una gratis': 'Create one for free',
  '1. Creá tu cuenta gratis en la página que se abrió en tu navegador.':
    '1. Create your free account on the page that opened in your browser.',
  '2. Cuando termines, volvé acá y tocá "Conectar cuenta".':
    '2. When you’re done, come back here and click “Connect account”.',
  'Conectar cuenta': 'Connect account',

  // Recorrido guiado
  'Paso {n} de {total}': 'Step {n} of {total}',
  Saltar: 'Skip',
  Anterior: 'Back',
  Listo: 'Done',
  Siguiente: 'Next',
  'Escribí sin miedo': 'Write without fear',
  'Este es tu cuaderno. Escribí lo que quieras acá: se guarda solo y nunca vas a perder nada.':
    'This is your notebook. Write whatever you want here: it saves itself and you’ll never lose anything.',
  'Marcá una versión': 'Mark a version',
  'Cuando algo te importe, guardá una versión desde acá. Vas a poder volver a este momento más adelante.':
    'When something matters to you, save a version from here. You’ll be able to come back to this moment later.',
  'Respaldá en la nube': 'Back up to the cloud',
  'Desde este botón guardás una copia de seguridad en la nube, por si algo le pasa a este dispositivo.':
    'This button saves a backup to the cloud, in case something happens to this device.',
  'Volvé cuando quieras': 'Go back anytime',
  'Acá está el historial de tu cuaderno. Podés mirar los cambios y volver a cualquier versión anterior.':
    'Here’s your notebook’s history. You can look at the changes and go back to any earlier version.'
}
