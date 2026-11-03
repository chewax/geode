/**
 * Textos que llegaron con el merge de main: motores de IA por CLI, atajos
 * reasignables, memoria para IA (MCP) y el candado de la bóveda.
 */
export const merged: Record<string, string> = {
  // ── Barra de estado y avisos (App) ────────────────────────────────────────
  'Configurá la IA en Ajustes (⚙): elegí un motor y, si usás OpenRouter, la API key y el modelo.':
    'Set up AI in Settings (⚙): choose an engine and, if you use OpenRouter, the API key and model.',
  'Buscar en todas las notas ({key})': 'Search all notes ({key})',
  'Paleta de comandos ({key})': 'Command palette ({key})',
  'Crear versión ({key})': 'Create version ({key})',
  'Dividir a la derecha ({key})': 'Split right ({key})',
  'Negrita ({key})': 'Bold ({key})',
  'Cursiva ({key})': 'Italic ({key})',
  'Tachado ({key})': 'Strikethrough ({key})',
  'Código ({key})': 'Code ({key})',
  '«{name}»': '“{name}”',
  '{author} actualizó {names}.': '{author} updated {names}.',
  '{author} actualizó la bóveda.': '{author} updated the vault.',
  IA: 'AI',
  Programa: 'Program',
  Pago: 'Billing',
  'Tu suscripción': 'Your subscription',
  'El de {program}': '{program} default',
  'Dictado (OpenRouter)': 'Dictation (OpenRouter)',
  '{amount} gastado': '{amount} spent',

  // ── Ajustes → Inteligencia artificial ─────────────────────────────────────
  Atajos: 'Shortcuts',
  'Inteligencia artificial': 'Artificial intelligence',
  'Geode usa IA para nombrar tus versiones y en el asistente de escritura ({key}). Elegí con qué IA trabajar.':
    'Geode uses AI to name your versions and in the writing assistant ({key}). Choose which AI to work with.',
  Motor: 'Engine',
  'Motor de IA': 'AI engine',
  'Con tu API key. Pagás por uso y elegís entre cientos de modelos.':
    'With your API key. Pay as you go and pick from hundreds of models.',
  'Con {plan}, a través de {program}.': 'With {plan}, through {program}.',
  'Buscando…': 'Looking…',
  Instalado: 'Installed',
  'No instalado': 'Not installed',
  '{program} está instalado (versión {version}). Si todavía no iniciaste sesión, abrí una terminal y ejecutá:':
    '{program} is installed (version {version}). If you haven’t signed in yet, open a terminal and run:',
  '{program} está instalado. Si todavía no iniciaste sesión, abrí una terminal y ejecutá:':
    '{program} is installed. If you haven’t signed in yet, open a terminal and run:',
  'Para usar {name}, instalá {program} desde una terminal:': 'To use {name}, install {program} from a terminal:',
  'Después ejecutá {command}, iniciá sesión con tu cuenta y volvé acá.':
    'Then run {command}, sign in with your account and come back here.',
  'Geode usa el programa oficial: no ve ni guarda tu contraseña ni tus credenciales. El uso cuenta para los límites de {plan}.':
    'Geode uses the official program: it never sees or stores your password or credentials. Usage counts toward the limits of {plan}.',
  'No se pudo probar la conexión': "Couldn't test the connection",
  'Probando…': 'Testing…',
  'Probar conexión': 'Test connection',
  'Volver a buscar programas instalados': 'Look for installed programs again',
  'Apretá {key} desde cualquier lugar para empezar a dictar, y otra vez para terminar. Si Geode está al frente, el texto va donde está el cursor; si no, se agrega a tu nota de hoy. Usa tu clave de OpenRouter (cuesta centavos por minuto). El atajo se cambia en {link}.':
    'Press {key} from anywhere to start dictating, and again to finish. If Geode is in front, the text goes where the cursor is; otherwise it’s added to today’s note. It uses your OpenRouter key (it costs cents per minute). You can change the shortcut in {link}.',
  'El atajo global no se pudo registrar (puede que otra app lo use). Elegí otra combinación en {link}, o dictá desde la paleta de comandos: «Dictar».':
    'The global shortcut couldn’t be registered (another app may be using it). Choose another combination in {link}, or dictate from the command palette: “Dictate”.',
  'Ajustes → Atajos': 'Settings → Shortcuts',
  '{program} no entiende audio, así que el dictado sigue usando OpenRouter.':
    '{program} doesn’t understand audio, so dictation still uses OpenRouter.',
  'Ese motor no entiende audio, así que el dictado sigue usando OpenRouter.':
    'That engine doesn’t understand audio, so dictation still uses OpenRouter.',
  'API key de OpenRouter (para dictar)': 'OpenRouter API key (for dictation)',
  Copiado: 'Copied',
  'Copiar comando': 'Copy command',
  'No se pudo guardar el modelo': "Couldn't save the model",
  'El predeterminado de {program}': '{program} default',
  'Otro (escribir el nombre)…': 'Other (type the name)…',
  'p. ej. {example}': 'e.g. {example}',
  'Los alias apuntan siempre al último modelo de esa familia. {program} no tiene una lista de modelos para consultar, así que si querés uno puntual, elegí «Otro» y escribí su nombre.':
    'Aliases always point to the latest model in that family. {program} has no model list to look up, so if you want a specific one, choose “Other” and type its name.',
  '{program} no tiene una lista de modelos para consultar: dejá el predeterminado o escribí el nombre exacto (lo ves con /model dentro de {program}).':
    '{program} has no model list to look up: keep the default or type the exact name (you can see it with /model inside {program}).',

  // Motores por CLI (aiEngines)
  'tu suscripción a Claude (Pro o Max)': 'your Claude subscription (Pro or Max)',
  'tu suscripción a ChatGPT (Plus, Pro o Business)': 'your ChatGPT subscription (Plus, Pro or Business)',
  'tu cuenta de Google': 'your Google account',
  'Sonnet (equilibrado)': 'Sonnet (balanced)',
  'Opus (el más capaz)': 'Opus (most capable)',
  'Haiku (el más rápido)': 'Haiku (fastest)',
  Automático: 'Automatic',
  'Pro (el más capaz)': 'Pro (most capable)',
  'Flash (rápido)': 'Flash (fast)',
  'Flash-Lite (el más rápido)': 'Flash-Lite (fastest)',

  // ── Errores de IA en el proceso main ──────────────────────────────────────
  'Motor de IA desconocido': 'Unknown AI engine',
  'Ese nombre de modelo no es válido: usá solo letras, números, puntos y guiones.':
    'That model name isn’t valid: use only letters, numbers, dots and hyphens.',
  'Guardá una API key y elegí un modelo para probar OpenRouter.':
    'Save an API key and choose a model to test OpenRouter.',
  'OpenRouter respondió con tu API key.': 'OpenRouter answered with your API key.',
  'No encontramos {program} en tu computadora. Instalalo con «{install}» y volvé a probar en Ajustes → IA.':
    'We couldn’t find {program} on your computer. Install it with “{install}” and try again in Settings → AI.',
  '{program} no tiene una sesión iniciada. Abrí una terminal, ejecutá «{login}» e iniciá sesión con tu cuenta de {name}.':
    '{program} isn’t signed in. Open a terminal, run “{login}” and sign in with your {name} account.',
  'Llegaste al límite de uso de tu suscripción de {name}. Probá más tarde o elegí otro motor en Ajustes → IA.':
    'You reached the usage limit of your {name} subscription. Try later or choose another engine in Settings → AI.',
  '{program} tardó demasiado en responder. Probá de nuevo en un momento.':
    '{program} took too long to answer. Try again in a moment.',
  '{program} no pudo generar la respuesta. Podés escribir el texto a mano o probar otro motor en Ajustes → IA.':
    '{program} couldn’t generate the answer. You can write the text yourself or try another engine in Settings → AI.',
  '{program} respondió con el modelo {model}. Geode ya puede usar tu suscripción de {name}.':
    '{program} answered with the model {model}. Geode can now use your {name} subscription.',
  '{program} respondió. Geode ya puede usar tu suscripción de {name}.':
    '{program} answered. Geode can now use your {name} subscription.',
  'La bóveda está ocupada por otra operación; probá de nuevo en unos segundos':
    'The vault is busy with another operation; try again in a few seconds',

  // ── Ajustes → Atajos ──────────────────────────────────────────────────────
  'Atajos de teclado': 'Keyboard shortcuts',
  'Tocá un atajo y apretá la combinación nueva. Si una combinación no te anda (por ejemplo, porque otra app ya la usa), cambiala acá. Esc cancela.':
    'Click a shortcut and press the new combination. If a combination doesn’t work for you (for example, because another app already uses it), change it here. Esc cancels.',
  'En todo el sistema': 'System-wide',
  'En Geode': 'In Geode',
  'En el editor': 'In the editor',
  'No se pudo cambiar el atajo.': "Couldn't change the shortcut.",
  'Apretá la combinación nueva (Esc cancela)': 'Press the new combination (Esc cancels)',
  'Cambiar atajo': 'Change shortcut',
  'Apretá la combinación…': 'Press the combination…',
  'Volver a {key}': 'Reset to {key}',
  'Volver al atajo de fábrica': 'Reset to the default shortcut',
  'No se pudo activar este atajo (probablemente lo usa otra app). Elegí otra combinación.':
    'This shortcut couldn’t be turned on (another app probably uses it). Choose another combination.',
  'Los atajos globales funcionan aunque Geode no esté al frente. En Linux con Wayland puede que el sistema no los permita; en ese caso queda el comando «Dictar» de la paleta.':
    'Global shortcuts work even when Geode isn’t in front. On Linux with Wayland the system may not allow them; in that case you can still use the “Dictate” command in the palette.',
  'Pedirle a la IA': 'Ask the AI',
  Negrita: 'Bold',
  Cursiva: 'Italic',
  Tachado: 'Strikethrough',
  'Código en línea': 'Inline code',
  Espacio: 'Space',
  'Atajo desconocido.': 'Unknown shortcut.',
  'Esa combinación no se reconoce.': 'That combination isn’t recognized.',
  'Usá al menos Ctrl, Alt o Cmd: una tecla sola chocaría con la escritura.':
    'Use at least Ctrl, Alt or Cmd: a single key would get in the way of typing.',
  'Un atajo global necesita Ctrl, Alt o Cmd para no robarle teclas a otras apps.':
    'A global shortcut needs Ctrl, Alt or Cmd so it doesn’t steal keys from other apps.',
  'Esa combinación ya la usa «{name}». Cambiá esa primero.':
    'That combination is already used by “{name}”. Change that one first.',
  'El sistema no dejó usar esa combinación (probablemente la usa otra app). Probá con otra.':
    'The system didn’t allow that combination (another app probably uses it). Try another one.',

  // ── Ajustes → Memoria para IA (MCP) ───────────────────────────────────────
  Copiar: 'Copy',
  'Memoria para IA': 'Memory for AI',
  'Conectá Claude, Cursor u otro asistente compatible con MCP a esta bóveda para que la use como su memoria de largo plazo: puede buscar y leer tus notas, y guardar lo que valga la pena recordar.':
    'Connect Claude, Cursor or another MCP-compatible assistant to this vault so it can use it as its long-term memory: it can search and read your notes, and save what’s worth remembering.',
  'Todo lo que escribe la IA queda como una versión más en la línea de tiempo, con su nombre como autor: lo ves y lo deshacés como cualquier otro cambio. Si el respaldo en la nube está activo, se sube solo a GitHub y llega a tus otras computadoras. No usa tu API key de IA: no tiene costo.':
    'Everything the AI writes is saved as one more version in the timeline, with its name as the author: you can see it and undo it like any other change. If cloud backup is on, it’s uploaded to GitHub automatically and reaches your other computers. It doesn’t use your AI API key: it’s free.',
  'Cargando…': 'Loading…',
  'Abrí una bóveda para ver cómo conectarla.': 'Open a vault to see how to connect it.',
  'Claude Code (terminal)': 'Claude Code (terminal)',
  'Claude Desktop, Cursor y otros (JSON de configuración)': 'Claude Desktop, Cursor and others (configuration JSON)',
  'En Claude Desktop: Ajustes → Desarrollador → Editar configuración, y pegá el bloque {name} dentro de {key}. Reiniciá el asistente después.':
    'In Claude Desktop: Settings → Developer → Edit Config, and paste the {name} block inside {key}. Restart the assistant afterwards.',
  'Sirve la bóveda {vault}. Para otra bóveda, abrila y volvé a copiar.':
    'Serves the vault {vault}. For another vault, open it and copy again.',
  // Menú contextual del editor y notas enlazadas
  'Enlazado a «{name}», que ya existía.': 'Linked to “{name}”, which already existed.',
  'Crear nota enlazada': 'Create linked note',
  'Convierte la selección en un enlace [[…]] y crea esa nota': 'Turns the selection into a [[…]] link and creates that note',
  'Seleccioná una palabra o frase (de una sola línea) para crear una nota enlazada': 'Select a word or phrase (on a single line) to create a linked note',
  Cortar: 'Cut',
  Pegar: 'Paste',
  'Seleccionar todo': 'Select all'
}
