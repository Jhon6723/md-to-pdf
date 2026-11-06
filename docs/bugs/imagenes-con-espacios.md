# Imágenes con espacios en el nombre no aparecen en el preview ni en el PDF

## Síntoma

Al adjuntar una imagen cuyo nombre contiene espacios (por ejemplo, una captura de pantalla llamada "Captura desde 2026-10-09 16-02-14.png"), la referencia insertada en el editor se mostraba como texto literal en el preview y en el PDF en lugar de la imagen, o se mostraba el marcador "Imagen no encontrada".

## Causa

Dos problemas independientes:

1. Sintaxis inválida al insertar. La función insertImageMarkdown en `app/page.tsx` generaba ![alt](nombre) con el nombre de archivo crudo. Un destino de imagen en CommonMark no puede contener espacios salvo que se encierre entre ángulos, por ejemplo ![alt](<mi foto.png>), así que tanto ReactMarkdown en el preview como remark en el servidor interpretaban el texto literalmente.

2. Claves inconsistentes al buscar la imagen. Aun con sintaxis válida (destino entre ángulos o codificado en porcentajes), el servidor y el preview buscaban la imagen con claves distintas a las usadas al registrarla:
   - En `app/api/convert/route.ts`, los archivos subidos se indexaban con sanitizeImageName (basename y caracteres especiales reemplazados por guion bajo), mientras que el renderer buscaba con path.basename(url) sin decodificar ni sanear. Un nombre con espacios nunca coincidía.
   - En `app/page.tsx`, el mapa de object URLs se indexaba con el nombre crudo del archivo, pero el src que entrega hast ya viene normalizado con codificación de porcentajes (espacios como %20), por lo que la búsqueda por basename tampoco coincidía.

## Solución

Se creó el módulo compartido `lib/image-names.ts` con dos funciones:

- imageKey: normaliza cualquier referencia (nombre crudo, ruta con carpetas, URL codificada en porcentajes) a una clave única: decodifica porcentajes, extrae el basename y reemplaza secuencias de caracteres fuera de [A-Za-z0-9_.-] por un guion bajo.
- imageMarkdown: genera la referencia Markdown escapando corchetes en el texto alternativo y usando destino entre ángulos cuando el nombre contiene espacios o paréntesis (o codificación de porcentajes si contiene <, > o saltos de línea).

`app/page.tsx` usa imageMarkdown al insertar referencias, indexa el mapa de object URLs por imageKey(img.name), deduplica archivos por imageKey y resuelve el src del preview con imageKey. `app/api/convert/route.ts` eliminó sanitizeImageName y usa imageKey tanto para indexar las imágenes subidas como para resolver las URL del Markdown.

## Verificación

Las pruebas automatizadas en `scripts/test-pdf.mjs` cubren:

- imageKey produce la misma clave para el nombre crudo, la forma codificada en porcentajes y una ruta con carpetas, y no lanza errores con porcentajes malformados.
- imageMarkdown genera sintaxis que remark parsea como nodo image y cuya URL normalizada coincide con la clave del archivo.
- El componente img del preview recibe el src normalizado de hast y lo resuelve con imageKey.
- El renderer genera #image con la clave correcta para las formas entre ángulos y codificada, y el documento compila con Typst.

Ejecutar:

```sh
npm run test:pdf
npm run typecheck
```

También se verificó una petición real al endpoint /api/convert subiendo un PNG con espacios en el nombre; el PDF resultante embebe la imagen.

## Limitaciones

- Dos nombres que solo difieren en caracteres especiales (por ejemplo "mi foto.png" y "mi_foto.png") producen la misma clave normalizada; el cliente deduplica por esa clave para evitar colisiones silenciosas en el servidor, pero ambas no pueden coexistir como imágenes distintas.
- Las URLs remotas (http/https) no se embeben en el PDF; siguen mostrando el marcador de posición.
