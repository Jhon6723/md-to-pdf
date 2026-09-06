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
- Configuración de página: tamaño Carta, márgenes de 1 pulgada, Arial 11 pt para texto normal e interlineado 1.15.
- Tablas: ancho completo del área útil, bordes negros de 1 pt, encabezado blanco y columnas con anchos proporcionales al contenido máximo. No usar columnas rígidamente iguales porque Google Docs adapta el ancho al texto de cada tabla.
- Si Arial no está disponible en el entorno de conversión, Typst puede usar un fallback tipográfico compatible. No asumir que Arial exacto existe hasta validarlo en el entorno actual.
- El preview web replica visualmente la página Carta centrada y los estilos principales, sin clonar toda la interfaz de Google Docs.

## Modos de conversión

La SPA ofrece un selector con dos modos:

- `Conversión normal`: genera un PDF directo del Markdown con la plantilla de Google Docs.
- `Trabajo universitario`: antepone una portada de página completa antes del cuerpo del documento.

### Portada universitaria

- La portada usa una página Carta completa con márgenes cero, un banner superior azul con el nombre del curso, el título del trabajo, la imagen de portada, los campos de estudiante/profesor/fecha y una barra inferior con el branding de Jala University.
- Después de la portada se inserta un `#pagebreak()` explícito y el cuerpo del Markdown vuelve a los márgenes de 1 pulgada.
- Los campos editables en la SPA son: curso, título del trabajo, nombre del estudiante, nombre del profesor y fecha.
- La imagen de portada es opcional. Si el usuario no carga una, se usa la ilustración local por defecto en `assets/cover-illustration.svg`.
- El branding de Jala University se toma de `assets/jala-university-brand.svg`.
- La imagen de portada personalizada debe ser PNG, JPEG o WebP y no superar 5 MB.

### API

`POST /api/convert` acepta:

- JSON para conversión normal y universitaria sin imagen personalizada.
- Multipart form data cuando se carga una imagen de portada personalizada.

Campos:

- `markdown` (obligatorio, no vacío, máximo 2 MB).
- `filename` (opcional).
- `mode` (`normal` por defecto, o `university`).
- `courseTitle`, `assignmentTitle`, `studentName`, `professorName`, `coverDate` (solo modo universitario).
- `coverImage` (archivo multipart, solo modo universitario, opcional).

## Alcance funcional

- Funciones esenciales: escribir Markdown, cargar archivos md, previsualizar, elegir nombre de archivo y descargar PDF.
- No añadir operaciones LaTeX, exportación DOCX, Pandoc, búsqueda/reemplazo ni editor enriquecido visual salvo que el usuario cambie el alcance.

## Comandos de verificación

Typecheck:

```sh
npm run typecheck
```

Build:

```sh
npm run build
```

Prueba manual de la API:

```sh
npm run start &
curl -X POST http://localhost:3000/api/convert \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Titulo\n\nTexto","filename":"test"}' -o test.pdf
file test.pdf
```

## Git commit convention

- Write every commit message in English.
- Use the Conventional Commits format: type(scope): imperative summary.
- Use one of these types when applicable: feat, fix, docs, refactor, test, chore, build, ci, perf, or style.
- Keep the subject concise, use the imperative mood, and target 72 characters or fewer when practical.
- Add an optional body when context is needed, focusing on why the change was made and any relevant implementation details.
- Do not include AI tool attribution, Co-Authored-By, or Generated with lines.
