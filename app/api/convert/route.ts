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

const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024;
const CONVERSION_TIMEOUT_MS = 30_000;
const EXE = process.platform === "win32" ? ".exe" : "";
const LOCAL_TYPST = path.join(process.cwd(), "bin", `typst${EXE}`);
const TYPST_BIN = existsSync(LOCAL_TYPST) ? LOCAL_TYPST : "typst";
const ASSETS_DIR = path.join(process.cwd(), "assets");
const DEFAULT_COVER_IMAGE = path.join(ASSETS_DIR, "cover-illustration.svg");
const UNIVERSITY_BRAND_IMAGE = path.join(ASSETS_DIR, "jala-university-brand.svg");
const COVER_IMAGE_EXTENSIONS = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
]);

type DocumentMode = "normal" | "university";

type CoverFields = {
  courseTitle: string;
  assignmentTitle: string;
  studentName: string;
  professorName: string;
  coverDate: string;
};

type CoverImageInput = {
  extension: string;
  data: Buffer;
};

type ConversionRequest = {
  markdown: string;
  filename: string;
  mode: DocumentMode;
  cover: CoverFields | null;
  coverImage: CoverImageInput | null;
};

const DEFAULT_COVER: CoverFields = {
  courseTitle: "Programación 6",
  assignmentTitle: "Tarea semana 8",
  studentName: "Jhon Rivera",
  professorName: "Jair Alarcon",
  coverDate: "06 de agosto 2026",
};

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

function isSafeImageSource(source: string): boolean {
  if (!source || /[\x00-\x1f\s]/u.test(source)) return false;
  try {
    const url = new URL(source);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return !source.includes("..") && !path.isAbsolute(source);
  }
}

function renderInline(nodes: PhrasingContent[]): string {
  return nodes.map(renderInlineNode).join("");
}

function renderInlineNode(node: PhrasingContent): string {
  switch (node.type) {
    case "text":
      return escapeTypstText(node.value);
    case "emphasis":
      return `#emph[${renderInline(node.children)}]`;
    case "strong":
      return `#strong[${renderInline(node.children)}]`;
    case "delete":
      return `#strike[${renderInline(node.children)}]`;
    case "inlineCode":
      return `#raw("${escapeTypstString(node.value)}")`;
    case "link":
      return renderLink(node.children, node.url);
    case "image":
      return `#emph[Imagen no embebida: ${escapeTypstText(node.alt ?? node.url) }]`;
    case "break":
      return `#linebreak()\n`;
    case "footnoteReference":
      return `#super[${escapeTypstText(node.identifier)}]`;
    default:
      return "children" in node ? renderInline(node.children as PhrasingContent[]) : "";
  }
}

function renderLink(children: PhrasingContent[], url: string): string {
  const label = renderInline(children) || escapeTypstText(url);
  if (!isSafeImageSource(url)) return `#underline[${label}]`;
  const target = escapeTypstUrl(url);
  return `#link("${target}")[#text(fill: rgb("1a73e8"))[#underline[${label}]]]`;
}

const HEADING_SIZES = ["20pt", "16pt", "14pt", "13pt", "12pt", "11pt"];

function renderBlock(node: RootContent): string {
  switch (node.type) {
    case "paragraph":
      return `#par[${renderInline(node.children)}]\n\n`;
    case "heading": {
      const depth = Math.min(Math.max(node.depth, 1), 6);
      const spaceBefore = depth === 1 ? "1.55em" : "1.35em";
      const spaceAfter = depth === 1 ? "0.8em" : "0.7em";
      return `#v(${spaceBefore}, weak: true)\n#block(width: 100%, breakable: false)[#text(size: ${HEADING_SIZES[depth - 1]}, weight: "bold")[${renderInline(node.children)}]]\n#v(${spaceAfter}, weak: true)\n`;
    }
    case "blockquote":
      return `#pad(left: 18pt)[#text(fill: rgb("5f6368"))[${renderBlocks(node.children).trim()}]]\n\n`;
    case "list":
      return renderList(node);
    case "code":
      return renderCodeBlock(node.value, node.lang ?? null);
    case "table":
      return renderTable(node);
    case "thematicBreak":
      return `#line(length: 100%, stroke: 0.8pt + rgb("dadce0"))\n#v(1.1em)\n`;
    default:
      return "";
  }
}

function renderBlocks(nodes: RootContent[]): string {
  return nodes.map(renderBlock).join("");
}

function renderCodeBlock(value: string, lang: string | null): string {
  const language = lang ? `, lang: "${escapeTypstUrl(lang)}"` : "";
  const lines = value
    .split("\n")
    .map((line) => `#raw("${escapeTypstString(line)}", block: false${language})`)
    .join("\n#linebreak()\n");
  return `#block(fill: rgb("f1f3f4"), inset: 10pt, radius: 4pt, width: 100%, breakable: true)[#text(font: ("DejaVu Sans Mono", "Courier New", "Liberation Mono"), size: 9.5pt)[${lines}]]\n\n`;
}

function renderList(list: List): string {
  const items = list.children.map((item) => `[${renderListItem(item)}]`).join(",\n");
  const nesting = list.ordered ? "enum" : "list";
  return `#${nesting}(\n${items}\n)\n\n`;
}

function renderListItem(item: ListItem): string {
  const blocks = item.children.map((child) => {
    if (child.type === "list") return renderList(child).trim();
    return renderBlock(child).trim();
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

function renderTable(table: Table): string {
  const columnCount = table.children[0]?.children.length ?? 1;
  const columnWidths = tableColumnWidths(table, columnCount);
  const [header, ...body] = table.children;
  const headerCells = header ? header.children.map((cell) => `[#strong[${renderInline(cell.children as PhrasingContent[])}]]`).join(", ") : "";
  const bodyCells = body.map((row) => renderTableRow(row)).join(" ");
  const headerArgument = header ? `  table.header(${headerCells}),\n` : "";
  return `#table(\n  columns: ${columnWidths},\n  stroke: 1pt + black,\n  inset: (x: 8pt, y: 7pt),\n  fill: white,\n${headerArgument}${bodyCells}\n)\n#v(0.85em, weak: true)\n\n`;
}

function renderTableRow(row: TableRow): string {
  return row.children.map((cell) => renderTableCell(cell)).join(" ");
}

function renderTableCell(cell: TableCell): string {
  return `[${renderInline(cell.children as PhrasingContent[])}],`;
}

function markdownToTypstBody(markdown: string): string {
  const processor = unified().use(remarkParse).use(remarkGfm);
  const tree = processor.parse(markdown) as Root;
  const transformed = processor.runSync(tree) as Root;
  return renderBlocks(transformed.children);
}

function coverText(value: string, bold = false): string {
  const safeValue = escapeTypstText(value.trim());
  return bold ? `#strong[${safeValue}]` : safeValue;
}

function createUniversityCover(cover: CoverFields, coverImageName: string): string {
  return `#block(width: 8.5in, height: 11in, inset: 0pt)[
  #place(top + center, dy: 0.28in)[
    #box(width: 7.95in, height: 0.43in, fill: rgb("3051d5"), radius: 3pt)[
      #align(center + horizon)[#text(fill: white, weight: "bold")[${coverText(cover.courseTitle)}]]
    ]
  ]
  #place(top + center, dy: 0.95in)[
    #align(center)[${coverText(cover.assignmentTitle, true)}]
  ]
  #place(top + center, dy: 1.48in)[
    #image("${coverImageName}", width: 2.15in, height: 2.15in, fit: "contain")
  ]
  #place(top + center, dy: 4.05in)[
    #stack(
      spacing: 0.22in,
      dir: ttb,
      align(center)[Presented by:],
      align(center)[${coverText(cover.studentName)}],
      align(center)[#strong[Profesor:]],
      align(center)[${coverText(cover.professorName)}],
      align(center)[#strong[Fecha:]],
      align(center)[${coverText(cover.coverDate)}],
    )
  ]
  #place(bottom + center, dy: -0.32in)[
    #box(width: 7.95in, height: 0.43in, fill: rgb("3051d5"), radius: 3pt)[
      #align(center + horizon)[#image("jala-university-brand.svg", height: 0.38in, fit: "contain")]
    ]
  ]
]
#pagebreak()
`;
}

function createTypstDocument(markdown: string, mode: DocumentMode, cover: CoverFields | null, coverImageName: string): string {
  const body = markdownToTypstBody(markdown);
  const coverContent = mode === "university" && cover ? createUniversityCover(cover, coverImageName) : "";
  return `#set page(
  paper: "us-letter",
  margin: ${mode === "university" ? "(top: 0pt, right: 0pt, bottom: 0pt, left: 0pt)" : "(top: 1in, right: 1in, bottom: 1in, left: 1in)"}
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

${coverContent}#set page(
  paper: "us-letter",
  margin: (top: 1in, right: 1in, bottom: 1in, left: 1in)
)

${body}`;
}

function validateMarkdown(markdown: string): void {
  if (markdown.trim() === "") {
    throw new ConvertError(400, "El cuerpo debe incluir 'markdown' como texto no vacío");
  }
  if (Buffer.byteLength(markdown, "utf-8") > MAX_MARKDOWN_BYTES) {
    throw new ConvertError(413, "El contenido supera el límite de 2 MB");
  }
}

function parseMode(value: unknown): DocumentMode {
  return value === "university" ? "university" : "normal";
}

function parseCoverField(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  return value.trim().slice(0, 120);
}

function parseCoverFields(values: Record<string, unknown>): CoverFields {
  return {
    courseTitle: parseCoverField(values.courseTitle, DEFAULT_COVER.courseTitle),
    assignmentTitle: parseCoverField(values.assignmentTitle, DEFAULT_COVER.assignmentTitle),
    studentName: parseCoverField(values.studentName, DEFAULT_COVER.studentName),
    professorName: parseCoverField(values.professorName, DEFAULT_COVER.professorName),
    coverDate: parseCoverField(values.coverDate, DEFAULT_COVER.coverDate),
  };
}

async function parseCoverImage(value: FormDataEntryValue | null): Promise<CoverImageInput | null> {
  if (!(value instanceof File) || value.size === 0) return null;
  const extension = COVER_IMAGE_EXTENSIONS.get(value.type);
  if (!extension) {
    throw new ConvertError(400, "La imagen de portada debe ser PNG, JPG o WebP");
  }
  if (value.size > MAX_COVER_IMAGE_BYTES) {
    throw new ConvertError(413, "La imagen de portada supera el límite de 5 MB");
  }
  const buffer = Buffer.from(await value.arrayBuffer());
  return { extension, data: buffer };
}

async function parseRequest(req: NextRequest): Promise<ConversionRequest> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const markdownValue = form.get("markdown");
    if (typeof markdownValue !== "string") {
      throw new ConvertError(400, "El cuerpo debe incluir 'markdown' como texto no vacío");
    }
    validateMarkdown(markdownValue);
    const mode = parseMode(form.get("mode"));
    const filenameValue = form.get("filename");
    return {
      markdown: markdownValue,
      filename: typeof filenameValue === "string" ? sanitizeFilename(filenameValue) : "documento",
      mode,
      cover: mode === "university" ? parseCoverFields(Object.fromEntries(form.entries())) : null,
      coverImage: mode === "university" ? await parseCoverImage(form.get("coverImage")) : null,
    };
  }

  const body = (await req.json().catch(() => null)) as {
    markdown?: unknown;
    filename?: unknown;
  } & Record<string, unknown> | null;

  if (!body || typeof body.markdown !== "string") {
    throw new ConvertError(400, "El cuerpo debe incluir 'markdown' como texto no vacío");
  }
  validateMarkdown(body.markdown);
  const mode = parseMode(body.mode);

  return {
    markdown: body.markdown,
    filename: typeof body.filename === "string" ? sanitizeFilename(body.filename) : "documento",
    mode,
    cover: mode === "university" ? parseCoverFields(body) : null,
    coverImage: null,
  };
}

export async function POST(req: NextRequest) {
  let workDir: string | null = null;

  try {
    const { markdown, filename, mode, cover, coverImage } = await parseRequest(req);
    workDir = await mkdtemp(path.join(tmpdir(), "gdocs-copy-"));
    const inputPath = path.join(workDir, "document.typ");
    const outputPath = path.join(workDir, "output.pdf");
    let coverImageName = "cover-illustration.svg";

    if (mode === "university" && cover) {
      const brandData = await readFile(UNIVERSITY_BRAND_IMAGE);
      await writeFile(path.join(workDir, "jala-university-brand.svg"), brandData);
      if (coverImage) {
        coverImageName = `cover${coverImage.extension}`;
        await writeFile(path.join(workDir, coverImageName), coverImage.data);
      } else {
        await writeFile(path.join(workDir, coverImageName), await readFile(DEFAULT_COVER_IMAGE));
      }
    }

    await writeFile(inputPath, createTypstDocument(markdown, mode, cover, coverImageName), "utf-8");

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
