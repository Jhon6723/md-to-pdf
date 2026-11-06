import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import ts from "typescript";
import { unified } from "unified";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = path.join(ROOT, "app", "api", "convert", "route.ts");
const LOCAL_TYPST = path.join(ROOT, "bin", process.platform === "win32" ? "typst.exe" : "typst");
const TYPST_BIN = existsSync(LOCAL_TYPST) ? LOCAL_TYPST : "typst";

let renderer;
let imageNames;
let moduleDir;
let workDir;

const ctx = { images: new Set() };

function compile(doc, name) {
  const typPath = path.join(workDir, `${name}.typ`);
  const pdfPath = path.join(workDir, `${name}.pdf`);
  writeFileSync(typPath, doc);
  const result = spawnSync(TYPST_BIN, ["compile", ...renderer.TYPST_FONT_ARGS, typPath, pdfPath], {
    cwd: workDir,
    timeout: 30_000,
    encoding: "utf-8",
  });
  assert.equal(result.status, 0, `typst compile failed: ${result.stderr}`);
  assert.doesNotMatch(result.stderr, /unknown font family/i, result.stderr);
  return pdfPath;
}

function pagesFor(doc, name, markers) {
  const result = {};
  for (const { label, text } of markers) {
    const rule = `#show "${text}": it => context [#metadata(here().page())#it]`;
    const typPath = path.join(workDir, `${name}-${label}.typ`);
    writeFileSync(typPath, `${rule}\n${doc}`);
    const out = execFileSync(TYPST_BIN, ["query", ...renderer.TYPST_FONT_ARGS, typPath, "metadata", "--field", "value"], {
      cwd: workDir,
      encoding: "utf-8",
      timeout: 30_000,
    });
    const values = JSON.parse(out);
    result[label] = (Array.isArray(values) ? values : [values]).map((v) => Number(v));
  }
  return result;
}

before(async () => {
  moduleDir = mkdtempSync(path.join(ROOT, ".table-tests-"));
  workDir = mkdtempSync(path.join(tmpdir(), "table-tests-"));
  const imageNamesSrc = readFileSync(path.join(ROOT, "lib", "image-names.ts"), "utf8");
  const imageNamesOut = ts.transpileModule(imageNamesSrc, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  writeFileSync(path.join(moduleDir, "image-names.mjs"), imageNamesOut);
  const src = readFileSync(ROUTE, "utf8")
    .replace('import { NextRequest, NextResponse } from "next/server";',
      "class NextRequest {}\nclass NextResponse {\n  static json() { return null; }\n}")
    .replace('from "@/lib/image-names"', 'from "./image-names.mjs"');
  const { outputText } = ts.transpileModule(
    src + "\nexport { createTypstDocument, markdownToTypstBody, TYPST_FONT_ARGS };\n",
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }
  );
  writeFileSync(path.join(moduleDir, "renderer.mjs"), outputText);
  renderer = await import(pathToFileURL(path.join(moduleDir, "renderer.mjs")).href);
  imageNames = await import(pathToFileURL(path.join(moduleDir, "image-names.mjs")).href);
});

after(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  if (moduleDir) rmSync(moduleDir, { recursive: true, force: true });
});

const SCREENSHOT_TABLE = `| Herramienta | Aplicación en el caso | Justificación |
| --- | --- | --- |
| React.memo | Componentes presentacionales, especialmente EmployeeAnalytics y EmployeeCard | Permite omitir renders provocados por el padre cuando las props conservan sus valores y referencias. Para EmployeeAnalytics era la solución principal al render innecesario. |
| useCallback | Manejadores pasados como props, como la selección del empleado | Mantiene estable la referencia de la función mientras no cambien sus dependencias, permitiendo que la comparación de props de memo sea útil. |
| useMemo | Filtrado y ordenamiento de EmployeeList, puntuación de EmployeeCard y cálculos de EmployeeAnalytics | Conserva resultados calculados mientras no cambien sus dependencias. Es útil cuando el componente sí necesita renderizar por otra razón. |`;

test("screenshot table compiles and uses measured minimum layout", () => {
  const body = renderer.markdownToTypstBody(SCREENSHOT_TABLE, ctx);
  assert.match(body, /#layout\(size => \{/);
  assert.match(body, /let minimums = \(calc\.max\(0pt, measure\(\[#strong\[Herramienta\]\]\)\.width/);
  assert.match(body, /React\\\.memo/);
  assert.doesNotMatch(body, /breakable:/);
  compile(renderer.createTypstDocument(SCREENSHOT_TABLE, ctx), "screenshot");
});

test("table after tall spacer starts on current page and continues on next page", () => {
  const preamble = renderer.createTypstDocument("", ctx);
  const body = renderer.markdownToTypstBody(SCREENSHOT_TABLE, ctx);
  const doc = `${preamble}\n#v(480pt)\n${body}`;
  const pages = pagesFor(doc, "short-table", [
    { label: "first", text: "React.memo" },
    { label: "last", text: "useMemo" },
  ]);
  assert.deepEqual(pages.first, [1]);
  assert.deepEqual(pages.last, [2]);
});

test("long table still splits and repeats its header", () => {
  const rows = Array.from({ length: 80 }, (_, i) => `| fila${i + 1} | valor${i + 1} | detalle${i + 1} |`).join("\n");
  const table = `| Col A | Col B | Col C |\n| --- | --- | --- |\n${rows}`;
  const doc = renderer.createTypstDocument(table, ctx);
  const pages = pagesFor(doc, "long-table", [
    { label: "hdr", text: "Col A" },
    { label: "first", text: "fila1" },
    { label: "last", text: "fila80" },
  ]);
  assert.ok(pages.first.length > 0, "first-row marker not found");
  assert.ok(pages.last.length > 0, "last-row marker not found");
  const firstPage = Math.min(...pages.first);
  const lastPage = Math.max(...pages.last);
  assert.ok(lastPage > firstPage, `expected split, got first=${firstPage} last=${lastPage}`);
  const expectedHeaderPages = Array.from({ length: lastPage - firstPage + 1 }, (_, i) => firstPage + i);
  assert.deepEqual([...new Set(pages.hdr)].sort((a, b) => a - b), expectedHeaderPages);
});

test("edge-case tables compile", () => {
  const cases = {
    "header-only": `| Solo |\n| --- |`,
    "empty-cells": `| A | B |\n| --- | --- |\n|  |  |\n| x |  |`,
    "all-empty": `|  |  |\n| --- | --- |\n|  |  |`,
    "escapes": `| Col_#1 | Precio$ |\n| --- | --- |\n| a\\*b | 50% y \\[corchete\\] |`,
    "formats": `| **Negrita** | Codigo |\n| --- | --- |\n| *cursiva* y **fuerte** | \`const valor = 42;\` |`,
  };
  for (const [name, markdown] of Object.entries(cases)) {
    compile(renderer.createTypstDocument(markdown, ctx), `edge-${name}`);
  }
});

test("markup after inline code expressions cannot glue into them", () => {
  const cases = [
    "Ruta parsers/__init__.py al final.",
    "**negrita**.py y *cursiva*.ext",
    "**negrita**(sufijo) y `codigo`.py",
    "[enlace](https://example.com).txt siguiente",
    "![f](foto.png).nota",
  ];
  for (const md of cases) {
    const doc = renderer.createTypstDocument(md, ctx);
    assert.doesNotMatch(doc, /\]\.py|\]\(sufijo/, `unguarded continuation in ${doc}`);
    compile(doc, `glue-${cases.indexOf(md)}`);
  }
});

test("bundled fonts work without system fonts", () => {
  const fontFiles = [
    "LiberationSans-Regular.ttf",
    "LiberationSans-Bold.ttf",
    "LiberationSans-Italic.ttf",
    "LiberationSans-BoldItalic.ttf",
    "LICENSE.txt",
  ];
  for (const file of fontFiles) {
    assert.ok(existsSync(path.join(ROOT, "assets", "fonts", "liberation-sans", file)), `missing bundled asset ${file}`);
  }
  const fonts = execFileSync(TYPST_BIN, ["fonts", ...renderer.TYPST_FONT_ARGS, "--variants"], {
    encoding: "utf-8",
    timeout: 30_000,
  });
  assert.match(fonts, /Liberation Sans/);
  assert.match(fonts, /DejaVu Sans Mono/);
  const doc = renderer.createTypstDocument(
    "# Tipografía reproducible\n\nNormal áéíóú ñ ü. **Negrita** *Cursiva* ***Ambas***\n\n`const valor = 42;`\n\n```js\nconst saludo = 'Hola';\n```",
    ctx
  );
  assert.match(doc, /font: "Liberation Sans"/);
  assert.match(doc, /#show raw: set text\(font: "DejaVu Sans Mono"\)/);
  compile(doc, "fonts");
});

test("imageKey normalizes names, paths and percent-encoding", () => {
  const { imageKey } = imageNames;
  const expected = "Captura_desde_2026-10-09_16-02-14.png";
  assert.equal(imageKey("Captura desde 2026-10-09 16-02-14.png"), expected);
  assert.equal(imageKey("Captura%20desde%202026-10-09%2016-02-14.png"), expected);
  assert.equal(imageKey("carpeta/Captura desde 2026-10-09 16-02-14.png"), expected);
  assert.equal(imageKey("foto.png"), "foto.png");
  assert.doesNotThrow(() => imageKey("%E0%A4%A.png"));
});

test("imageMarkdown produces parseable image syntax", () => {
  const { imageKey, imageMarkdown } = imageNames;
  const processor = unified().use(remarkParse);
  for (const name of ["foto.png", "Captura desde 2026-10-09 16-02-14.png", "foto (1).png", "a[b].png"]) {
    const tree = processor.runSync(processor.parse(imageMarkdown(name)));
    const child = tree.children[0].children[0];
    assert.equal(tree.children[0].children.length, 1, name);
    assert.equal(child.type, "image", name);
    assert.equal(imageKey(child.url), imageKey(name), `${name} -> ${child.url}`);
  }
  assert.equal(imageMarkdown("foto.png"), "![foto](foto.png)");
});

test("preview img lookup resolves the hast src", () => {
  const { imageKey } = imageNames;
  const spaced = "Captura desde 2026-10-09 16-02-14.png";
  const expected = "Captura_desde_2026-10-09_16-02-14.png";
  for (const md of [`![C](<${spaced}>)`, "![C](Captura%20desde%202026-10-09%2016-02-14.png)"]) {
    const html = renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        {
          remarkPlugins: [remarkGfm],
          components: { img: ({ src }) => createElement("i", null, imageKey(String(src))) },
        },
        md
      )
    );
    assert.ok(html.includes(expected), `${md} -> ${html}`);
  }
});

test("PDF rendering resolves spaced image names", () => {
  const { imageKey, imageMarkdown } = imageNames;
  const name = "Captura desde 2026-10-09 16-02-14.png";
  const key = imageKey(name);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  writeFileSync(path.join(workDir, key), png);
  const imgCtx = { images: new Set([key]) };
  for (const md of [imageMarkdown(name), "![C](Captura%20desde%202026-10-09%2016-02-14.png)"]) {
    const body = renderer.markdownToTypstBody(md, imgCtx);
    assert.ok(body.includes(`#image("${key}")`), `${md} -> ${body}`);
    assert.ok(!body.includes("Imagen no encontrada"), `${md} -> ${body}`);
    compile(renderer.createTypstDocument(md, imgCtx), "image-spaces");
  }
});
