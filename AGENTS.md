<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Proyecto: google-docx-copy

SPA en Next.js para editar Markdown, previsualizarlo con apariencia de documento nuevo de Google Docs y exportar únicamente a PDF.

## Dependencias externas

- Typst se descarga automáticamente al directorio `bin/` del proyecto mediante el script de postinstalación ubicado en `scripts/install-binaries.mjs`. No se necesitan permisos de administrador ni instalación manual.
- Si el binario no está en el directorio local, la API busca Typst en el PATH del sistema como fallback.
- Pandoc no forma parte de esta aplicación; Markdown se transforma a Typst directamente desde su AST.

Para omitir la descarga automática del binario:

```sh
SKIP_BIN_DOWNLOAD=1 npm install
```

## Plantilla de salida

- La salida PDF usa estilos generados en el código Typst basados en un documento nuevo de Google Docs.
- Configuración de página: tamaño Carta, márgenes de 1 pulgada, Liberation Sans 11 pt para texto normal e interlineado 1.15. Liberation Sans es métricamente compatible con Arial, aunque su diseño visual no es idéntico.
- Tablas: ancho completo del área útil, bordes negros de 1 pt, encabezado blanco y columnas con anchos proporcionales al contenido máximo. No usar columnas rígidamente iguales porque Google Docs adapta el ancho al texto de cada tabla.
- Cada columna reserva un ancho mínimo medido con Typst: el ancho de la palabra más larga del texto plano (medida en negrita), los fragmentos de código en línea completos (inseparables) y el relleno interno de las celdas; el espacio restante se reparte con los pesos proporcionales. Si los mínimos no caben en la página, se escalan proporcionalmente.
- Las tablas que no caben completas en el espacio restante de la página se dividen y continúan en la página siguiente repitiendo su encabezado, sin dejar huecos en blanco.
- Las fuentes no dependen del sistema operativo: Liberation Sans (regular, negrita, cursiva y negrita-cursiva, versión 2.1.5 de fonts-liberation) se redistribuye en `assets/fonts/liberation-sans/` junto con su licencia SIL OFL 1.1 en LICENSE.txt. Typst compila con ese directorio como font-path e ignora las fuentes del sistema para una salida determinista. El código en línea y los bloques de código usan explícitamente DejaVu Sans Mono, que ya viene embebida en el binario de Typst.
- La traza de salida del build incluye el binario de Typst y las fuentes empaquetadas para la ruta /api/convert, de modo que el despliegue tampoco dependa de fuentes ni binarios del sistema.
- El preview web replica visualmente la página Carta centrada y los estilos principales, sin clonar toda la interfaz de Google Docs.

## Imágenes

- El editor inserta referencias con imageMarkdown: nombres simples quedan como ![alt](foto.png) y los nombres con espacios o paréntesis usan destino entre ángulos, por ejemplo ![alt](<mi foto.png>), que es sintaxis válida de CommonMark.
- El endpoint `/api/convert` acepta `multipart/form-data` con los campos `markdown` (texto), `filename` (texto) y `images` (archivos, múltiples).
- Las imágenes se escriben en el directorio temporal donde se compila Typst, por lo que Typst las resuelve por nombre de archivo.
- El renderer normaliza la URL de la imagen en el Markdown con la función compartida imageKey de `lib/image-names.ts` (decodifica porcentajes, extrae el basename y reemplaza secuencias de caracteres fuera de [A-Za-z0-9_.-] por guion bajo) y la compara con la clave normalizada de cada imagen subida. Si coincide, genera `#image("nombre_clave.png")`; si no, muestra un texto de marcador.
- Las URLs remotas (http/https) no se embeben; se muestran como marcador de posición.
- Validaciones: máximo 20 imágenes, 5 MB por imagen, extensiones png, jpg, jpeg, gif, svg, webp, bmp. Los nombres se normalizan con imageKey (basename + reemplazo de caracteres especiales) para evitar path traversal y colisiones.
- El preview web usa object URLs (`URL.createObjectURL`) indexados por imageKey(img.name). El componente `img` de ReactMarkdown intercepta el `src` (que llega codificado en porcentajes desde hast) y lo resuelve con el mismo imageKey.

## Alcance funcional

- Funciones esenciales: escribir Markdown, cargar archivos md, adjuntar imágenes, previsualizar, elegir nombre de archivo y descargar PDF.
- No añadir operaciones LaTeX, exportación DOCX, Pandoc, búsqueda/reemplazo ni editor enriquecido visual salvo que el usuario cambie el alcance.

## Comandos de verificación

Typecheck:

```sh
npm run typecheck
```

Pruebas de PDF (tablas, fuentes e imágenes, usan Typst real):

```sh
npm run test:pdf
```

Build:

```sh
npm run build
```

Prueba manual de la API (sin imágenes):

```sh
npm run start &
curl -X POST http://localhost:3000/api/convert \
  -F "markdown=# Titulo" \
  -F "filename=test" \
  -o test.pdf
file test.pdf
```

Prueba manual de la API (con imágenes):

```sh
curl -X POST http://localhost:3000/api/convert \
  -F "markdown=# Demo\n\n![logo](logo.png)" \
  -F "filename=test" \
  -F "images=@logo.png" \
  -o test.pdf
file test.pdf
```

## Git commit convention

- Write every commit message in English.
- Use the Conventional Commits format: type(scope): imperative summary.
- Use one of these types when applicable: feat, fix, docs, refactor, test, chore, build, ci, perf, or style.
- Keep the subject concise, use the imperative mood, and target 72 characters or fewer when practical.
- Add an optional body when context is needed, focusing on why the change was made and any relevant implementation details.
- Do not include AI tool attribution, Co-Authored-By, or Generated with lines.
