import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { NextRequest, NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

type Root = import("mdast").Root;
type RootContent = import("mdast").RootContent;
type PhrasingContent = import("mdast").PhrasingContent;
type List = import("mdast").List;
type ListItem = import("mdast").ListItem;
type Table = import("mdast").Table;
type TableRow = import("mdast").TableRow;
type TableCell = import("mdast").TableCell;
type Image = import("mdast").Image;

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 20;
const CONVERSION_TIMEOUT_MS = 30_000;
const EXE = process.platform === "win32" ? ".exe" : "";
const LOCAL_TYPST = path.join(process.cwd(), "bin", `typst${EXE}`);
const TYPST_BIN = existsSync(LOCAL_TYPST) ? LOCAL_TYPST : "typst";
const ALLOWED_IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp)$/i;

class ConvertError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/\.(md|markdown|pdf)$/i, "");
  const safe = base.replace(/[^a-zA-Z0-9áéíóúñüÁÉÍÓÚÑÜ._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || "documento";
}

function sanitizeImageName(name: string): string {
  return path.basename(name).replace(/[^\w.-]+/g, "_");
}

function escapeTypstText(value: string): string {
  return value.replace(/([\\#*_`$=<>\[\]{}\/@-])/g, "\\$1");
}

function escapeTypstString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function escapeTypstUrl(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isSafeUrl(value: string): boolean {
  if (!value || /[\x00-\x1f\s]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return !value.includes("..") && !path.isAbsolute(value);
  }
}

type RenderContext = {
  images: Set<string>;
};

function renderInline(nodes: PhrasingContent[], ctx: RenderContext): string {
  return nodes.map((node) => renderInlineNode(node, ctx)).join("");
}

function renderInlineNode(node: PhrasingContent, ctx: RenderContext): string {
  switch (node.type) {
    case "text":
      return escapeTypstText(node.value);
    case "emphasis":
      return `#emph[${renderInline(node.children, ctx)}]`;
    case "strong":
      return `#strong[${renderInline(node.children, ctx)}]`;
    case "delete":
      return `#strike[${renderInline(node.children, ctx)}]`;
    case "inlineCode":
      return `#raw("${escapeTypstString(node.value)}")`;
    case "link":
      return renderLink(node.children, node.url, ctx);
    case "image":
      return renderInlineImage(node, ctx);
    case "break":
      return `#linebreak()\n`;
    case "footnoteReference":
      return `#super[${escapeTypstText(node.identifier)}]`;
    default:
      return "children" in node ? renderInline(node.children as PhrasingContent[], ctx) : "";
  }
}

function renderLink(children: PhrasingContent[], url: string, ctx: RenderContext): string {
  const label = renderInline(children, ctx) || escapeTypstText(url);
  if (!isSafeUrl(url)) return `#underline[${label}]`;
  const target = escapeTypstUrl(url);
  return `#link("${target}")[#text(fill: rgb("1a73e8"))[#underline[${label}]]]`;
}

function renderInlineImage(node: Image, ctx: RenderContext): string {
  const basename = path.basename(node.url);
  if (ctx.images.has(basename)) {
    return `#image("${escapeTypstUrl(basename)}")`;
  }
  return `#emph[Imagen no encontrada: ${escapeTypstText(node.alt ?? node.url)}]`;
}

function renderBlockImage(node: Image, ctx: RenderContext): string {
  const basename = path.basename(node.url);
  if (ctx.images.has(basename)) {
    return `#block[#image("${escapeTypstUrl(basename)}")]\n#v(0.5em)\n\n`;
  }
  return `#emph[Imagen no encontrada: ${escapeTypstText(node.alt ?? node.url)}]\n\n`;
}

const HEADING_SIZES = ["20pt", "16pt", "14pt", "13pt", "12pt", "11pt"];

function renderBlock(node: RootContent, ctx: RenderContext): string {
  switch (node.type) {
    case "paragraph": {
      if (node.children.length === 1 && node.children[0].type === "image") {
        return renderBlockImage(node.children[0], ctx);
      }
      return `#par[${renderInline(node.children, ctx)}]\n\n`;
    }
    case "heading": {
      const depth = Math.min(Math.max(node.depth, 1), 6);
      const spaceBefore = depth === 1 ? "2.2em" : "1.8em";
      const spaceAfter = depth === 1 ? "1.6em" : "1.3em";
      return `#block(width: 100%, breakable: false, above: ${spaceBefore}, below: ${spaceAfter})[#text(size: ${HEADING_SIZES[depth - 1]}, weight: "bold")[${renderInline(node.children, ctx)}]]\n`;
    }
    case "blockquote":
      return `#pad(left: 18pt)[#text(fill: rgb("5f6368"))[${renderBlocks(node.children, ctx).trim()}]]\n\n`;
    case "list":
      return renderList(node, ctx);
    case "code":
      return renderCodeBlock(node.value, node.lang ?? null);
    case "table":
      return renderTable(node, ctx);
    case "thematicBreak":
      return `#line(length: 100%, stroke: 0.8pt + rgb("dadce0"))\n#v(1.1em)\n`;
    default:
      return "";
  }
}

function renderBlocks(nodes: RootContent[], ctx: RenderContext): string {
  return nodes.map((node) => renderBlock(node, ctx)).join("");
}

function renderCodeBlock(value: string, lang: string | null): string {
  const language = lang ? `, lang: "${escapeTypstUrl(lang)}"` : "";
  return `#block(fill: rgb("f1f3f4"), inset: 10pt, radius: 4pt, width: 100%)[#text(font: ("DejaVu Sans Mono", "Courier New", "Liberation Mono"), size: 9.5pt)[#raw("${escapeTypstString(value)}", block: true${language})]]\n\n`;
}

function renderList(list: List, ctx: RenderContext): string {
  const items = list.children.map((item) => `[${renderListItem(item, ctx)}]`).join(",\n");
  const nesting = list.ordered ? "enum" : "list";
  return `#${nesting}(\n${items}\n)\n\n`;
}

function renderListItem(item: ListItem, ctx: RenderContext): string {
  const blocks = item.children.map((child) => {
    if (child.type === "list") return renderList(child, ctx).trim();
    return renderBlock(child, ctx).trim();
  }).filter(Boolean);
  return blocks.join("\n");
}

function inlinePlainText(nodes: PhrasingContent[]): string {
  return nodes.map((node) => {
    if ("value" in node) return node.value;
    if ("children" in node) return inlinePlainText(node.children as PhrasingContent[]);
    return "";
  }).join("");
}

function tableColumnWidths(table: Table, columnCount: number): string {
  const lengths = Array.from({ length: columnCount }, () => 1);
  for (const row of table.children) {
    row.children.forEach((cell, index) => {
      const length = inlinePlainText(cell.children as PhrasingContent[]).length;
      lengths[index] = Math.max(lengths[index], length);
    });
  }
  return `(${lengths.map((length) => `${Math.min(Math.max(length / 9, 1), 4).toFixed(2)}fr`).join(", ")},)`;
}

function renderTable(table: Table, ctx: RenderContext): string {
  const columnCount = table.children[0]?.children.length ?? 1;
  const columnWidths = tableColumnWidths(table, columnCount);
  const [header, ...body] = table.children;
  const headerCells = header ? header.children.map((cell) => `[#strong[${renderInline(cell.children as PhrasingContent[], ctx)}]]`).join(", ") : "";
  const bodyCells = body.map((row) => renderTableRow(row, ctx)).join(" ");
  const headerArgument = header ? `  table.header(${headerCells}),\n` : "";
  return `#table(\n  columns: ${columnWidths},\n  stroke: 1pt + black,\n  inset: (x: 8pt, y: 7pt),\n  fill: white,\n${headerArgument}${bodyCells}\n)\n#v(0.85em, weak: true)\n\n`;
}

function renderTableRow(row: TableRow, ctx: RenderContext): string {
  return row.children.map((cell) => renderTableCell(cell, ctx)).join(" ");
}

function renderTableCell(cell: TableCell, ctx: RenderContext): string {
  return `[${renderInline(cell.children as PhrasingContent[], ctx)}],`;
}

function markdownToTypstBody(markdown: string, ctx: RenderContext): string {
  const processor = unified().use(remarkParse).use(remarkGfm);
  const tree = processor.parse(markdown) as Root;
  const transformed = processor.runSync(tree) as Root;
  return renderBlocks(transformed.children, ctx);
}

function createTypstDocument(markdown: string, ctx: RenderContext): string {
  const body = markdownToTypstBody(markdown, ctx);
  return `#set page(
  paper: "us-letter",
  margin: (top: 1in, right: 1in, bottom: 1in, left: 1in)
)
#set text(
  font: ("Arial", "Liberation Sans", "DejaVu Sans"),
  size: 11pt,
  fill: black,
  lang: "es"
)
#set par(
  leading: 0.65em,
  spacing: 1.25em,
  justify: false
)
#show link: underline
#set heading(numbering: none)

${body}`;
}

async function parseRequest(req: NextRequest): Promise<{
  markdown: string;
  filename: string;
  images: Map<string, File>;
}> {
  const formData = await req.formData();
  const markdown = formData.get("markdown");
  const filename = formData.get("filename");

  if (typeof markdown !== "string" || markdown.trim() === "") {
    throw new ConvertError(400, "El formulario debe incluir 'markdown' como texto no vacío");
  }
  if (Buffer.byteLength(markdown, "utf-8") > MAX_MARKDOWN_BYTES) {
    throw new ConvertError(413, "El contenido supera el límite de 2 MB");
  }

  const images = new Map<string, File>();
  const entries = formData.getAll("images");
  if (entries.length > MAX_IMAGES) {
    throw new ConvertError(400, `Se permiten máximo ${MAX_IMAGES} imágenes`);
  }
  for (const entry of entries) {
    if (!(entry instanceof File)) continue;
    if (!ALLOWED_IMAGE_EXT.test(entry.name)) continue;
    if (entry.size > MAX_IMAGE_BYTES) {
      throw new ConvertError(413, `La imagen "${entry.name}" supera el límite de 5 MB`);
    }
    images.set(sanitizeImageName(entry.name), entry);
  }

  const safeFilename = typeof filename === "string" ? sanitizeFilename(filename) : "documento";
  return { markdown, filename: safeFilename, images };
}

export async function POST(req: NextRequest) {
  let workDir: string | null = null;

  try {
    const { markdown, filename, images } = await parseRequest(req);
    workDir = await mkdtemp(path.join(tmpdir(), "gdocs-copy-"));
    const inputPath = path.join(workDir, "document.typ");
    const outputPath = path.join(workDir, "output.pdf");

    for (const [basename, file] of images) {
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(workDir, basename), buffer);
    }

    const ctx: RenderContext = { images: new Set(images.keys()) };
    await writeFile(inputPath, createTypstDocument(markdown, ctx), "utf-8");

    try {
      await execFileAsync(TYPST_BIN, ["compile", inputPath, outputPath], {
        cwd: workDir,
        timeout: CONVERSION_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch (err) {
      const stderr = err instanceof Error && "stderr" in err ? String((err as { stderr: unknown }).stderr) : "";
      throw new ConvertError(500, `Typst falló: ${stderr || "error desconocido"}`);
    }

    const output = await readFile(outputPath);
    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
        "Content-Length": String(output.byteLength),
      },
    });
  } catch (err) {
    if (err instanceof ConvertError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Error inesperado en /api/convert:", err);
    return NextResponse.json({ error: "Error interno al convertir el documento" }, { status: 500 });
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
