# Política de seguridad

Geode guarda notas personales, claves de API cifradas y un token de GitHub. Nos tomamos la seguridad en serio y agradecemos los reportes responsables.

## Versiones con soporte

| Versión | Soporte |
|---|---|
| 0.8.x (última) | Sí |
| Anteriores | No: actualizá a la última versión |

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Usá el [reporte privado de vulnerabilidades de GitHub](https://github.com/chewax/geode/security/advisories/new) (pestaña *Security* → *Report a vulnerability*).

Incluí, si podés:

- Qué componente está afectado (main, preload, renderer, plugins, sync…).
- Pasos para reproducirlo o una prueba de concepto.
- El impacto que ves (lectura de archivos, ejecución de código, filtración de tokens…).
- Versión de Geode y sistema operativo.

## Qué podés esperar

- **Acuse de recibo** en un plazo de 5 días hábiles.
- Una **evaluación inicial** y un plan en un plazo de 14 días.
- Te avisamos cuando el arreglo esté publicado y, si querés, te damos crédito en el aviso de seguridad.

## Modelo de seguridad

Para orientar tu análisis, estas son las garantías que Geode busca dar:

- **Renderer aislado:** `contextIsolation` activado, sin `nodeIntegration`, sandbox de Chromium y una CSP estricta (sin `unsafe-eval`). El renderer solo accede a las funciones expuestas en `window.geode`.
- **Rutas dentro de la bóveda:** el proceso main valida todas las rutas recibidas por IPC y rechaza las que salen de la carpeta de la bóveda.
- **Plugins aislados:** cada plugin externo corre en un iframe de origen opaco, sin red y sin acceso a `window.geode`; se comunica solo por un `MessagePort`. El HTML que devuelve se sanea con DOMPurify.
- **Vista previa saneada:** el Markdown se convierte a HTML y se sanea antes de mostrarse.
- **Secretos cifrados:** el token de GitHub y la clave de OpenRouter se guardan con `safeStorage` del sistema operativo.

Cualquier forma de romper alguna de estas garantías es un reporte valioso.

## Fuera de alcance

- Ataques que requieren acceso físico o una cuenta de usuario ya comprometida en la computadora.
- Contenido malicioso dentro de una bóveda que la persona abre a sabiendas, siempre que no logre escapar del sandbox.
- Vulnerabilidades en dependencias sin un vector de explotación real en Geode (igual podés avisarnos para actualizarlas).
