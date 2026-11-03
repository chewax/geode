/** Traducciones al inglés: área "panels" (ver index.ts). */
export const panels: Record<string, string> = {
  // Búsqueda
  'No se pudo buscar': "Couldn't search",
  'Volvé al presente para buscar': 'Go back to the present to search',
  'Buscar en todas las notas…': 'Search all notes…',
  'Buscar en todas las notas': 'Search all notes',
  Limpiar: 'Clear',
  'Limpiar búsqueda': 'Clear search',
  'Sin resultados': 'No results',
  '{total} coincidencia en {notes} nota': '{total} match in {notes} note',
  '{total} coincidencia en {notes} notas': '{total} match in {notes} notes',
  '{total} coincidencias en {notes} nota': '{total} matches in {notes} note',
  '{total} coincidencias en {notes} notas': '{total} matches in {notes} notes',
  'Mostrar descartados': 'Show dismissed',
  'Descartar esta nota de los resultados': 'Dismiss this note from the results',
  'Descartar {name} de los resultados': 'Dismiss {name} from the results',
  'Descartar esta coincidencia': 'Dismiss this match',

  // Etiquetas y enlaces entrantes
  'Disponible en el presente.': 'Available in the present.',
  'Buscando etiquetas…': 'Looking for tags…',
  'Todavía no hay etiquetas.': 'No tags yet.',
  'Escribí {tag} en una nota para agruparla con otras.': 'Type {tag} in a note to group it with others.',
  '#algo': '#something',
  Colapsar: 'Collapse',
  Expandir: 'Expand',
  'Ver notas con #{tag}': 'See notes tagged #{tag}',
  'Abrí una nota para ver qué notas la enlazan.': 'Open a note to see which notes link to it.',
  'Buscando enlaces…': 'Looking for links…',
  'Ninguna nota enlaza a «{name}» todavía.': 'No notes link to “{name}” yet.',
  'Escribí {link} en otra nota para conectarlas.': 'Type {link} in another note to connect them.',

  // Paleta, selector y paneles de plugins
  'Buscar un comando…': 'Search for a command…',
  'Sin comandos para «{query}»': 'No commands for “{query}”',
  'Sin resultados para «{query}»': 'No results for “{query}”',
  'Elegí una opción…': 'Choose an option…',
  'Cerrar panel': 'Close panel',
  'El plugin «{id}» no arrancó': 'The plugin “{id}” didn’t start',
  'el plugin tardó demasiado en dibujar el bloque': 'the plugin took too long to draw the block',

  // Plugins internos: categorías
  Notas: 'Notes',
  Editor: 'Editor',
  Vista: 'View',

  // Notas diarias
  'Notas diarias': 'Daily notes',
  'Una nota por día en la carpeta «Diario», con plantilla opcional':
    'One note per day in the “Diario” folder, with an optional template',
  'Abrir la nota de hoy': "Open today's note",
  'Abrir la nota de ayer': "Open yesterday's note",
  'Abrir la nota de mañana': "Open tomorrow's note",
  'No se pudo abrir la nota del día': "Couldn't open the daily note",

  // Insertar fecha
  'Insertar fecha': 'Insert date',
  'Inserta la fecha (y hora) de hoy en el cursor desde la paleta':
    "Inserts today's date (and time) at the cursor from the palette",
  'Insertar fecha de hoy (YYYY-MM-DD)': "Insert today's date (YYYY-MM-DD)",
  'Insertar fecha y hora': 'Insert date and time',

  // Fórmulas y diagramas
  'Fórmulas matemáticas': 'Math formulas',
  'Dibuja fórmulas LaTeX ($…$ y $$…$$) con KaTeX en la vista previa':
    'Draws LaTeX formulas ($…$ and $$…$$) with KaTeX in the preview',
  'la fórmula tiene un error ({msg})': 'the formula has an error ({msg})',
  'Diagramas Mermaid': 'Mermaid diagrams',
  'Dibuja bloques ```mermaid (flujos, secuencias, Gantt…) en la vista previa':
    'Draws ```mermaid blocks (flowcharts, sequences, Gantt…) in the preview',
  'el diagrama tiene un error de sintaxis ({msg})': 'the diagram has a syntax error ({msg})',

  // Esquema
  Esquema: 'Outline',
  'Panel de esquema con los encabezados de la nota; salta al encabezado al hacer click':
    "Outline panel with the note's headings; click to jump to a heading",
  'Alternar panel de esquema': 'Toggle outline panel',
  'Sin encabezados en esta nota.': 'No headings in this note.',
  'Ir al encabezado': 'Go to heading',

  // Tiempo de lectura
  'Tiempo de lectura': 'Reading time',
  'Muestra el tiempo estimado de lectura de la nota en la barra de estado':
    "Shows the note's estimated reading time in the status bar",
  'Tiempo de lectura estimado (~{wpm} palabras/min)': 'Estimated reading time (~{wpm} words/min)',
  '{mins} min': '{mins} min',

  // Plantillas
  Plantillas: 'Templates',
  'Inserta notas de la carpeta «{dir}» con {fecha}, {hora} y {titulo}':
    'Inserts notes from the “{dir}” folder with {fecha}, {hora} and {titulo}',
  'Creá notas dentro de la carpeta «{dir}» para usarlas como plantillas.':
    'Create notes inside the “{dir}” folder to use them as templates.',
  'Elegí una plantilla…': 'Choose a template…',
  'Insertar plantilla…': 'Insert template…',
  'Nueva nota desde plantilla…': 'New note from template…',
  'No se pudo leer la plantilla': "Couldn't read the template",
  'No se pudo crear la nota': "Couldn't create the note"
}
