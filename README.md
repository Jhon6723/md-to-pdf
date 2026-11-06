# google-docx-copy

Aplicación web para escribir Markdown, previsualizarlo con la apariencia de un documento nuevo de Google Docs y exportarlo a PDF.

La conversión a PDF no usa Pandoc ni LaTeX: el servidor transforma el AST de Markdown directamente a código Typst y lo compila con el binario de Typst incluido en el proyecto, por lo que la salida es determinista y no depende de herramientas ni fuentes del sistema.

## Funciones

- Editor de Markdown con previsualización en vivo sobre una página tamaño Carta centrada, con los estilos principales de un documento nuevo de Google Docs.
- Carga de archivos .md existentes.
- Adjuntar imágenes y referenciarlas en el Markdown por su nombre de archivo; se embeben en el PDF.
- Elección del nombre del archivo de salida y descarga del PDF.
- Tablas con anchos proporcionales al contenido, encabezado repetido al dividirse entre páginas y bordes de 1 pt.
- Fuentes empaquetadas (Liberation Sans 2.1.5 para el texto, DejaVu Sans Mono para el código), con licencia incluida en `assets/fonts/liberation-sans/`.

## Requisitos

- Node.js 20 o superior.
- No se necesita instalar Typst manualmente: el script de postinstalación lo descarga a `bin/`.

## Uso

Instalar dependencias y arrancar el servidor de desarrollo:

```sh
npm install
npm run dev
```

La aplicación queda disponible en http://localhost:3000.

Para omitir la descarga del binario de Typst (por ejemplo, si ya está instalado en el sistema):

```sh
SKIP_BIN_DOWNLOAD=1 npm install
```

Si el binario no está en `bin/`, la API busca Typst en el PATH del sistema como alternativa.

Para producción:

```sh
npm run build
npm run start
```

## Cómo referenciar imágenes

Las imágenes se adjuntan con el botón de la interfaz y se referencian en el Markdown por nombre de archivo. El editor inserta la sintaxis correcta automáticamente: nombres simples quedan como ![alt](foto.png) y nombres con espacios o paréntesis usan destino entre ángulos, por ejemplo ![alt](<mi foto.png>), que es sintaxis válida de CommonMark.

Límites del endpoint de conversión: máximo 20 imágenes, 5 MB por imagen, extensiones png, jpg, jpeg, gif, svg, webp y bmp. Las URLs remotas (http/https) no se embeben y se muestran como marcador de posición.

## Arquitectura

- `app/page.tsx` — interfaz: editor, previsualización con ReactMarkdown y carga de imágenes con object URLs.
- `app/api/convert/route.ts` — endpoint POST que acepta multipart/form-data con los campos markdown, filename e images. Parsea el Markdown con remark y remark-gfm, genera un documento Typst y lo compila en un directorio temporal junto con las imágenes subidas.
- `lib/image-names.ts` — funciones compartidas imageKey (normalización de nombres de imagen) e imageMarkdown (generación de la referencia), usadas tanto por el cliente como por el servidor.
- `scripts/install-binaries.mjs` — postinstalación que descarga Typst 0.15.1 a `bin/` según la plataforma.
- `scripts/run-next.mjs` — wrapper para ejecutar Next.js con los ajustes necesarios por plataforma.
- `scripts/test-pdf.mjs` — pruebas que compilan documentos reales con Typst (tablas, fuentes empaquetadas, imágenes y escapes de markup).

## Scripts

```sh
npm run dev         # servidor de desarrollo
npm run build       # build de producción
npm run start       # servidor de producción
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run test:pdf    # pruebas de PDF con Typst real
```

## Alcance

El proyecto exporta únicamente a PDF. No incluye exportación DOCX, operaciones LaTeX, Pandoc, búsqueda/reemplazo ni edición enriquecida. Las decisiones de diseño y las convenciones del proyecto se documentan en `AGENTS.md`.
