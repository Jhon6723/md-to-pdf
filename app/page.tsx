"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SAMPLE_MARKDOWN = `# Tarea 8.4 — Análisis Teórico de Optimización de Bases de Datos

**Estudiante:** Jhon Rivera  
**Proyecto:** Battle Tanks Multiplayer

---

## Punto 1 — Comparativa técnica de herramientas de benchmarking

### Lenguaje de scripting: k6 vs Artillery

La diferencia fundamental no es solo el lenguaje, sino el modelo mental de cada herramienta.

k6 escribe todo en JavaScript ejecutado por goja. Un solo archivo define el perfil de carga, el ciclo de vida del usuario virtual y los criterios de éxito. No hay configuración externa: el script es la prueba completa.

Artillery separa la configuración declarativa YAML del código JavaScript adicional. Esto facilita empezar, aunque fragmenta la prueba en varias piezas.

### Tabla resumen

| Criterio | k6 | Artillery | Ganador |
| --- | --- | --- | --- |
| Scripting | JavaScript puro, un solo archivo | YAML + processor JS | Empate |
| WebSocket | k6/ws nativo | Engine básico | k6 |
| Monitorización | InfluxDB nativo | StatsD + intermediario | k6 |

## Notas

- Este es un editor Markdown, no un editor visual enriquecido.
- El contenido se previsualiza como una página Carta con márgenes de una pulgada.
- La exportación produce PDF, no DOCX.
`;

export default function Home() {
  const [markdown, setMarkdown] = useState(SAMPLE_MARKDOWN);
  const [filename, setFilename] = useState("documento");
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPos = useRef<{ start: number; end: number } | null>(null);
  const dragCounter = useRef(0);

  const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|bmp)$/i;
  const MD_EXTENSIONS = /\.(md|markdown)$/i;

  const normalizedFilename = useMemo(() => {
    return filename.trim().replace(/\.(md|markdown|pdf)$/i, "") || "documento";
  }, [filename]);

  const imageUrls = useMemo(() => {
    const map: Record<string, string> = {};
    for (const img of images) {
      map[img.name] = URL.createObjectURL(img);
    }
    return map;
  }, [images]);

  useEffect(() => {
    const urls = Object.values(imageUrls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imageUrls]);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setMarkdown(text);
    setFilename(file.name.replace(/\.(md|markdown)$/i, "") || "documento");
    setError(null);
    event.target.value = "";
  }

  function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setImages((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      const fresh = files.filter((f) => !existing.has(f.name));
      return [...prev, ...fresh];
    });
    event.target.value = "";
  }

  function removeImage(name: string) {
    setImages((prev) => prev.filter((f) => f.name !== name));
  }

  function insertImageMarkdown(names: string[]) {
    const ta = textareaRef.current;
    const start = ta && cursorPos.current !== null ? cursorPos.current.start : markdown.length;
    const end = ta && cursorPos.current !== null ? cursorPos.current.end : markdown.length;
    const snippets = names.map((n) => `![${n.replace(/\.[^.]+$/, "")}](${n})`);
    const insert = snippets.join("\n\n");
    const before = markdown.slice(0, start);
    const after = markdown.slice(end);
    const needsNewlineBefore = before.length > 0 && !before.endsWith("\n");
    const needsNewlineAfter = after.length > 0 && !after.startsWith("\n");
    const next = `${needsNewlineBefore ? "\n\n" : ""}${insert}${needsNewlineAfter ? "\n\n" : ""}`;
    const newMarkdown = `${before}${next}${after}`;
    setMarkdown(newMarkdown);
    const newPos = start + next.length;
    cursorPos.current = { start: newPos, end: newPos };
    if (ta) {
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      });
    }
  }

  function addImageFiles(files: File[]) {
    const imageFiles = files.filter((f) => IMAGE_EXTENSIONS.test(f.name));
    if (imageFiles.length === 0) return;
    const freshNames = imageFiles.map((f) => f.name);
    setImages((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      const fresh = imageFiles.filter((f) => !existing.has(f.name));
      return [...prev, ...fresh];
    });
    insertImageMarkdown(freshNames);
  }

  async function loadMarkdownFile(file: File) {
    const text = await file.text();
    setMarkdown(text);
    setFilename(file.name.replace(MD_EXTENSIONS, "") || "documento");
    setError(null);
  }

  function handleDragEnter(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current += 1;
    if (event.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  async function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;

    const mdFiles = files.filter((f) => MD_EXTENSIONS.test(f.name));
    const imageFiles = files.filter((f) => IMAGE_EXTENSIONS.test(f.name));

    if (mdFiles.length > 0) {
      await loadMarkdownFile(mdFiles[0]);
    }
    if (imageFiles.length > 0) {
      addImageFiles(imageFiles);
    }
  }

  async function handleConvert() {
    setConverting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("markdown", markdown);
      formData.append("filename", normalizedFilename);
      for (const img of images) {
        formData.append("images", img, img.name);
      }

      const res = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Error del servidor (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${normalizedFilename}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido al convertir");
    } finally {
      setConverting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f0f0f0] text-[#202124]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dadce0] bg-white px-6 py-4 shadow-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#5f6368]">Google Docs PDF Copy</p>
          <h1 className="mt-1 text-xl font-normal text-[#1f1f1f]">Markdown a plantilla básica de Google Docs</h1>
          <p className="mt-1 text-sm text-[#5f6368]">
            Editor y vista previa estilo documento nuevo, con exportación única a PDF
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,text/markdown"
            className="hidden"
            onChange={handleFileUpload}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp,image/bmp,.png,.jpg,.jpeg,.gif,.svg,.webp,.bmp"
            multiple
            className="hidden"
            onChange={handleImageUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full border border-[#dadce0] bg-white px-4 py-2 text-sm font-medium text-[#1a73e8] hover:bg-[#f8fbff]"
          >
            Cargar .md
          </button>
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="rounded-full border border-[#dadce0] bg-white px-4 py-2 text-sm font-medium text-[#1a73e8] hover:bg-[#f8fbff]"
          >
            Agregar imágenes
          </button>
          <label className="sr-only" htmlFor="document-name">
            Nombre del archivo
          </label>
          <input
            id="document-name"
            type="text"
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            placeholder="nombre-archivo"
            className="w-44 rounded-md border border-[#dadce0] bg-white px-3 py-2 text-sm outline-none focus:border-[#1a73e8] focus:ring-2 focus:ring-[#d2e3fc]"
          />
          <button
            type="button"
            onClick={handleConvert}
            disabled={converting || markdown.trim() === ""}
            className="rounded-full bg-[#0b57d0] px-5 py-2 text-sm font-medium text-white hover:bg-[#0842a0] disabled:cursor-not-allowed disabled:bg-[#c7c7c7]"
          >
            {converting ? "Convirtiendo..." : "Descargar PDF"}
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-[#f9dedc] bg-[#fce8e6] px-6 py-3 text-sm text-[#b3261e]">
          {error}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]">
        <section
          className="relative flex min-h-[60vh] flex-col border-b border-[#dadce0] bg-white xl:border-b-0 xl:border-r"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="flex items-center justify-between border-b border-[#dadce0] px-4 py-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#5f6368]">Editor Markdown</p>
              <p className="mt-1 text-xs text-[#80868b]">Escribe o carga un archivo Markdown</p>
            </div>
            <span className="rounded-full bg-[#e9eefc] px-3 py-1 text-xs text-[#1a73e8]">Markdown</span>
          </div>
          <textarea
            ref={textareaRef}
            value={markdown}
            onChange={(event) => {
              setMarkdown(event.target.value);
              cursorPos.current = { start: event.target.selectionStart, end: event.target.selectionEnd };
              if (error) setError(null);
            }}
            onSelect={(event) => {
              const ta = event.currentTarget;
              cursorPos.current = { start: ta.selectionStart, end: ta.selectionEnd };
            }}
            onKeyUp={(event) => {
              cursorPos.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
            }}
            onClick={(event) => {
              cursorPos.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
            }}
            spellCheck={false}
            className="min-h-[40vh] flex-1 resize-none bg-white p-4 font-mono text-sm leading-6 text-[#1f1f1f] outline-none selection:bg-[#d2e3fc]"
            placeholder="# Escribe aquí tu markdown..."
          />
          {images.length > 0 && (
            <div className="border-t border-[#dadce0] px-4 py-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#5f6368]">
                Imágenes adjuntas ({images.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {images.map((img) => (
                  <span
                    key={img.name}
                    className="inline-flex items-center gap-2 rounded-full border border-[#dadce0] bg-[#f8f9fa] px-3 py-1 text-xs text-[#1f1f1f]"
                  >
                    {img.name}
                    <button
                      type="button"
                      onClick={() => removeImage(img.name)}
                      className="text-[#5f6368] hover:text-[#b3261e]"
                      aria-label={`Quitar ${img.name}`}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-[#80868b]">
                Referencia cada imagen en el Markdown por su nombre, por ejemplo: !&#91;alt&#93;(foto.png)
              </p>
            </div>
          )}
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[#1a73e8]/10 backdrop-blur-sm">
              <div className="rounded-2xl border-2 border-dashed border-[#1a73e8] bg-white px-10 py-6 text-center shadow-lg">
                <p className="text-base font-medium text-[#1a73e8]">Suelta tus archivos aquí</p>
                <p className="mt-1 text-xs text-[#5f6368]">Imágenes o Markdown</p>
              </div>
            </div>
          )}
        </section>

        <section className="flex min-h-[60vh] flex-col bg-[#f0f0f0]">
          <div className="flex items-center justify-between border-b border-[#dadce0] bg-[#f8f9fa] px-4 py-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#5f6368]">Vista previa</p>
              <p className="mt-1 text-xs text-[#80868b]">Carta, márgenes de 1 pulgada, Arial 11 pt</p>
            </div>
            <span className="rounded-full bg-[#e6f4ea] px-3 py-1 text-xs text-[#137333]">Documento</span>
          </div>
          <div className="flex flex-1 justify-center overflow-y-auto px-4 py-6 md:px-8">
            <article className="gdocs-page">
              <div className="gdocs-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    img: ({ src, alt }) => {
                      const srcStr = typeof src === "string" ? src : "";
                      const basename = srcStr.split("/").pop() || srcStr;
                      const objectUrl = imageUrls[basename];
                      if (objectUrl) {
                        return (
                          <img src={objectUrl} alt={alt} />
                        );
                      }
                      return (
                        <span style={{ fontStyle: "italic", color: "#5f6368" }}>
                          Imagen no encontrada: {alt || srcStr}
                        </span>
                      );
                    },
                  }}
                >
                  {markdown}
                </ReactMarkdown>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
