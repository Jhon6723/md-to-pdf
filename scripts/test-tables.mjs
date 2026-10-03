import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = path.join(ROOT, "app", "api", "convert", "route.ts");
const LOCAL_TYPST = path.join(ROOT, "bin", process.platform === "win32" ? "typst.exe" : "typst");
const TYPST_BIN = existsSync(LOCAL_TYPST) ? LOCAL_TYPST : "typst";

let renderer;
let moduleDir;
let workDir;

const ctx = { images: new Set() };

function compile(doc, name) {
  const typPath = path.join(workDir, `${name}.typ`);
  const pdfPath = path.join(workDir, `${name}.pdf`);
  writeFileSync(typPath, doc);
  execFileSync(TYPST_BIN, ["compile", typPath, pdfPath], { cwd: workDir, timeout: 30_000 });
  return pdfPath;
}

function pagesFor(doc, name, markers) {
  const result = {};
  for (const { label, text } of markers) {
    const rule = `#show "${text}": it => context [#metadata(here().page())#it]`;
    const typPath = path.join(workDir, `${name}-${label}.typ`);
    writeFileSync(typPath, `${rule}\n${doc}`);
    const out = execFileSync(TYPST_BIN, ["query", typPath, "metadata", "--field", "value"], {
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
  const src = readFileSync(ROUTE, "utf8").replace(
    'import { NextRequest, NextResponse } from "next/server";',
    "class NextRequest {}\nclass NextResponse {\n  static json() { return null; }\n}"
  );
  const { outputText } = ts.transpileModule(
    src + "\nexport { createTypstDocument, markdownToTypstBody };\n",
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }
  );
  writeFileSync(path.join(moduleDir, "renderer.mjs"), outputText);
  renderer = await import(pathToFileURL(path.join(moduleDir, "renderer.mjs")).href);
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
  assert.match(body, /React\.memo/);
  assert.match(body, /breakable: measure\(content, width: size\.width\)\.height > size\.height/);
  compile(renderer.createTypstDocument(SCREENSHOT_TABLE, ctx), "screenshot");
});

test("short table after tall spacer stays on one page", () => {
  const preamble = renderer.createTypstDocument("", ctx);
  const body = renderer.markdownToTypstBody(SCREENSHOT_TABLE, ctx);
  const doc = `${preamble}\n#v(480pt)\n${body}`;
  const pages = pagesFor(doc, "short-table", [
    { label: "hdr", text: "Herramienta" },
    { label: "last", text: "useMemo" },
  ]);
  assert.deepEqual(pages.hdr, [2]);
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
