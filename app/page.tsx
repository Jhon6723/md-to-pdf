"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
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

type DocumentMode = "normal" | "university";

type CoverFields = {
  courseTitle: string;
  assignmentTitle: string;
  studentName: string;
  professorName: string;
  coverDate: string;
};

const DEFAULT_COVER: CoverFields = {
  courseTitle: "Programación 6",
  assignmentTitle: "Tarea semana 8",
  studentName: "Jhon Rivera",
  professorName: "Jair Alarcon",
  coverDate: "06 de agosto 2026",
};

type CoverImage = {
  file: File;
  url: string;
};

export default function Home() {
  const [markdown, setMarkdown] = useState(SAMPLE_MARKDOWN);
  const [filename, setFilename] = useState("documento");
  const [mode, setMode] = useState<DocumentMode>("normal");
  const [cover, setCover] = useState<CoverFields>(DEFAULT_COVER);
  const [coverImage, setCoverImage] = useState<CoverImage | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverImageInputRef = useRef<HTMLInputElement>(null);

  const normalizedFilename = useMemo(() => {
    return filename.trim().replace(/\.(md|markdown|pdf)$/i, "") || "documento";
  }, [filename]);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setMarkdown(text);
    setFilename(file.name.replace(/\.(md|markdown)$/i, "") || "documento");
    setError(null);
    event.target.value = "";
  }

  function handleCoverFieldChange(field: keyof CoverFields, value: string) {
    setCover((current) => ({ ...current, [field]: value }));
  }

  function handleCoverImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (coverImage) URL.revokeObjectURL(coverImage.url);
    setCoverImage({ file, url: URL.createObjectURL(file) });
    setError(null);
    event.target.value = "";
  }

  function resetCoverImage() {
    if (coverImage) URL.revokeObjectURL(coverImage.url);
    setCoverImage(null);
  }

  async function handleConvert() {
    setConverting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("markdown", markdown);
      formData.append("filename", normalizedFilename);
      formData.append("mode", mode);
      if (mode === "university") {
        Object.entries(cover).forEach(([field, value]) => formData.append(field, value));
        if (coverImage) formData.append("coverImage", coverImage.file, coverImage.file.name);
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
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full border border-[#dadce0] bg-white px-4 py-2 text-sm font-medium text-[#1a73e8] hover:bg-[#f8fbff]"
          >
            Cargar .md
          </button>
          <label className="sr-only" htmlFor="document-mode">
            Tipo de conversión
          </label>
          <select
            id="document-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as DocumentMode)}
            className="rounded-md border border-[#dadce0] bg-white px-3 py-2 text-sm outline-none focus:border-[#1a73e8] focus:ring-2 focus:ring-[#d2e3fc]"
          >
            <option value="normal">Conversión normal</option>
            <option value="university">Trabajo universitario</option>
          </select>
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

      <div className="grid flex-1 grid-cols-1 xl:grid-cols-[minmax(400px,0.88fr)_minmax(0,1.12fr)]">
        <section className="flex min-h-[60vh] flex-col border-b border-[#dadce0] bg-white xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between border-b border-[#dadce0] px-4 py-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#5f6368]">Editor Markdown</p>
              <p className="mt-1 text-xs text-[#80868b]">Escribe o carga un archivo Markdown</p>
            </div>
            <span className="rounded-full bg-[#e9eefc] px-3 py-1 text-xs text-[#1a73e8]">Markdown</span>
          </div>

          {mode === "university" && (
            <fieldset className="border-b border-[#dadce0] bg-[#f8fafd] px-4 py-4">
              <legend className="sr-only">Datos de portada universitaria</legend>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#1f1f1f]">Portada universitaria</h2>
                  <p className="mt-1 text-xs text-[#5f6368]">Estos campos se usan solo para la primera página</p>
                </div>
                <span className="rounded-full bg-[#e8f0fe] px-3 py-1 text-xs font-medium text-[#1a73e8]">
                  Jala University
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(
                  [
                    ["courseTitle", "Curso"],
                    ["assignmentTitle", "Tarea"],
                    ["studentName", "Estudiante"],
                    ["professorName", "Profesor"],
                  ] as [keyof CoverFields, string][]
                ).map(([field, label]) => (
                  <div key={field}>
                    <label htmlFor={`cover-${field}`} className="mb-1 block text-xs font-medium text-[#5f6368]">
                      {label}
                    </label>
                    <input
                      id={`cover-${field}`}
                      type="text"
                      value={cover[field]}
                      onChange={(event) => handleCoverFieldChange(field, event.target.value)}
                      className="w-full rounded-md border border-[#dadce0] bg-white px-3 py-2 text-sm outline-none focus:border-[#1a73e8] focus:ring-2 focus:ring-[#d2e3fc]"
                    />
                  </div>
                ))}
                <div>
                  <label htmlFor="cover-date" className="mb-1 block text-xs font-medium text-[#5f6368]">
                    Fecha
                  </label>
                  <input
                    id="cover-date"
                    type="text"
                    value={cover.coverDate}
                    onChange={(event) => handleCoverFieldChange("coverDate", event.target.value)}
                    className="w-full rounded-md border border-[#dadce0] bg-white px-3 py-2 text-sm outline-none focus:border-[#1a73e8] focus:ring-2 focus:ring-[#d2e3fc]"
                  />
                </div>
                <div>
                  <label htmlFor="cover-image" className="mb-1 block text-xs font-medium text-[#5f6368]">
                    Imagen de portada
                  </label>
                  <input
                    ref={coverImageInputRef}
                    id="cover-image"
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleCoverImageUpload}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => coverImageInputRef.current?.click()}
                      className="rounded-full border border-[#dadce0] bg-white px-3 py-2 text-xs font-medium text-[#1a73e8] hover:bg-[#f8fbff]"
                    >
                      Cambiar imagen
                    </button>
                    {coverImage && (
                      <button
                        type="button"
                        onClick={resetCoverImage}
                        className="rounded-full px-3 py-2 text-xs text-[#5f6368] hover:bg-[#f1f3f4]"
                      >
                        Restablecer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </fieldset>
          )}

          <textarea
            value={markdown}
            onChange={(event) => {
              setMarkdown(event.target.value);
              if (error) setError(null);
            }}
            spellCheck={false}
            className="min-h-[60vh] flex-1 resize-none bg-white p-4 font-mono text-sm leading-6 text-[#1f1f1f] outline-none selection:bg-[#d2e3fc]"
            placeholder="# Escribe aquí tu markdown..."
          />
        </section>

        <section className="flex min-h-[60vh] flex-col bg-[#f0f0f0]">
          <div className="flex items-center justify-between border-b border-[#dadce0] bg-[#f8f9fa] px-4 py-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#5f6368]">Vista previa</p>
              <p className="mt-1 text-xs text-[#80868b]">
                {mode === "university" ? "Portada + documento Carta" : "Carta, márgenes de 1 pulgada, Arial 11 pt"}
              </p>
            </div>
            <span className="rounded-full bg-[#e6f4ea] px-3 py-1 text-xs text-[#137333]">Documento</span>
          </div>
          <div className="flex flex-1 flex-col items-center gap-6 overflow-y-auto px-4 py-6 md:px-8">
            {mode === "university" && (
              <article className="gdocs-page relative overflow-hidden">
                <div className="px-[0.28in] pt-[0.28in]">
                  <div className="flex h-[0.42in] items-center justify-center rounded-md bg-[#3051d5] text-[11pt] font-bold text-white">
                    {cover.courseTitle}
                  </div>
                </div>
                <div className="flex h-[8.7in] flex-col items-center pt-[0.58in] text-[11pt] leading-[1.45]">
                  <p className="font-bold">{cover.assignmentTitle}</p>
                  <div className="mt-[0.32in] h-[2.15in] w-[2.15in]">
                    {coverImage ? (
                      <Image
                        src={coverImage.url}
                        alt="Imagen de portada"
                        width={166}
                        height={166}
                        unoptimized
                        className="h-full w-full object-fill"
                      />
                    ) : (
                      <Image
                        src="/cover-illustration.svg"
                        alt="Ilustración académica"
                        width={166}
                        height={166}
                        className="h-full w-full"
                      />
                    )}
                  </div>
                  <div className="mt-[0.3in] space-y-[0.18in]">
                    <p className="font-medium">Presented by:</p>
                    <p>{cover.studentName}</p>
                    <p className="font-bold">Profesor:</p>
                    <p>{cover.professorName}</p>
                    <p className="font-bold">Fecha:</p>
                    <p>{cover.coverDate}</p>
                  </div>
                </div>
                <div className="absolute inset-x-[0.28in] bottom-[0.32in] flex h-[0.43in] items-center justify-center rounded-md bg-[#3051d5]">
                  <Image
                    src="/jala-university-brand.svg"
                    alt="Jala University"
                    width={150}
                    height={38}
                    className="h-full w-auto"
                  />
                </div>
              </article>
            )}

            <article className="gdocs-page">
              <div className="gdocs-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
